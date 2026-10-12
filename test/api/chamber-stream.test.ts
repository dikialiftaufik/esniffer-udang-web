import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma, closeDb } from '../../lib/db/client.ts';
import { GET as getStreamHandler } from '../../app/api/v1/chambers/[chamberId]/stream/route.ts';
import { hashPassword } from '../../lib/auth/password.ts';
import { createSession, buildSessionCookie } from '../../lib/auth/session.ts';

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string, timeoutMs: number): Promise<string> {
  const decoder = new TextDecoder();
  let buf = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    if (buf.includes(needle)) break;
  }
  return buf;
}

describe('HTTP API v1: Stream SSE chamber', () => {
  let adminCookie = '';
  let adminUserId = '';
  const testPrefix = `st-${Date.now().toString().slice(-4)}`;
  const chamberCode = `CH-${testPrefix}`;
  const deviceMqttId = `esp32-${testPrefix}`;
  const messageId = `stream-msg-${testPrefix}`;
  let chamberId = '';
  let deviceId = '';
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

    const chamber = await prisma.chamber.create({
      data: { code: chamberCode, name: `Chamber ${testPrefix}`, isActive: true },
    });
    chamberId = chamber.id;
    const device = await prisma.device.create({
      data: { mqttDeviceId: deviceMqttId, name: `Device ${testPrefix}`, isActive: true },
    });
    deviceId = device.id;
    const assignment = await prisma.deviceAssignment.create({
      data: { deviceId, chamberId, activeFrom: new Date('2026-09-01T00:00:00Z'), activeUntil: null },
    });
    assignmentId = assignment.id;

    const measuredAt = new Date();
    await prisma.sensorReading.create({
      data: {
        deviceId,
        chamberId,
        assignmentId,
        messageId,
        payloadSha256: 'b'.repeat(64),
        bootId: '12345678-1234-1234-1234-123456789012',
        sequence: BigInt(1),
        historySequence: BigInt(920001),
        measuredAt,
        receivedAt: measuredAt,
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
  });

  after(async () => {
    await prisma.sensorReading.deleteMany({ where: { deviceId } });
    await prisma.deviceAssignment.deleteMany({ where: { deviceId } });
    await prisma.device.deleteMany({ where: { id: deviceId } });
    await prisma.chamber.deleteMany({ where: { id: chamberId } });
    await prisma.authSession.deleteMany({ where: { userId: adminUserId } });
    await prisma.user.deleteMany({ where: { id: adminUserId } });
    await closeDb();
  });

  it('1. Tanpa login: ditolak 401', async () => {
    const req = new Request(`http://localhost:3000/api/v1/chambers/${chamberCode}/stream`, { method: 'GET' });
    const res = await getStreamHandler(req, { params: Promise.resolve({ chamberId: chamberCode }) });
    assert.strictEqual(res.status, 401);
  });

  it('2. Chamber tak dikenal: 404', async () => {
    const req = new Request('http://localhost:3000/api/v1/chambers/CH-TIDAK-ADA/stream', {
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const res = await getStreamHandler(req, { params: Promise.resolve({ chamberId: 'CH-TIDAK-ADA' }) });
    assert.strictEqual(res.status, 404);
  });

  it('3. Stream mendorong tick untuk baris setelah cursor', async () => {
    const req = new Request(`http://localhost:3000/api/v1/chambers/${chamberCode}/stream?cursor=0`, {
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const res = await getStreamHandler(req, { params: Promise.resolve({ chamberId: chamberCode }) });
    assert.strictEqual(res.status, 200);
    assert.ok((res.headers.get('content-type') ?? '').includes('text/event-stream'));
    assert.ok(res.body, 'stream wajib punya body');
    const reader = res.body.getReader();
    try {
      const buf = await readUntil(reader, messageId, 8000);
      assert.ok(buf.includes('event: ready'), 'wajib dibuka dengan event ready');
      assert.ok(buf.includes('event: tick'), 'wajib mendorong event tick');
      assert.ok(buf.includes(deviceMqttId), 'tick wajib memuat identitas alat');
    } finally {
      await reader.cancel();
    }
  });

  it('4. Tanpa cursor: mulai dari posisi terkini tanpa replay', async () => {
    const req = new Request(`http://localhost:3000/api/v1/chambers/${chamberCode}/stream`, {
      method: 'GET',
      headers: { Cookie: adminCookie },
    });
    const res = await getStreamHandler(req, { params: Promise.resolve({ chamberId: chamberCode }) });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body, 'stream wajib punya body');
    const reader = res.body.getReader();
    try {
      const buf = await readUntil(reader, 'event: ready', 8000);
      assert.ok(buf.includes('"cursor":"920001"'), 'cursor awal = sequence terakhir');
      assert.ok(!buf.includes('event: tick'), 'tidak boleh replay baris lama');
    } finally {
      await reader.cancel();
    }
  });
});
