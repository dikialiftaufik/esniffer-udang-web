import { prisma } from '../../../../../../lib/db/client.ts';
import { requireAuth, verifyCsrfAndOrigin } from '../../../../../../lib/auth/guard.ts';
import { jsonResponse, errorResponse, getRequestId } from '../../../../../../lib/api/response.ts';
import { notFound, validationError } from '../../../../../../lib/api/errors.ts';
import { serializeNotification } from '../../../../../../lib/api/dataset.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tandai satu notifikasi sudah dibaca (butir 9, lapisan API). Idempoten:
 * notifikasi yang sudah dibaca kembali apa adanya dengan status 200.
 * Notifikasi milik user lain tidak terlihat (404).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ notificationId: string }> }
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    verifyCsrfAndOrigin(request);
    const auth = await requireAuth(request, ['VIEWER', 'ADMIN']);
    const { notificationId } = await context.params;
    if (!UUID_REGEX.test(notificationId)) {
      throw validationError('Parameter "notificationId" harus UUID valid');
    }

    const existing = await prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!existing || existing.userId !== auth.user.id) {
      throw notFound(`Notification "${notificationId}" not found`);
    }

    const updated = existing.readAt
      ? existing
      : await prisma.notification.update({
          where: { id: existing.id },
          data: { readAt: new Date() },
        });
    return jsonResponse(serializeNotification(updated));
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}
