/**
 * Integration Test: sweep kestabilan worker (revisi putaran 2 butir 9).
 * Data sintetis stabil pada jendela 10 menit → notifikasi untuk operator
 * batch sekali per sesi; siklus kompresor di kulkas tidak bernotifikasi.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma, allocateHistorySequence, closeDb } from '../../lib/db/client.ts';
import { sweepStableSessions } from '../../worker/stability.ts';
import { buildSessionId } from '../../shared/dataset.ts';

interface SynthPoint {
  at: Date;
  value: number;
}

const runId = randomUUID().slice(0, 8);
// batch_id mengikuti pola kolom BT-YYYYMMDD-NN; dua digit acak agar run
// paralel/tidak bertabrakan dengan seed dev DB yang sudah ada.
const BATCH = `BT-20991019-${String(Math.floor(Math.random() * 90) + 1).padStart(2, '0')}`;
const GROUP_SR = `${BATCH}-SR`;
const GROUP_SD = `${BATCH}-SD`;
const SESSION_STABLE = buildSessionId(BATCH, 'H0', 'SR');
const SESSION_UNSTABLE = buildSessionId(BATCH, 'H0', 'SD');

let userId: string;
let deviceStableId: string;
let deviceUnstableId: string;
let chamberStableId: string;
let chamberUnstableId: string;
let assignmentStableId: string;
let assignmentUnstableId: string;

/** Jendela 30 titik tiap 18 s (≈ 8,7 menit), mulai ~9,3 menit sebelum `now`. */
function series(now: Date, value: number, noise = 0): SynthPoint[] {
  const out: SynthPoint[] = [];
  for (let i = 0; i < 30; i++) {
    out.push({
      at: new Date(now.getTime() - 560_000 + i * 18_000),
      value: i % 2 === 0 ? value + noise : value - noise,
    });
  }
  return out;
}

/** Suhu kulkas dengan siklus kompresor: 4,8 °C ↔ 3,4 °C (rentang 1,4 °C). */
function compressorCycle(now: Date): SynthPoint[] {
  const out: SynthPoint[] = [];
  for (let i = 0; i < 30; i++) {
    out.push({
      at: new Date(now.getTime() - 560_000 + i * 18_000),
      value: Math.floor(i / 4) % 2 === 0 ? 4.8 : 3.4,
    });
  }
  return out;
}

async function insertReadings(
  deviceId: string,
  chamberId: string,
  gas: SynthPoint[],
  temp: SynthPoint[],
  humidity: SynthPoint[]
): Promise<void> {
  let seq = 0;
  for (const p of gas) {
    await prisma.sensorReading.create({
      data: {
        deviceId,
        chamberId,
        assignmentId: deviceId === deviceStableId ? assignmentStableId : assignmentUnstableId,
        messageId: `sweep-${runId}-${deviceId}-${seq}`,
        payloadSha256: '0'.repeat(64),
        bootId: randomUUID(),
        historySequence: await allocateHistorySequence(),
        sequence: BigInt(seq++),
        measuredAt: p.at,
        receivedAt: p.at,
        measurementTimeQuality: 'SYNCED',
        temperatureC: temp[seq % temp.length].value,
        temperatureQuality: 'OK',
        humidityPercent: humidity[seq % humidity.length].value,
        humidityQuality: 'OK',
        mq137Raw: p.value,
        mq137Quality: 'OK',
        mq136Raw: p.value - 120,
        mq136Quality: 'OK',
        mq4Raw: p.value - 170,
        mq4Quality: 'OK',
        rawPayload: { synthetic: true },
      },
    });
  }
}

describe('sweepStableSessions (butir 9, lapisan worker)', () => {
  before(async () => {
    const user = await prisma.user.create({
      data: {
        email: `sweep-test-${runId}@example.local`,
        passwordHash: 'test-hash-not-for-login',
        role: 'ADMIN',
      },
    });
    userId = user.id;

    const deviceStable = await prisma.device.create({
      data: { mqttDeviceId: `test-sweep-stable-${runId}`, name: 'Sweep Stable Node' },
    });
    deviceStableId = deviceStable.id;
    const deviceUnstable = await prisma.device.create({
      data: { mqttDeviceId: `test-sweep-bad-${runId}`, name: 'Sweep Unstable Node' },
    });
    deviceUnstableId = deviceUnstable.id;

    const chamberStable = await prisma.chamber.create({
      data: { code: `SWP-A-${runId}`, name: 'Sweep Stable Chamber' },
    });
    chamberStableId = chamberStable.id;
    const chamberUnstable = await prisma.chamber.create({
      data: { code: `SWP-B-${runId}`, name: 'Sweep Unstable Chamber' },
    });
    chamberUnstableId = chamberUnstable.id;

    // Reading SYNCED wajib assignment (CHECK) — alat mengintip chamber saat warmup.
    const assignmentStable = await prisma.deviceAssignment.create({
      data: { deviceId: deviceStableId, chamberId: chamberStableId, activeFrom: new Date(Date.now() - 86_400_000) },
    });
    assignmentStableId = assignmentStable.id;
    const assignmentUnstable = await prisma.deviceAssignment.create({
      data: { deviceId: deviceUnstableId, chamberId: chamberUnstableId, activeFrom: new Date(Date.now() - 86_400_000) },
    });
    assignmentUnstableId = assignmentUnstable.id;

    await prisma.collectionBatch.create({
      data: {
        batchId: BATCH,
        procuredAtUtc: new Date('2099-10-19T00:30:00.000Z'),
        marketSource: 'Pasar Sweep Test',
        sourceType: 'MARKET',
        shrimpCount: 12,
        sizeGrade: 25,
        totalWeightG: 485.5,
        initialCondition: 'DEAD',
        initialTempC: 8.2,
        arrivedAtUtc: new Date('2099-10-19T02:00:00.000Z'),
        coolerTempMarketC: 1.2,
        coolerTempLabC: 3.8,
        operatorId: userId,
      },
    });
    await prisma.sampleGroup.create({
      data: {
        groupId: GROUP_SR,
        batchId: BATCH,
        storageCondition: 'ROOM_TEMP',
        targetTempC: 25.0,
        labTempC: 6.5,
        visualCheck: 'NORMAL',
        labWeightBeforeG: 482.0,
        sampleShrimpCount: 4,
      },
    });
    await prisma.sampleGroup.create({
      data: {
        groupId: GROUP_SD,
        batchId: BATCH,
        storageCondition: 'COLD',
        coldStorageMode: 'PLAIN_FRIDGE',
        targetTempC: 4.0,
        labTempC: 6.5,
        visualCheck: 'NORMAL',
        labWeightBeforeG: 483.0,
        sampleShrimpCount: 4,
      },
    });
    await prisma.measurementSession.create({
      data: {
        sessionId: SESSION_STABLE,
        groupId: GROUP_SR,
        batchId: BATCH,
        chamberId: chamberStableId,
        deviceId: deviceStableId,
        timepointCode: 'H0',
        elapsedHours: 0,
        startedAtUtc: new Date(Date.now() - 30 * 60_000),
        warmupDone: true,
      },
    });
    await prisma.measurementSession.create({
      data: {
        sessionId: SESSION_UNSTABLE,
        groupId: GROUP_SD,
        batchId: BATCH,
        chamberId: chamberUnstableId,
        deviceId: deviceUnstableId,
        timepointCode: 'H0',
        elapsedHours: 0,
        startedAtUtc: new Date(Date.now() - 30 * 60_000),
        warmupDone: true,
      },
    });
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { batchId: BATCH } });
    await prisma.measurementSession.deleteMany({ where: { batchId: BATCH } });
    await prisma.sampleGroup.deleteMany({ where: { batchId: BATCH } });
    await prisma.collectionBatch.deleteMany({ where: { batchId: BATCH } });
    await prisma.sensorReading.deleteMany({
      where: { deviceId: { in: [deviceStableId, deviceUnstableId] } },
    });
    await prisma.deviceAssignment.deleteMany({
      where: { id: { in: [assignmentStableId, assignmentUnstableId] } },
    });
    await prisma.device.deleteMany({ where: { id: { in: [deviceStableId, deviceUnstableId] } } });
    await prisma.chamber.deleteMany({
      where: { id: { in: [chamberStableId, chamberUnstableId] } },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await closeDb();
  });

  it('data stabil 10 menit → notifikasi warmup_stable untuk operator batch', async () => {
    const sweepTime = new Date(Date.now());
    await insertReadings(
      deviceStableId,
      chamberStableId,
      series(sweepTime, 450, 1),
      series(sweepTime, 25.0, 0.2),
      series(sweepTime, 70.0, 0.8)
    );

    await sweepStableSessions(sweepTime);

    const notifs = await prisma.notification.findMany({ where: { batchId: BATCH } });
    const stable = notifs.find((n) => n.sessionId === SESSION_STABLE);
    assert.ok(stable, 'notifikasi sesi stabil harus dibuat');
    assert.strictEqual(stable.userId, userId, 'penerima = operator batch');
    assert.strictEqual(stable.kind, 'warmup_stable');
    assert.strictEqual(stable.message, 'Sensor stabil, sesi siap dimulai');
    assert.strictEqual(stable.readAt, null);
    assert.strictEqual(
      notifs.find((n) => n.sessionId === SESSION_UNSTABLE),
      undefined,
      'sesi tanpa data belum dinilai dan tidak bernotifikasi'
    );
  });

  it('siklus kompresor di suhu kulkas → tanpa notifikasi', async () => {
    const sweepTime = new Date(Date.now() + 60_000);
    await insertReadings(
      deviceUnstableId,
      chamberUnstableId,
      series(sweepTime, 450, 1),
      compressorCycle(sweepTime), // rentang 1,4 °C > ambang plain 1,0 °C
      series(sweepTime, 70.0, 0.8)
    );

    await sweepStableSessions(sweepTime);

    const notifs = await prisma.notification.findMany({ where: { batchId: BATCH } });
    assert.strictEqual(
      notifs.find((n) => n.sessionId === SESSION_UNSTABLE),
      undefined,
      'sesi dingin dengan rentang suhu 1,4 °C gagal ambang'
    );
    const stableCount = notifs.filter((n) => n.sessionId === SESSION_STABLE).length;
    assert.strictEqual(stableCount, 1, 'sesi stabil tepat satu notifikasi');
  });

  it('sweep berturut-turut idempoten: unik (session, kind) menahan duplikat', async () => {
    const count = await prisma.notification.count({ where: { sessionId: SESSION_STABLE } });
    assert.strictEqual(count, 1);
    await sweepStableSessions(new Date());
    const recount = await prisma.notification.count({ where: { sessionId: SESSION_STABLE } });
    assert.strictEqual(recount, 1);
  });
});
