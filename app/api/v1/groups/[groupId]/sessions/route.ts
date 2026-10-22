import { prisma } from '../../../../../../lib/db/client.ts';
import { requireAuth, verifyCsrfAndOrigin } from '../../../../../../lib/auth/guard.ts';
import { jsonResponse, errorResponse, getRequestId } from '../../../../../../lib/api/response.ts';
import { parseIsoDate } from '../../../../../../lib/api/validation.ts';
import { conflict, notFound, validationError } from '../../../../../../lib/api/errors.ts';
import {
  buildSessionId,
  parseTimepointCode,
  timepointToElapsedHours,
  isNextTimepoint,
} from '../../../../../../shared/dataset.ts';
import { serializeSession, parseBoundedNumber, parsePositiveNumber } from '../../../../../../lib/api/dataset.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    verifyCsrfAndOrigin(request);
    await requireAuth(request, ['ADMIN']);
    const { groupId } = await context.params;

    const group = await prisma.sampleGroup.findUnique({
      where: { groupId },
      include: { batch: true, sessions: { select: { timepointCode: true } } },
    });
    if (!group) {
      throw notFound(`Group "${groupId}" not found`);
    }
    if (group.batch.lockedAt) {
      throw conflict(`Batch "${group.batchId}" sudah terkunci dan tidak bisa diubah`);
    }

    const body = await request.json();
    const timepointCode = typeof body?.timepointCode === 'string' ? body.timepointCode : '';
    try {
      parseTimepointCode(timepointCode);
    } catch {
      throw validationError('Field "timepointCode" harus H0, H6, …, D1–D14');
    }

    for (const existing of group.sessions) {
      if (!isNextTimepoint(existing.timepointCode, timepointCode)) {
        throw conflict(
          `Timepoint "${timepointCode}" harus setelah timepoint terakhir grup ini`
        );
      }
    }

    if (body?.warmupDone !== true) {
      throw validationError('Nyalakan sensor 30 menit dulu (warmupDone harus true) sebelum Start');
    }

    const startedAtUtc = body?.startedAtUtc === undefined
      ? new Date()
      : parseIsoDate(body.startedAtUtc, 'startedAtUtc', true)!;

    let chamberId: string | null = null;
    if (body?.chamberId !== undefined && body?.chamberId !== null) {
      if (typeof body.chamberId !== 'string' || !UUID_REGEX.test(body.chamberId)) {
        throw validationError('Field "chamberId" harus UUID valid');
      }
      const chamber = await prisma.chamber.findUnique({ where: { id: body.chamberId } });
      if (!chamber) {
        throw notFound(`Chamber "${body.chamberId}" not found`);
      }
      chamberId = chamber.id;
    }

    // Revisi putaran 2 butir 1 (validasi server): grup dingin mode chamber
    // wajib menunjuk chamber sebelum sesi berjalan karena chamber menentukan
    // sumber data sensor. Grup plain_fridge dan grup ruang tidak kena aturan.
    if (group.storageCondition === 'COLD' && group.coldStorageMode === 'CHAMBER' && !chamberId) {
      throw validationError(
        'Grup dingin mode chamber butuh pemilihan chamber sebelum sesi dimulai'
      );
    }

    let deviceId: string | null = null;
    if (body?.deviceId !== undefined && body?.deviceId !== null) {
      if (typeof body.deviceId !== 'string' || !UUID_REGEX.test(body.deviceId)) {
        throw validationError('Field "deviceId" harus UUID valid');
      }
      const device = await prisma.device.findUnique({ where: { id: body.deviceId } });
      if (!device) {
        throw notFound(`Device "${body.deviceId}" not found`);
      }
      deviceId = device.id;
    }

    // Data observasi tahap ini (modal pra-sesi): suhu udang, berat total
    // udang, dan foto (foto lewat route /photos dengan sessionId). Kolom
    // grup tidak ditimpa lagi — tiap tahap menyimpan pengukurannya sendiri.
    const shrimpTempC = body?.shrimpTempC === undefined || body?.shrimpTempC === null
      ? null
      : parseBoundedNumber(body.shrimpTempC, 'shrimpTempC', -2, 30);
    const shrimpWeightG = body?.shrimpWeightG === undefined || body?.shrimpWeightG === null
      ? null
      : parsePositiveNumber(body.shrimpWeightG, 'shrimpWeightG', 2000);

    const suffix = group.storageCondition === 'COLD' ? 'SD' : 'SR';
    const session = await prisma.measurementSession.create({
      data: {
        sessionId: buildSessionId(group.batchId, timepointCode, suffix),
        groupId,
        batchId: group.batchId,
        chamberId,
        deviceId,
        timepointCode,
        elapsedHours: timepointToElapsedHours(timepointCode),
        startedAtUtc,
        warmupDone: true,
        shrimpTempC,
        shrimpWeightG,
      },
    });

    return jsonResponse(serializeSession(session), undefined, 201);
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}
