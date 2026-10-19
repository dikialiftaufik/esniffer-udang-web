import { prisma } from '../../../../../lib/db/client.ts';
import { requireAuth } from '../../../../../lib/auth/guard.ts';
import { jsonResponse, errorResponse, getRequestId } from '../../../../../lib/api/response.ts';

/**
 * Jumlah notifikasi belum dibaca milik user login (butir 9, lapisan API).
 * Dipanggil lonceng di header; angka 0 memunculkan kondisi kosong.
 */
export async function GET(request: Request): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    const auth = await requireAuth(request, ['VIEWER', 'ADMIN']);
    const count = await prisma.notification.count({
      where: { userId: auth.user.id, readAt: null },
    });
    return jsonResponse({ count });
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}
