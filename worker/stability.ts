/**
 * Sweep kestabilan sesi (revisi pembimbing putaran 2 butir 9, lapisan worker).
 * Setiap jendela berjalan: sesi OPEN bersensor dievaluasi pada data 10 menit
 * terakhir (lib/stability.ts). Lolos seluruh ambang → notifikasi "warmup
 * stabil" untuk operator batch, sekali per sesi — idempotensi ditegakkan
 * unique (session_id, kind) di DB, bukan timer.
 */

import { prisma } from '../lib/db/client.ts';
import {
  STABILITY_WINDOW_MS,
  stabilityConditionFor,
  stabilityMetrics,
  isGasStable,
  isTempStable,
  isHumidityStable,
  type StabilityPoint,
} from '../lib/stability.ts';
import { logger } from '../lib/logging/logger.ts';

/** Nilai `kind` notifikasi kestabilan; sudah dipakai test db fase 1. */
export const WARMUP_STABLE_KIND = 'warmup_stable';
/** Pesan satu kalimat sesuai keputusan pembimbing, tanpa kode teknis. */
export const WARMUP_STABLE_MESSAGE = 'Sensor stabil, sesi siap dimulai';

/** Batas sesi yang dievaluasi per sweep (guard volume pada lab normal). */
const MAX_SESSIONS_PER_SWEEP = 20;

/**
 * Evaluasi semua sesi aktif dan buat notifikasi untuk sesi yang stabil.
 * Mengembalikan jumlah notifikasi yang baru dibuat. `now` disuntik agar
 * test dapat mengatur jendela.
 */
export async function sweepStableSessions(now: Date = new Date()): Promise<number> {
  const windowStart = new Date(now.getTime() - STABILITY_WINDOW_MS);
  const sessions = await prisma.measurementSession.findMany({
    where: { status: 'OPEN', chamberId: { not: null }, deviceId: { not: null } },
    take: MAX_SESSIONS_PER_SWEEP,
    orderBy: { createdAt: 'desc' },
    include: {
      group: { select: { storageCondition: true, coldStorageMode: true } },
      batch: { select: { operatorId: true } },
      notifications: {
        where: { kind: WARMUP_STABLE_KIND },
        select: { id: true },
      },
    },
  });

  let created = 0;
  for (const session of sessions) {
    // Sekali per sesi: notifikasi warmup stabil sudah pernah ada → lewati.
    if (session.notifications.length > 0) continue;

    const lower = windowStart.getTime() > session.startedAtUtc.getTime()
      ? windowStart
      : session.startedAtUtc;
    // session.chamberId & deviceId non-null karena where-filter { not: null }
    const chamberId = session.chamberId!;
    const deviceId = session.deviceId!;
    const readings = await prisma.sensorReading.findMany({
      where: {
        chamberId,
        deviceId,
        measurementTimeQuality: { in: ['SYNCED', 'RECONSTRUCTED'] },
        measuredAt: { gte: lower, lte: now },
      },
      select: {
        measuredAt: true,
        mq137Raw: true,
        mq136Raw: true,
        mq4Raw: true,
        temperatureC: true,
        humidityPercent: true,
      },
      orderBy: { measuredAt: 'asc' },
    });
    if (readings.length === 0) continue;

    const mq137: StabilityPoint[] = [];
    const mq136: StabilityPoint[] = [];
    const mq4: StabilityPoint[] = [];
    const temp: StabilityPoint[] = [];
    const humidity: StabilityPoint[] = [];
    for (const r of readings) {
      if (!r.measuredAt) continue;
      const atMs = r.measuredAt.getTime();
      if (r.mq137Raw !== null) mq137.push({ value: r.mq137Raw.toNumber(), atMs });
      if (r.mq136Raw !== null) mq136.push({ value: r.mq136Raw.toNumber(), atMs });
      if (r.mq4Raw !== null) mq4.push({ value: r.mq4Raw.toNumber(), atMs });
      if (r.temperatureC !== null) temp.push({ value: r.temperatureC.toNumber(), atMs });
      if (r.humidityPercent !== null) humidity.push({ value: r.humidityPercent.toNumber(), atMs });
    }

    const condition = stabilityConditionFor(
      session.group.storageCondition,
      session.group.coldStorageMode
    );
    const stable =
      isGasStable(stabilityMetrics(mq137), condition) &&
      isGasStable(stabilityMetrics(mq136), condition) &&
      isGasStable(stabilityMetrics(mq4), condition) &&
      isTempStable(temp, condition) &&
      isHumidityStable(humidity, condition);
    if (!stable) continue;

    // Penerima tunggal: operator batch yang memulai rangkaian sesi ini.
    // Unique (session_id, kind) melindungi dari penciptaan ganda.
    await prisma.notification.create({
      data: {
        userId: session.batch.operatorId,
        batchId: session.batchId,
        sessionId: session.sessionId,
        kind: WARMUP_STABLE_KIND,
        message: WARMUP_STABLE_MESSAGE,
      },
    });
    created++;
    logger.info({
      service: 'worker',
      operation: 'stability_sweep',
      outcome: 'notified',
      session_id: session.sessionId,
      batch_id: session.batchId,
    });
  }

  if (created > 0 || sessions.length > 0) {
    logger.debug({
      service: 'worker',
      operation: 'stability_sweep',
      outcome: 'done',
      sessions_seen: sessions.length,
      notified: created,
    });
  }
  return created;
}
