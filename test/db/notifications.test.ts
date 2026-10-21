/**
 * Integration Test: Notifications (Fase 1)
 * Revisi pembimbing putaran 2 butir 9: tabel lonceng header.
 * Idempotensi (session_id, kind) ditegakkan DB — bukan cek aplikasi.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma, closeDb } from '../../lib/db/client.ts';

const runId = randomUUID().slice(0, 8);
const BATCH = 'BT-20990103-01';
const GROUP = `${BATCH}-SR`;
const SESSION = `SES-20990103-H0-SR`;

let userId: string;
let deviceId: string;
let chamberId: string;

describe('Notifications Schema (Fase 1, revisi butir 9)', () => {
  before(async () => {
    const user = await prisma.user.create({
      data: {
        email: `notif-test-${runId}@example.local`,
        passwordHash: 'test-hash-not-for-login',
        role: 'ADMIN',
      },
    });
    userId = user.id;

    const device = await prisma.device.create({
      data: { mqttDeviceId: `test-notif-${runId}`, name: 'Notification Test Node' },
    });
    deviceId = device.id;

    const chamber = await prisma.chamber.create({
      data: { code: `NTF-${runId}`, name: 'Notification Test Chamber' },
    });
    chamberId = chamber.id;

    await prisma.collectionBatch.create({
      data: {
        batchId: BATCH,
        procuredAtUtc: new Date('2099-01-03T00:30:00.000Z'),
        marketSource: 'Pasar Notif Test',
        sourceType: 'MARKET',
        shrimpCount: 12,
        sizeGrade: 25,
        shrimpLengthCm: 12.5,
        totalWeightG: 485.5,
        initialCondition: 'DEAD',
        initialTempC: 8.2,
        arrivedAtUtc: new Date('2099-01-03T02:00:00.000Z'),
        coolerTempMarketC: 1.2,
        coolerTempLabC: 3.8,
        operatorId: userId,
      },
    });
    await prisma.sampleGroup.create({
      data: {
        groupId: GROUP,
        batchId: BATCH,
        chamberId,
        storageCondition: 'ROOM_TEMP',
        targetTempC: 25.0,
        labTempC: 6.5,
        visualCheck: 'NORMAL',
        labWeightBeforeG: 482.0,
        labWeightAfterG: 478.5,
        sampleShrimpCount: 4,
      },
    });
    await prisma.measurementSession.create({
      data: {
        sessionId: SESSION,
        groupId: GROUP,
        batchId: BATCH,
        chamberId,
        deviceId,
        timepointCode: 'H0',
        elapsedHours: 0,
        startedAtUtc: new Date('2099-01-03T06:00:00.000Z'),
        warmupDone: true,
      },
    });
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { batchId: BATCH } });
    await prisma.measurementSession.deleteMany({ where: { batchId: BATCH } });
    await prisma.sampleGroup.deleteMany({ where: { batchId: BATCH } });
    await prisma.collectionBatch.deleteMany({ where: { batchId: BATCH } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await prisma.chamber.deleteMany({ where: { id: chamberId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await closeDb();
  });

  it('migrasi membuat index (user_id, created_at) dan unique (session_id, kind)', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'notifications'`
    );
    const names = rows.map((r) => r.indexname);
    assert.ok(names.includes('notifications_user_id_created_at_idx'), names.join(', '));
    assert.ok(names.includes('notifications_session_id_kind_key'), names.join(', '));
  });

  it('notifikasi tersimpan, terhubung ke user/sesi, dan berpindah menjadi terbaca', async () => {
    const created = await prisma.notification.create({
      data: {
        userId,
        batchId: BATCH,
        sessionId: SESSION,
        kind: 'warmup_stable',
        message: `Sensor ${SESSION} stabil pada jendela 10 menit.`,
      },
      include: { user: true, session: true },
    });
    assert.strictEqual(created.readAt, null);
    assert.strictEqual(created.user.id, userId);
    assert.strictEqual(created.session?.sessionId, SESSION);

    const unread = await prisma.notification.findMany({
      where: { userId, readAt: null },
    });
    assert.strictEqual(unread.length, 1);

    await prisma.notification.update({
      where: { id: created.id },
      data: { readAt: new Date() },
    });
    const afterRead = await prisma.notification.findFirst({ where: { userId, readAt: null } });
    assert.strictEqual(afterRead, null);
  });

  it('idempotensi: duplikat (session_id, kind) ditolak DB (P2002)', async () => {
    const data = {
      userId,
      batchId: BATCH,
      sessionId: SESSION,
      kind: 'warmup_stable',
      message: 'Percobaan kedua tidak boleh tersimpan.',
    };
    await assert.rejects(prisma.notification.create({ data }), (err: unknown) => {
      assert.strictEqual((err as { code?: string }).code, 'P2002');
      return true;
    });
  });

  it('notifikasi tanpa sesi boleh berulang (NULL ≠ NULL pada unique)', async () => {
    const base = { userId, batchId: BATCH, kind: 'system_ping', message: 'Pengingat umum.' };
    const first = await prisma.notification.create({ data: { ...base } });
    const second = await prisma.notification.create({ data: { ...base } });
    assert.notStrictEqual(first.id, second.id);
    await prisma.notification.deleteMany({ where: { userId, kind: 'system_ping' } });
  });

  it('hapus sesi meniadakan notifikasinya (FK CASCADE)', async () => {
    const count = await prisma.notification.count({ where: { sessionId: SESSION } });
    assert.ok(count >= 1, 'harus ada notifikasi sesi sebelum dihapus');
    await prisma.measurementSession.delete({ where: { sessionId: SESSION } });
    const left = await prisma.notification.count({ where: { sessionId: SESSION } });
    assert.strictEqual(left, 0);
  });
});
