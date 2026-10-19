import { prisma } from '../../../../lib/db/client.ts';
import { requireAuth } from '../../../../lib/auth/guard.ts';
import { jsonResponse, errorResponse, getRequestId } from '../../../../lib/api/response.ts';
import { parseLimit, parseIsoDate } from '../../../../lib/api/validation.ts';
import { validationError } from '../../../../lib/api/errors.ts';
import { serializeNotification } from '../../../../lib/api/dataset.ts';
import { Prisma } from '@prisma/client';

/**
 * Riwayat notifikasi milik user login (revisi putaran 2 butir 9, lapisan
 * API). Paginasi keyset (createdAt, id) DESC dengan cursor "<createdAt>|<id>"
 * di meta.nextCursor. Isi notifikasi dibuat oleh worker, bukan endpoint ini.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const auth = await requireAuth(request, ['VIEWER', 'ADMIN']);
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get('limit'), 20, 100);

    const where: Prisma.NotificationWhereInput = { userId: auth.user.id };
    const rawCursor = url.searchParams.get('cursor');
    if (rawCursor) {
      const sep = rawCursor.indexOf('|');
      const at = sep === -1 ? null : parseIsoDate(rawCursor.slice(0, sep), 'cursor', true);
      const id = sep === -1 ? '' : rawCursor.slice(sep + 1);
      if (!at || !id) {
        throw validationError('Parameter "cursor" harus format "<createdAt ISO>|<id>"');
      }
      where.OR = [
        { createdAt: { lt: at } },
        { createdAt: at, id: { lt: id } },
      ];
    }

    const rows = await prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    let nextCursor: string | null = null;
    if (hasMore && data.length > 0) {
      const last = data[data.length - 1];
      nextCursor = `${last.createdAt.toISOString()}|${last.id}`;
    }

    return jsonResponse(data.map(serializeNotification), { nextCursor });
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}
