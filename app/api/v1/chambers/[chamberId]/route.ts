import { prisma } from '../../../../../lib/db/client.ts';
import { requireAuth, verifyCsrfAndOrigin } from '../../../../../lib/auth/guard.ts';
import { jsonResponse, errorResponse, getRequestId } from '../../../../../lib/api/response.ts';
import { parseOptionalString } from '../../../../../lib/api/validation.ts';
import { notFound, validationError } from '../../../../../lib/api/errors.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ chamberId: string }> }
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    await requireAuth(request, ['VIEWER', 'ADMIN']);
    const { chamberId } = await context.params;

    const chamber = await prisma.chamber.findFirst({
      where: UUID_REGEX.test(chamberId) ? { id: chamberId } : { code: chamberId },
      include: {
        assignments: {
          where: { activeUntil: null },
          include: {
            device: {
              select: {
                id: true,
                mqttDeviceId: true,
                name: true,
                connectionState: true,
                connectionEvidence: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    if (!chamber) {
      throw notFound(`Chamber "${chamberId}" not found`);
    }

    return jsonResponse({
      id: chamber.id,
      code: chamber.code,
      name: chamber.name,
      description: chamber.description,
      isActive: chamber.isActive,
      activeDevices: chamber.assignments.map((a) => ({
        assignmentId: a.id,
        activeFrom: a.activeFrom.toISOString(),
        device: {
          id: a.device.id,
          mqttDeviceId: a.device.mqttDeviceId,
          name: a.device.name,
          connectionState: a.device.connectionState,
          connectionEvidence: a.device.connectionEvidence,
          lastSeenAt: a.device.lastSeenAt ? a.device.lastSeenAt.toISOString() : null,
        },
      })),
      createdAt: chamber.createdAt.toISOString(),
      updatedAt: chamber.updatedAt.toISOString(),
    });
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ chamberId: string }> }
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    verifyCsrfAndOrigin(request);
    await requireAuth(request, ['ADMIN']);
    const { chamberId } = await context.params;

    const chamber = await prisma.chamber.findFirst({
      where: UUID_REGEX.test(chamberId) ? { id: chamberId } : { code: chamberId },
    });

    if (!chamber) {
      throw notFound(`Chamber "${chamberId}" not found`);
    }

    const body = await request.json();
    const data: { name?: string; description?: string | null; isActive?: boolean } = {};

    if (body?.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw validationError('Chamber name must be a non-empty string');
      }
      data.name = body.name.trim();
    }

    if (body?.description !== undefined) {
      data.description = parseOptionalString(body.description, 'description', 500);
    }

    if (body?.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    const updated = await prisma.chamber.update({
      where: { id: chamber.id },
      data,
    });

    return jsonResponse({
      id: updated.id,
      code: updated.code,
      name: updated.name,
      description: updated.description,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ chamberId: string }> }
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    verifyCsrfAndOrigin(request);
    await requireAuth(request, ['ADMIN']);
    const { chamberId } = await context.params;

    const chamber = await prisma.chamber.findFirst({
      where: UUID_REGEX.test(chamberId) ? { id: chamberId } : { code: chamberId },
      include: {
        _count: {
          select: {
            readings: true,
            sessions: true,
            sampleGroups: true,
            assignments: true,
          },
        },
      },
    });

    if (!chamber) {
      throw notFound(`Chamber "${chamberId}" not found`);
    }

    // Periksa apakah ada data pembacaan langsung di chamber atau via riwayat assignment
    let hasHistoricalData =
      chamber._count.readings > 0 ||
      chamber._count.sessions > 0 ||
      chamber._count.sampleGroups > 0;

    if (!hasHistoricalData && chamber._count.assignments > 0) {
      const assignmentIds = (
        await prisma.deviceAssignment.findMany({
          where: { chamberId: chamber.id },
          select: { id: true },
        })
      ).map((a) => a.id);

      const linkedReadingsCount = await prisma.sensorReading.count({
        where: { assignmentId: { in: assignmentIds } },
      });

      if (linkedReadingsCount > 0) {
        hasHistoricalData = true;
      }
    }

    if (!hasHistoricalData) {
      // Hard delete: aman dihapus penuh karena tidak ada riwayat telemetri / sesi
      await prisma.$transaction(async (tx) => {
        await tx.deviceAssignment.deleteMany({
          where: { chamberId: chamber.id },
        });
        await tx.chamber.delete({
          where: { id: chamber.id },
        });
      });

      return jsonResponse({
        id: chamber.id,
        code: chamber.code,
        deleted: true,
        mode: 'hard',
        message: `Chamber "${chamber.name}" berhasil dihapus secara permanen.`,
      });
    }

    // Soft delete: nonaktifkan chamber dan tutup assignment yang masih aktif
    await prisma.$transaction(async (tx) => {
      await tx.deviceAssignment.updateMany({
        where: { chamberId: chamber.id, activeUntil: null },
        data: { activeUntil: new Date() },
      });
      await tx.chamber.update({
        where: { id: chamber.id },
        data: { isActive: false },
      });
    });

    return jsonResponse({
      id: chamber.id,
      code: chamber.code,
      deleted: true,
      mode: 'soft',
      message: `Chamber "${chamber.name}" dinonaktifkan karena memiliki riwayat data telemetri.`,
    });
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}

