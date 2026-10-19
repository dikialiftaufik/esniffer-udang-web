import { prisma } from '../../../../../lib/db/client.ts';
import { requireAuth, verifyCsrfAndOrigin } from '../../../../../lib/auth/guard.ts';
import { jsonResponse, errorResponse, getRequestId } from '../../../../../lib/api/response.ts';

/**
 * Tandai semua notifikasi milik user login sebagai sudah dibaca (butir 9,
 * lapisan API). Mengembalikan jumlah baris yang baru ditandai.
 */
export async function PATCH(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    verifyCsrfAndOrigin(request);
    const auth = await requireAuth(request, ['VIEWER', 'ADMIN']);
    const result = await prisma.notification.updateMany({
      where: { userId: auth.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return jsonResponse({ updated: result.count });
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}
