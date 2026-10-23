import { prisma } from '../../../../../../lib/db/client.ts';
import { requireAuth } from '../../../../../../lib/auth/guard.ts';
import { jsonResponse, errorResponse, getRequestId } from '../../../../../../lib/api/response.ts';
import { notFound } from '../../../../../../lib/api/errors.ts';
import { serializeSession } from '../../../../../../lib/api/dataset.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const requestId = getRequestId(request);

  try {
    await requireAuth(request, ['VIEWER', 'ADMIN']);
    const { sessionId } = await context.params;

    const session = await prisma.measurementSession.findFirst({
      where: UUID_REGEX.test(sessionId) ? { id: sessionId } : { sessionId },
      include: {
        chamber: { select: { id: true, code: true, name: true } },
        device: { select: { id: true, mqttDeviceId: true, name: true } },
        photos: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, url: true, caption: true },
        },
      },
    });

    if (!session) {
      throw notFound(`Session "${sessionId}" not found`);
    }

    // Ambil semua data telemetri yang terhubung dengan sesi ini
    const readings = await prisma.sensorReading.findMany({
      where: {
        OR: [
          { sessionId: session.id },
          ...(session.endedAtUtc && session.chamberId && session.deviceId
            ? [
                {
                  chamberId: session.chamberId,
                  deviceId: session.deviceId,
                  measuredAt: {
                    gte: session.startedAtUtc,
                    lte: session.endedAtUtc,
                  },
                },
              ]
            : []),
        ],
      },
      orderBy: [
        { measuredAt: 'asc' },
        { historySequence: 'asc' },
      ],
      select: {
        id: true,
        measuredAt: true,
        receivedAt: true,
        isBaseline: true,
        temperatureC: true,
        humidityPercent: true,
        mq137Raw: true,
        mq136Raw: true,
        mq4Raw: true,
      },
    });

    const startTimeMs = session.startedAtUtc.getTime();

    // Transformasi data untuk grafik Recharts
    const chartData = readings.map((r) => {
      const measuredMs = r.measuredAt ? r.measuredAt.getTime() : startTimeMs;
      const secondsFromStart = Math.max(0, Math.round((measuredMs - startTimeMs) / 1000));
      return {
        id: r.id,
        measuredAt: r.measuredAt ? r.measuredAt.toISOString() : r.receivedAt.toISOString(),
        seconds: secondsFromStart,
        isBaseline: r.isBaseline ?? false,
        mq137: r.mq137Raw ? Number(r.mq137Raw) : null,
        mq136: r.mq136Raw ? Number(r.mq136Raw) : null,
        mq4: r.mq4Raw ? Number(r.mq4Raw) : null,
        temperature: r.temperatureC ? Number(r.temperatureC) : null,
        humidity: r.humidityPercent ? Number(r.humidityPercent) : null,
      };
    });

    // Kalkulasi ringkasan metrik (Baseline, Peak, Delta)
    const baselinePoints = chartData.filter((d) => d.isBaseline);
    const samplePoints = chartData.filter((d) => !d.isBaseline);

    const calcAvg = (arr: Array<number | null>) => {
      const valid = arr.filter((v): v is number => v !== null && Number.isFinite(v));
      return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };

    const calcMax = (arr: Array<number | null>) => {
      const valid = arr.filter((v): v is number => v !== null && Number.isFinite(v));
      return valid.length > 0 ? Math.max(...valid) : null;
    };

    const baselineMq137 =
      session.baselineMq137 !== null
        ? Number(session.baselineMq137)
        : calcAvg(baselinePoints.map((p) => p.mq137));
    const baselineMq136 =
      session.baselineMq136 !== null
        ? Number(session.baselineMq136)
        : calcAvg(baselinePoints.map((p) => p.mq136));
    const baselineMq4 =
      session.baselineMq4 !== null
        ? Number(session.baselineMq4)
        : calcAvg(baselinePoints.map((p) => p.mq4));

    const peakMq137 = calcMax(samplePoints.length > 0 ? samplePoints.map((p) => p.mq137) : chartData.map((p) => p.mq137));
    const peakMq136 = calcMax(samplePoints.length > 0 ? samplePoints.map((p) => p.mq136) : chartData.map((p) => p.mq136));
    const peakMq4 = calcMax(samplePoints.length > 0 ? samplePoints.map((p) => p.mq4) : chartData.map((p) => p.mq4));

    const metrics = {
      totalReadings: chartData.length,
      baselineCount: baselinePoints.length,
      sampleCount: samplePoints.length,
      baseline: {
        mq137: baselineMq137 !== null ? Number(baselineMq137.toFixed(2)) : null,
        mq136: baselineMq136 !== null ? Number(baselineMq136.toFixed(2)) : null,
        mq4: baselineMq4 !== null ? Number(baselineMq4.toFixed(2)) : null,
      },
      peak: {
        mq137: peakMq137 !== null ? Number(peakMq137.toFixed(2)) : null,
        mq136: peakMq136 !== null ? Number(peakMq136.toFixed(2)) : null,
        mq4: peakMq4 !== null ? Number(peakMq4.toFixed(2)) : null,
      },
      delta: {
        mq137: peakMq137 !== null && baselineMq137 !== null ? Number((peakMq137 - baselineMq137).toFixed(2)) : null,
        mq136: peakMq136 !== null && baselineMq136 !== null ? Number((peakMq136 - baselineMq136).toFixed(2)) : null,
        mq4: peakMq4 !== null && baselineMq4 !== null ? Number((peakMq4 - baselineMq4).toFixed(2)) : null,
      },
      avgTemperature: calcAvg(chartData.map((p) => p.temperature)),
      avgHumidity: calcAvg(chartData.map((p) => p.humidity)),
    };

    return jsonResponse({
      session: {
        ...serializeSession(session),
        chamber: session.chamber,
        device: session.device,
        photos: session.photos,
      },
      metrics,
      readings: chartData,
    });
  } catch (err) {
    return errorResponse(err, requestId, request);
  }
}
