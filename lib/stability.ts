/**
 * Perhitungan kestabilan sensor sesi (revisi pembimbing putaran 2 butir 9).
 *
 * Nilai ambang di tabel pembimbing hidup DI SINI — parameter terpusat agar
 * kalibrasi dengan data alat nyata tidak menyentuh logika. Kegunaan setiap
 * ambang per sensor (semua batas atas; lolos = nilai <= ambang):
 *
 * | Sensor          | Metrik stabilitas         | Suhu ruang | Dingin non-chamber | Dingin chamber |
 * |-----------------|---------------------------|------------|--------------------|----------------|
 * | MQ-137/136/4    | rentang/rata-rata         | ≤ 2 %      | ≤ 5 %              | ≤ 3 %          |
 * |                 | CV (SD/rata-rata)         | ≤ 1 %      | ≤ 3 %              | ≤ 2 %          |
 * |                 | tren (drift) per 10 mnt   | ≤ 1 %      | ≤ 2 %              | ≤ 1,5 %        |
 * | DHT22 suhu      | rentang                   | ≤ 0,5 °C   | ≤ 1 °C             | ≤ 0,5 °C       |
 * | DHT22 RH        | rentang                   | ≤ 2 % RH   | ≤ 3 % RH           | ≤ 2 % RH       |
 * |                 | rata-rata RH              | —          | —                  | < 95 % RH      |
 *
 * Awal: sesi stabil hanya bila KESELURUHAN sensor lolos pada jendela yang
 * sama (worker yang memakai modul ini).
 */

/** Kolom ambang berdasarkan kondisi penyimpanan grup (butir 1). */
export type StabilityCondition = 'ROOM_TEMP' | 'COLD_PLAIN_FRIDGE' | 'COLD_CHAMBER';

/** Jendela evaluasi berjalan 10 menit terakhir. */
export const STABILITY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Data minimum agar kesimpulan berarti: pada 2 Hz jendela 10 menit bernilai
 * ≈ 1200 sampel; 30 sampel + setengah jendela waktu mencegah rentang kecil
 * dari segelintir tick dianggap stabil.
 */
export const MIN_STABILITY_SAMPLES = 30;
export const MIN_STABILITY_SPAN_MS = STABILITY_WINDOW_MS / 2;

/** Satu titik pengukuran: nilai sensor dan waktunya (ms sejak epoch). */
export interface StabilityPoint {
  value: number;
  atMs: number;
}

export interface StabilityMetrics {
  /** Rentang (max−min) dibagi rata-rata. */
  rangeRatio: number;
  /** SD dibagi rata-rata. */
  cv: number;
  /** Kemiringan regresi linear, bagian per 10 menit relatif rata-rata. */
  driftPer10Min: number;
}

const GAS_THRESHOLDS: Record<StabilityCondition, StabilityMetrics> = {
  ROOM_TEMP: { rangeRatio: 0.02, cv: 0.01, driftPer10Min: 0.01 },
  COLD_PLAIN_FRIDGE: { rangeRatio: 0.05, cv: 0.03, driftPer10Min: 0.02 },
  COLD_CHAMBER: { rangeRatio: 0.03, cv: 0.02, driftPer10Min: 0.015 },
};

const TEMP_RANGE_C: Record<StabilityCondition, number> = {
  ROOM_TEMP: 0.5,
  COLD_PLAIN_FRIDGE: 1.0,
  COLD_CHAMBER: 0.5,
};

const HUMIDITY_RANGE_PERCENT: Record<StabilityCondition, number> = {
  ROOM_TEMP: 2,
  COLD_PLAIN_FRIDGE: 3,
  COLD_CHAMBER: 2,
};

/** Syarat rata-rata RH < 95 % hanya ada di kolom dingin chamber. */
const HUMIDITY_CEILING: Partial<Record<StabilityCondition, number>> = {
  COLD_CHAMBER: 95,
};

/**
 * Memetakan kondisi penyimpanan grup ke kolom ambang.
 * `storageCondition`/`coldStorageMode` adalah nilai enum Prisma.
 */
export function stabilityConditionFor(
  storageCondition: string,
  coldStorageMode: string | null
): StabilityCondition {
  if (storageCondition === 'ROOM_TEMP') return 'ROOM_TEMP';
  if (storageCondition === 'COLD') {
    if (coldStorageMode === 'PLAIN_FRIDGE') return 'COLD_PLAIN_FRIDGE';
    if (coldStorageMode === 'CHAMBER') return 'COLD_CHAMBER';
  }
  throw new Error(
    `Kondisi penyimpanan tak dikenal: ${storageCondition}/${coldStorageMode ?? 'null'}`
  );
}

/** Sampel cukup banyak dan cukup lebar waktu untuk dinilai. */
export function hasEnoughData(points: StabilityPoint[]): boolean {
  if (points.length < MIN_STABILITY_SAMPLES) return false;
  let minAt = points[0].atMs;
  let maxAt = points[0].atMs;
  for (const p of points) {
    if (p.atMs < minAt) minAt = p.atMs;
    if (p.atMs > maxAt) maxAt = p.atMs;
  }
  return maxAt - minAt >= MIN_STABILITY_SPAN_MS;
}

/**
 * Rentang, CV, dan drift pada satu deret sampel. Mengembalikan null bila
 * data kurang (belum cukup sampel/jam) atau rata-rata tak berarti (≤ 0),
 * karena persen tanpa rata-rata tak boleh dihitung.
 */
export function stabilityMetrics(points: StabilityPoint[]): StabilityMetrics | null {
  if (!hasEnoughData(points)) return null;

  let sum = 0;
  for (const p of points) sum += p.value;
  const mean = sum / points.length;
  if (!Number.isFinite(mean) || mean <= 0) return null;

  let min = points[0].value;
  let max = points[0].value;
  for (const p of points) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
  }

  let sqDiffSum = 0;
  for (const p of points) sqDiffSum += (p.value - mean) ** 2;
  const sd = Math.sqrt(sqDiffSum / points.length);

  // Regresi linear sederhana: slope = Σ(t−t̄)(v−v̄) / Σ(t−t̄)².
  const timeMean =
    points.reduce((acc, p) => acc + p.atMs, 0) / points.length;
  let covSum = 0;
  let timeSqSum = 0;
  for (const p of points) {
    const dt = p.atMs - timeMean;
    covSum += dt * (p.value - mean);
    timeSqSum += dt * dt;
  }
  const slope = timeSqSum > 0 ? covSum / timeSqSum : 0;
  const driftPer10Min = Math.abs(slope) * 600_000 / mean;

  return {
    rangeRatio: (max - min) / mean,
    cv: sd / mean,
    driftPer10Min,
  };
}

/** Sensor gas MQ stabil menurut ketiga ambang kolom kondisinya. */
export function isGasStable(
  metrics: StabilityMetrics | null,
  condition: StabilityCondition
): boolean {
  if (!metrics) return false;
  const limit = GAS_THRESHOLDS[condition];
  return (
    metrics.rangeRatio <= limit.rangeRatio &&
    metrics.cv <= limit.cv &&
    metrics.driftPer10Min <= limit.driftPer10Min
  );
}

/** DHT22 suhu stabil bila rentangnya di bawah ambang kolomnya. */
export function isTempStable(
  points: StabilityPoint[],
  condition: StabilityCondition
): boolean {
  if (!hasEnoughData(points)) return false;
  let min = points[0].value;
  let max = points[0].value;
  for (const p of points) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
  }
  return max - min <= TEMP_RANGE_C[condition];
}

/** DHT22 RH stabil bila rentang di bawah ambang dan (dingin chamber) RH < 95 %. */
export function isHumidityStable(
  points: StabilityPoint[],
  condition: StabilityCondition
): boolean {
  if (!hasEnoughData(points)) return false;
  let min = points[0].value;
  let max = points[0].value;
  let sum = 0;
  for (const p of points) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
    sum += p.value;
  }
  const ceiling = HUMIDITY_CEILING[condition];
  if (ceiling !== undefined && sum / points.length >= ceiling) return false;
  return max - min <= HUMIDITY_RANGE_PERCENT[condition];
}
