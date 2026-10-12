import { prisma } from '../../../../../lib/db/client.ts';
import { requireAuth } from '../../../../../lib/auth/guard.ts';
import { jsonResponse, errorResponse, getRequestId } from '../../../../../lib/api/response.ts';

/**
 * GET /api/v1/ingest/health — ringkasan "data saya ke mana?".
 *
 * Menjawab tiga pertanyaan tanpa membaca log worker:
 * 1. Tiap alat: tersimpan berapa, ditolak apa saja + alasannya, kapan terakhir terlihat.
 * 2. Pengirim tak dikenal (termasuk topik salah ketik) tampil di bagian unknownSenders.
 * 3. Peringatan bahasa awam bila ada pola bermasalah (mis. aktif tapi tanpa pasangan chamber).
 *
 * Sumber: tabel ingest_outcomes (ditulis worker per pesan, agregat per jam) +
 * sensor_readings 1 jam terakhir + metadata device/assignment.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    await requireAuth(request, ['VIEWER', 'ADMIN']);

    const url = new URL(request.url);
    const rawHours = Number(url.searchParams.get('hours') ?? '24');
    const windowHours = Math.min(Math.max(Number.isFinite(rawHours) ? Math.floor(rawHours) : 24, 1), 168);
    const now = new Date();
    const cutoff = new Date(now.getTime() - windowHours * 3_600_000);
    const oneHourAgo = new Date(now.getTime() - 3_600_000);

    const devices = await prisma.device.findMany({
      orderBy: { mqttDeviceId: 'asc' },
      include: {
        assignments: {
          where: { activeUntil: null },
          include: { chamber: { select: { code: true, name: true } } },
        },
      },
    });

    const outcomeRows = await prisma.ingestOutcome.groupBy({
      by: ['mqttDeviceId', 'outcome'],
      where: { windowStart: { gte: cutoff } },
      _sum: { count: true },
    });

    const recentRows = await prisma.sensorReading.groupBy({
      by: ['deviceId'],
      where: { receivedAt: { gte: oneHourAgo } },
      _count: { _all: true },
      _max: { receivedAt: true },
    });
    const recentByDevice = new Map<string, { count: number; lastAt: Date | null }>(
      recentRows.map((r) => [r.deviceId, { count: r._count._all, lastAt: r._max.receivedAt }])
    );

    const outcomesBySender = new Map<string, Record<string, number>>();
    for (const row of outcomeRows) {
      const entry = outcomesBySender.get(row.mqttDeviceId) ?? {};
      entry[row.outcome] = (entry[row.outcome] ?? 0) + (row._sum.count ?? 0);
      outcomesBySender.set(row.mqttDeviceId, entry);
    }

    const knownIds = new Set(devices.map((d) => d.mqttDeviceId));
    const totals = { stored: 0, rejected: 0, duplicate: 0, dropped: 0, errors: 0 };

    const deviceEntries = devices.map((d) => {
      const outcomes = outcomesBySender.get(d.mqttDeviceId) ?? {};
      const recent = recentByDevice.get(d.id);
      const stored1h = recent?.count ?? 0;
      const lastReceivedAt = recent?.lastAt ? recent.lastAt.toISOString() : null;
      const chamber = d.assignments[0]?.chamber ?? null;
      const seenRecently = d.lastSeenAt !== null && d.lastSeenAt.getTime() >= oneHourAgo.getTime();

      let rejected = 0;
      let unresolved = 0;
      for (const [outcome, count] of Object.entries(outcomes)) {
        if (outcome === 'stored' || outcome === 'stored_unresolved_time') {
          totals.stored += count;
        } else if (outcome === 'duplicate') {
          totals.duplicate += count;
        } else if (outcome.startsWith('rejected:')) {
          totals.rejected += count;
          rejected += count;
        } else if (outcome.startsWith('dropped:')) {
          totals.dropped += count;
        } else if (outcome.startsWith('error:')) {
          totals.errors += count;
        }
        if (outcome === 'stored_unresolved_time') {
          unresolved += count;
        }
      }

      const warnings: string[] = [];
      if (d.isActive && stored1h === 0) {
        warnings.push('Tidak ada data tersimpan 1 jam terakhir.');
      }
      if (seenRecently && !chamber) {
        warnings.push('Terlihat aktif tapi tanpa pasangan chamber. Pesan barunya ditolak.');
      }
      if (rejected > 0) {
        warnings.push(`Ada ${rejected} pesan ditolak ${windowHours} jam terakhir. Lihat rincian outcome.`);
      }
      if (unresolved > 0) {
        warnings.push(`Ada ${unresolved} data tanpa waktu ukur (tidak masuk grafik chamber).`);
      }

      return {
        mqttDeviceId: d.mqttDeviceId,
        name: d.name,
        isActive: d.isActive,
        connectionState: d.connectionState,
        connectionEvidence: d.connectionEvidence,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        activeChamber: chamber,
        storedLastHour: stored1h,
        lastReceivedAt,
        outcomes,
        warnings,
      };
    });

    const unknownSenders = [...outcomesBySender.entries()]
      .filter(([mqttDeviceId]) => !knownIds.has(mqttDeviceId))
      .map(([mqttDeviceId, outcomes]) => ({ mqttDeviceId, outcomes }));

    for (const sender of unknownSenders) {
      for (const [outcome, count] of Object.entries(sender.outcomes)) {
        if (outcome.startsWith('rejected:')) {
          totals.rejected += count;
        } else if (outcome === 'duplicate') {
          totals.duplicate += count;
        } else if (outcome.startsWith('dropped:')) {
          totals.dropped += count;
        } else if (outcome.startsWith('error:')) {
          totals.errors += count;
        } else {
          totals.stored += count;
        }
      }
    }

    return jsonResponse({
      generatedAt: now.toISOString(),
      windowHours,
      totals,
      devices: deviceEntries,
      unknownSenders,
    });
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}
