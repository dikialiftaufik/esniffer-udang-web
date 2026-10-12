import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma, closeDb } from '../../lib/db/client.ts';
import { GET as getHealthHandler } from '../../app/api/v1/ingest/health/route.ts';
import { hashPassword } from '../../lib/auth/password.ts';
import { createSession, buildSessionCookie } from '../../lib/auth/session.ts';

function hourStart(d: Date): Date {
  const h = new Date(d);
  h.setUTCMinutes(0, 0, 0);
  return h;
}

describe('HTTP API v1: Kesehatan ingest', () => {
  let adminCookie = '';
  let adminUserId = '';
  const testPrefix = `ih-${Date.now().toString().slice(-4)}`;
  const deviceMqttId = `esp32-${testPrefix}`;
  const ghostMqttId = `hantu-${testPrefix}`;
  let deviceId = '';
  let chamberId = '';
  let assignmentId = '';

  before(async () => {
    const passwordHash = await hashPassword('AdminPass123!');
    const adminUser = await prisma.user.create({
      data: {
        email: `admin-${testPrefix}@esniffer.local`,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });
    adminUserId = adminUser.id;
    const { rawToken, expiresAt } = await createSession(adminUser.id);
    adminCookie = buildSessionCookie(rawToken, expiresAt).split(';')[0];

    const device = await prisma.device.create({
      data: {
        mqttDeviceId: deviceMqttId,
        name: `Device ${testPrefix}`,
        isActive: true,
        connectionState: 'ONLINE',
        connectionEvidence: 'LIVE_TELEMETRY',
        lastSeenAt: new Date(),
      },
    });
    deviceId = device.id;

    const chamber = await prisma.chamber.create({
      data: { code: `CH-${testPrefix}`, name: `Chamber ${testPrefix}`, isActive: true },
    });
    chamberId = chamber.id;
    const assignment = await prisma.deviceAssignment.create({
      data: {
        deviceId,
        chamberId,
        activeFrom: new Date('2026-09-01T00:00:00Z'),
        activeUntil: null,
      },
    });
    assignmentId = assignment.id;

    const windowStart = hourStart(new Date());
    await prisma.ingestOutcome.createMany({
      data: [
        { mqttDeviceId: deviceMqttId, outcome: 'stored', windowStart, count: 10 },
        { mqttDeviceId: deviceMqttId, outcome: 'rejected:ASSIGNMENT_NOT_FOUND', windowStart, count: 3 },
        { mqttDeviceId: ghostMqttId, outcome: 'rejected:DEVICE_UNKNOWN', windowStart, count: 2 },
      ],
    });

    // 3 reading berselang 30 dtk, jeda ukur ke simpan 2 dtk (untuk laju)
    const base = Date.now() - 5 * 60_000;
    const bootId = '12345678-1234-1234-1234-123456789012';
    for (let i = 0; i < 3; i++) {
      const measuredAt = new Date(base + i * 30_000);
      await prisma.sensorReading.create({
        data: {
          deviceId,
          chamberId,
          assignmentId,
          messageId: `health-rate-${testPrefix}-${i}`,
          payloadSha256: 'a'.repeat(64),
          bootId,
          sequence: BigInt(i + 1),
          historySequence: BigInt(900000 + i),
          measuredAt,
          receivedAt: new Date(measuredAt.getTime() + 2_000),
          measurementTimeQuality: 'SYNCED',
          temperatureC: 25.5,
          temperatureQuality: 'OK',
          humidityPercent: 60.0,
          humidityQuality: 'OK',
          mq137Raw: 100.0,
          mq137Quality: 'OK',
          mq136Raw: 100.0,
          mq136Quality: 'OK',
          mq4Raw: 100.0,
          mq4Quality: 'OK',
          rawPayload: {},
        },
      });
    }
  });

  after(async () => {
    await prisma.sensorReading.deleteMany({ where: { deviceId } });
    await prisma.deviceAssignment.deleteMany({ where: { deviceId } });
    await prisma.chamber.deleteMany({ where: { id: chamberId } });
    await prisma.ingestOutcome.deleteMany({
      where: { mqttDeviceId: { in: [deviceMqttId, ghostMqttId] } },
    });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await prisma.authSession.deleteMany({ where: { userId: adminUserId } });
    await prisma.user.deleteMany({ where: { id: adminUserId } });
    await closeDb();
  });

  it('1. Tanpa login: ditolak 401', async () => {
    const req = new Request('http://localhost:3000/api/v1/ingest/health', { method: 'GET' });
    const res = await getHealthHandler(req);
    assert.strictEqual(res.status, 401);
  });

  it('2. GET health: agregat outcome per alat + pengirim tak dikenal', async () => {
    const req = new Request('http://localhost:3000/api/v1/ingest/health?hours=24', {
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const res = await getHealthHandler(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    const entry = json.data.devices.find((d: { mqttDeviceId: string }) => d.mqttDeviceId === deviceMqttId);
    assert.ok(entry, 'alat uji harus ada di daftar');
    assert.strictEqual(entry.outcomes.stored, 10);
    assert.strictEqual(entry.outcomes['rejected:ASSIGNMENT_NOT_FOUND'], 3);
    assert.ok(
      entry.warnings.some((w: string) => w.includes('3 pesan ditolak')),
      'riwayat penolakan wajib diperingatkan'
    );

    const ghost = json.data.unknownSenders.find((s: { mqttDeviceId: string }) => s.mqttDeviceId === ghostMqttId);
    assert.ok(ghost, 'pengirim tak dikenal wajib tampil');
    assert.strictEqual(ghost.outcomes['rejected:DEVICE_UNKNOWN'], 2);

    assert.ok(json.data.totals.stored >= 10);
    assert.ok(json.data.totals.rejected >= 5);
    assert.strictEqual(entry.rateLast10m.sampleSize, 3);
    assert.strictEqual(entry.rateLast10m.medianGapMs, 30_000);
    assert.strictEqual(entry.rateLast10m.medianLagMs, 2_000);
  });

  it('3. Param hours dibatasi 1..168', async () => {
    const req = new Request('http://localhost:3000/api/v1/ingest/health?hours=9999', {
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const res = await getHealthHandler(req);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.windowHours, 168);
  });
});
