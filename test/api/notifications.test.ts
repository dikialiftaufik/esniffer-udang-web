import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { prisma, closeDb } from '../../lib/db/client.ts';
import { GET as listNotifications } from '../../app/api/v1/notifications/route.ts';
import { GET as unreadCount } from '../../app/api/v1/notifications/unread-count/route.ts';
import { PATCH as markRead } from '../../app/api/v1/notifications/[notificationId]/read/route.ts';
import { PATCH as readAll } from '../../app/api/v1/notifications/read-all/route.ts';
import { hashPassword } from '../../lib/auth/password.ts';
import { createSession as createAuthSession, buildSessionCookie } from '../../lib/auth/session.ts';

/** Notifikasi tidak punya endpoint pembuatan publik — worker yang membuatnya; test memakai Prisma langsung. */

describe('HTTP API v1: Notifications (revisi putaran 2, butir 9 lapisan API)', () => {
  const tag = Date.now().toString().slice(-8);
  let adminCookie = '';
  let viewerCookie = '';
  const userIds: string[] = [];
  let adminNotifId = '';
  let notifA = ''; // terbaru viewer, belum dibaca
  let notifB = ''; // menengah viewer, belum dibaca
  let notifC = ''; // lama viewer, belum dibaca
  let notifD = ''; // viewer, sudah dibaca

  const jsonHeaders = (cookie: string): Record<string, string> => ({
    Cookie: cookie,
    Origin: 'http://localhost:3000',
    Host: 'localhost:3000',
    'Content-Type': 'application/json',
  });

  before(async () => {
    const passwordHash = await hashPassword('AdminPass123!');
    const admin = await prisma.user.create({
      data: { email: `notif-admin-${tag}@esniffer.local`, passwordHash, role: 'ADMIN', isActive: true },
    });
    const viewer = await prisma.user.create({
      data: { email: `notif-viewer-${tag}@esniffer.local`, passwordHash, role: 'VIEWER', isActive: true },
    });
    userIds.push(admin.id, viewer.id);
    const a = await createAuthSession(admin.id);
    adminCookie = buildSessionCookie(a.rawToken, a.expiresAt).split(';')[0];
    const v = await createAuthSession(viewer.id);
    viewerCookie = buildSessionCookie(v.rawToken, v.expiresAt).split(';')[0];

    const mk = async (
      userId: string,
      kind: string,
      minutesAgo: number,
      read = false
    ): Promise<string> => {
      const row = await prisma.notification.create({
        data: {
          userId,
          kind,
          message: `${kind} ${tag}`,
          readAt: read ? new Date(Date.now() - minutesAgo * 60_000) : null,
          createdAt: new Date(Date.now() - minutesAgo * 60_000),
        },
      });
      return row.id;
    };

    adminNotifId = await mk(admin.id, 'warmup_complete', 40);
    notifA = await mk(viewer.id, 'warmup_complete', 30);
    notifB = await mk(viewer.id, 'cooler_temp_unstable', 20);
    notifC = await mk(viewer.id, 'device_offline', 10);
    notifD = await mk(viewer.id, 'warmup_complete', 5, true);
  });

  after(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await closeDb();
  });

  it('1. GET list hanya milik user sendiri, terurut terbaru, paginasi kursor keyset', async () => {
    const anon = await listNotifications(new Request('http://localhost:3000/api/v1/notifications'));
    assert.strictEqual(anon.status, 401);

    const res = await listNotifications(
      new Request('http://localhost:3000/api/v1/notifications?limit=2', {
        headers: { Cookie: viewerCookie },
      })
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.length, 2);
    // Terbaru dulu: notifD (5 menit lalu, sudah dibaca), lalu notifC (10 menit).
    assert.strictEqual(body.data[0].id, notifD); // warmup_complete, sudah dibaca
    assert.ok(body.data[0].readAt, 'readAt lama tetap terbawa');
    assert.strictEqual(body.data[1].id, notifC); // device_offline
    assert.strictEqual(body.data[1].readAt, null);
    assert.ok(body.meta.nextCursor, 'Halaman penuh wajib membawa nextCursor');

    const page2 = await listNotifications(
      new Request(`http://localhost:3000/api/v1/notifications?limit=2&cursor=${body.meta.nextCursor}`, {
        headers: { Cookie: viewerCookie },
      })
    );
    const page2Body = await page2.json();
    assert.strictEqual(page2Body.data.length, 2);
    assert.strictEqual(page2Body.data[0].id, notifB);
    assert.strictEqual(page2Body.data[1].id, notifA);
    assert.strictEqual(page2Body.meta.nextCursor, null);

    // Admin hanya melihat notifikasi miliknya — tidak ada bocor lintas user.
    const adminRes = await listNotifications(
      new Request('http://localhost:3000/api/v1/notifications', {
        headers: { Cookie: adminCookie },
      })
    );
    const adminBody = await adminRes.json();
    assert.strictEqual(adminBody.data.length, 1);
    assert.strictEqual(adminBody.data[0].id, adminNotifId);

    const bad = await listNotifications(
      new Request('http://localhost:3000/api/v1/notifications?cursor=salah', {
        headers: { Cookie: viewerCookie },
      })
    );
    assert.strictEqual(bad.status, 422);
  });

  it('2. unseen number: unread-count sesuai pemilik', async () => {
    const v = await unreadCount(
      new Request('http://localhost:3000/api/v1/notifications/unread-count', {
        headers: { Cookie: viewerCookie },
      })
    );
    assert.strictEqual((await v.json()).data.count, 3);

    const a = await unreadCount(
      new Request('http://localhost:3000/api/v1/notifications/unread-count', {
        headers: { Cookie: adminCookie },
      })
    );
    assert.strictEqual((await a.json()).data.count, 1);
  });

  it('3. PATCH read menandai satu notifikasi, idempoten', async () => {
    const res = await markRead(
      new Request(`http://localhost:3000/api/v1/notifications/${notifC}/read`, {
        method: 'PATCH',
        headers: jsonHeaders(viewerCookie),
      }),
      { params: Promise.resolve({ notificationId: notifC }) }
    );
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.readAt, 'readAt terisi');

    const again = await markRead(
      new Request(`http://localhost:3000/api/v1/notifications/${notifC}/read`, {
        method: 'PATCH',
        headers: jsonHeaders(viewerCookie),
      }),
      { params: Promise.resolve({ notificationId: notifC }) }
    );
    assert.strictEqual(again.status, 200); // idempoten, tanpa error

    const count = await unreadCount(
      new Request('http://localhost:3000/api/v1/notifications/unread-count', {
        headers: { Cookie: viewerCookie },
      })
    );
    assert.strictEqual((await count.json()).data.count, 2);
  });

  it('4. PATCH read milik user lain 404 dan id invalid 422', async () => {
    const cross = await markRead(
      new Request(`http://localhost:3000/api/v1/notifications/${notifB}/read`, {
        method: 'PATCH',
        headers: jsonHeaders(adminCookie),
      }),
      { params: Promise.resolve({ notificationId: notifB }) }
    );
    assert.strictEqual(cross.status, 404);

    const bad = await markRead(
      new Request('http://localhost:3000/api/v1/notifications/bukan-uuid/read', {
        method: 'PATCH',
        headers: jsonHeaders(viewerCookie),
      }),
      { params: Promise.resolve({ notificationId: 'bukan-uuid' }) }
    );
    assert.strictEqual(bad.status, 422);
  });

  it('5. read-all mengosongkan unread milik pemanggil saja', async () => {
    const res = await readAll(
      new Request('http://localhost:3000/api/v1/notifications/read-all', {
        method: 'PATCH',
        headers: jsonHeaders(viewerCookie),
      })
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).data.updated, 2); // notifB + notifC

    const v = await unreadCount(
      new Request('http://localhost:3000/api/v1/notifications/unread-count', {
        headers: { Cookie: viewerCookie },
      })
    );
    assert.strictEqual((await v.json()).data.count, 0);

    // Admin tidak terpengaruh.
    const a = await unreadCount(
      new Request('http://localhost:3000/api/v1/notifications/unread-count', {
        headers: { Cookie: adminCookie },
      })
    );
    assert.strictEqual((await a.json()).data.count, 1);
  });
});
