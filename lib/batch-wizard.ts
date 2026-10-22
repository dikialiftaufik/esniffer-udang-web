/**
 * Aturan validasi wizard batch baru (butir 12) — fungsi murni.
 *
 * Nilai form masuk sebagai string, hasil keluar peta `field → pesan galat`.
 * Dipisah dari komponen halaman supaya aturannya bisa diuji langsung di
 * suite unit dan tidak ikut mati bersama state React.
 */
import {
  COOLER_TEMP_MAX_C,
  COOLER_TEMP_MIN_C,
  DatasetValidationError,
  INITIAL_TEMP_MAX_C,
  INITIAL_TEMP_MIN_C,
  isColdChainCompliant,
  isProcurementWindow,
  transportDurationMs,
  wibInputToUtc,
} from '../shared/dataset.ts';

export type WizardErrors = Record<string, string>;

/** Pesan tunggal untuk ketiga titik waktu yang wajib di jendela pengadaan. */
const WINDOW_MESSAGE = 'Harus di antara 05:00–08:00 WIB (Anda mengisi jam di luar jendela).';

/** Nilai `sourceType` yang diakui kontrak API (lowercase). */
export const SOURCE_TYPE_VALUES = ['market', 'supermarket', 'farm'] as const;
export type SourceTypeValue = (typeof SOURCE_TYPE_VALUES)[number];

/**
 * Nilai numerik dari input form: null bila kosong, NaN bila isian bukan
 * angka (pesan galat "bukan bilangan" lebih tepat daripada "wajib diisi").
 */
export function parseFormNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/** Parse input `datetime-local` sebagai waktu WIB → Date UTC. */
export function parseWibInput(value: string): { date?: Date; error?: string } {
  if (value.trim() === '') return { error: 'Wajib diisi.' };
  try {
    return { date: wibInputToUtc(value.replace('T', ' ')) };
  } catch {
    return { error: 'Format tanggal tidak valid.' };
  }
}

/**
 * Konversi input `datetime-local` berlabel WIB menjadi ISO UTC untuk disimpan.
 * Memakai interpretasi WIB yang sama dengan validasinya, bukan waktu lokal
 * device — supaya yang tersimpan sama dengan yang dilihat dan diuji.
 */
export function wibInputToUtcIso(value: string): string {
  const parsed = parseWibInput(value);
  if (!parsed.date) {
    throw new DatasetValidationError('INVALID_DATETIME', `Format tanggal tidak valid: ${value}`);
  }
  return parsed.date.toISOString();
}

/** Field milik langkah 1 — keberangkatan & sumber. */
export const STEP_A_FIELDS = ['departedAt', 'coolerDeparture', 'marketSource', 'sourceType'] as const;
/** Field milik langkah 2 — pembelian, kedatangan, kondisi & dokumentasi. */
export const STEP_B_FIELDS = [
  'procuredAt',
  'arrivedAt',
  'initialCondition',
  'shrimpCount',
  'shrimpLengthCm',
  'totalWeightG',
  'initialTempC',
  'coolerMarket',
  'coolerLab',
  'photos',
] as const;

/** Nomor langkah (0-based) yang memiliki sebuah field galat. */
export function stepOfField(key: string): number {
  if ((STEP_A_FIELDS as readonly string[]).includes(key)) return 0;
  if ((STEP_B_FIELDS as readonly string[]).includes(key)) return 1;
  return 2;
}

export interface StepAInput {
  departedAt: string;
  coolerDeparture: string;
  marketSource: string;
  sourceType: string;
}

export interface StepBInput {
  procuredAt: string;
  arrivedAt: string;
  departedAt: string;
  shrimpCount: string;
  shrimpLengthCm: string;
  totalWeightG: string;
  initialTempC: string;
  coolerMarket: string;
  coolerLab: string;
  deviationAck: boolean;
}

export interface GroupFormInput {
  labTempC: string;
  visualCheck: string;
  labWeightBeforeG: string;
  labWeightAfterG: string;
  sampleShrimpCount: string;
}

/**
 * Langkah 1 — keberangkatan & sumber: jam berangkat (05:00–08:00 WIB), suhu
 * cool box saat berangkat, sumber (teks bebas), dan jenis sumber (dropdown).
 * Urutan berangkat → beli baru bisa diperiksa di langkah 2 karena jam beli
 * diisi di sana.
 */
export function validateStepA(input: StepAInput): WizardErrors {
  const e: WizardErrors = {};

  const dep = parseWibInput(input.departedAt);
  if (dep.error) {
    e.departedAt = dep.error;
  } else if (dep.date && !isProcurementWindow(dep.date)) {
    e.departedAt = WINDOW_MESSAGE;
  }

  const cooler = parseFormNumber(input.coolerDeparture);
  if (cooler === null) {
    e.coolerDeparture = 'Wajib diisi.';
  } else if (!(cooler >= COOLER_TEMP_MIN_C && cooler <= COOLER_TEMP_MAX_C)) {
    e.coolerDeparture = `Harus ${COOLER_TEMP_MIN_C} sampai ${COOLER_TEMP_MAX_C} °C.`;
  }

  const source = input.marketSource.trim();
  if (source === '') {
    e.marketSource = 'Wajib diisi.';
  } else if (source.length > 100) {
    e.marketSource = 'Maksimal 100 karakter.';
  }

  if (!(SOURCE_TYPE_VALUES as readonly string[]).includes(input.sourceType)) {
    e.sourceType = 'Wajib dipilih.';
  }

  return e;
}

/**
 * Langkah 2 — pembelian, kedatangan, kondisi & dokumentasi: jam beli dan jam
 * tiba (keduanya 05:00–08:00 WIB), urutan berangkat < beli < tiba, durasi
 * cold-chain, lalu jumlah/panjang/berat/suhu udang dan suhu cool box.
 */
export function validateStepB(input: StepBInput): WizardErrors {
  const e: WizardErrors = {};

  const dep = parseWibInput(input.departedAt);
  const proc = parseWibInput(input.procuredAt);
  const arr = parseWibInput(input.arrivedAt);

  if (proc.error) {
    e.procuredAt = proc.error;
  } else if (proc.date && !isProcurementWindow(proc.date)) {
    e.procuredAt = WINDOW_MESSAGE;
  } else if (proc.date && dep.date && transportDurationMs(dep.date, proc.date) <= 0) {
    e.procuredAt = 'Tanggal dan jam beli harus setelah tanggal dan jam berangkat.';
  }

  if (arr.error) {
    e.arrivedAt = arr.error;
  } else if (arr.date && !isProcurementWindow(arr.date)) {
    e.arrivedAt = WINDOW_MESSAGE;
  } else if (arr.date && proc.date) {
    if (transportDurationMs(proc.date, arr.date) <= 0) {
      e.arrivedAt = 'Tanggal dan jam tiba harus setelah tanggal dan jam beli.';
    } else if (!isColdChainCompliant(proc.date, arr.date) && !input.deviationAck) {
      e.arrivedAt = 'Melebihi 3 jam — centang deviasi di bawah untuk lanjut.';
    }
  }

  const count = parseFormNumber(input.shrimpCount);
  if (count === null) {
    e.shrimpCount = 'Wajib diisi.';
  } else if (!Number.isInteger(count) || count < 10) {
    e.shrimpCount = 'Minimal 10 ekor (bilangan bulat).';
  }

  const len = parseFormNumber(input.shrimpLengthCm);
  if (len === null) {
    e.shrimpLengthCm = 'Wajib diisi.';
  } else if (!(len >= 1 && len <= 50)) {
    e.shrimpLengthCm = 'Harus 1 sampai 50 cm.';
  }

  const w = parseFormNumber(input.totalWeightG);
  if (w === null) {
    e.totalWeightG = 'Wajib diisi.';
  } else if (!(w > 0) || w > 2000) {
    e.totalWeightG = 'Harus lebih dari 0 sampai 2000 gram.';
  }

  const t = parseFormNumber(input.initialTempC);
  if (t === null) {
    e.initialTempC = 'Wajib diisi.';
  } else if (t < INITIAL_TEMP_MIN_C || t > INITIAL_TEMP_MAX_C) {
    e.initialTempC = `Harus ${INITIAL_TEMP_MIN_C} sampai ${INITIAL_TEMP_MAX_C} °C.`;
  }

  const cmarket = parseFormNumber(input.coolerMarket);
  if (cmarket === null) {
    e.coolerMarket = 'Wajib diisi.';
  } else if (cmarket < COOLER_TEMP_MIN_C || cmarket > COOLER_TEMP_MAX_C) {
    e.coolerMarket = `Harus ${COOLER_TEMP_MIN_C} sampai ${COOLER_TEMP_MAX_C} °C.`;
  }

  const clab = parseFormNumber(input.coolerLab);
  if (clab === null) {
    e.coolerLab = 'Wajib diisi.';
  } else if (clab < COOLER_TEMP_MIN_C || clab > COOLER_TEMP_MAX_C) {
    e.coolerLab = `Harus ${COOLER_TEMP_MIN_C} sampai ${COOLER_TEMP_MAX_C} °C.`;
  }

  return e;
}

/**
 * Aturan kolom grup tanpa prefiks — sumber tunggal untuk wizard batch baru
 * maupun form edit grup di halaman detail (butir 3: validasi tidak disalin).
 */
export function validateGroupFields(group: GroupFormInput): Record<string, string> {
  const e: Record<string, string> = {};

  const t = parseFormNumber(group.labTempC);
  if (t === null) {
    e.labTempC = 'Wajib diisi.';
  } else if (t < -2 || t > 30) {
    e.labTempC = 'Harus -2 sampai 30 °C.';
  }

  if (group.visualCheck.trim() === '') {
    e.visualCheck = 'Wajib dipilih.';
  }

  const lwBefore = parseFormNumber(group.labWeightBeforeG);
  if (lwBefore === null) {
    e.labWeightBeforeG = 'Wajib diisi.';
  } else if (!(lwBefore > 0)) {
    e.labWeightBeforeG = 'Harus lebih dari 0.';
  }

  const lwAfter = parseFormNumber(group.labWeightAfterG);
  if (lwAfter === null) {
    e.labWeightAfterG = 'Wajib diisi.';
  } else if (!(lwAfter > 0)) {
    e.labWeightAfterG = 'Harus lebih dari 0.';
  }

  const c = parseFormNumber(group.sampleShrimpCount);
  if (c === null) {
    e.sampleShrimpCount = 'Wajib diisi.';
  } else if (!Number.isInteger(c) || c < 3 || c > 5) {
    e.sampleShrimpCount = 'Harus 3–5 ekor.';
  }

  return e;
}

/** Aturan kolom grup dengan prefiks grup (dipakai wizard). */
export function validateGroupForm(
  prefix: 'sr' | 'sd',
  group: GroupFormInput
): WizardErrors {
  const e: WizardErrors = {};
  for (const [field, message] of Object.entries(validateGroupFields(group))) {
    e[`${prefix}-${field}`] = message;
  }
  return e;
}

/**
 * Peringatan (bukan error): berat sampel sesudah lebih kecil dari sebelum.
 * Penyusutan air evaporasi itu sah, jadi angka ini hanya diminta dicatat —
 * tidak memblokir penyimpanan.
 */
export function groupWeightWarning(group: GroupFormInput): string | null {
  const before = parseFormNumber(group.labWeightBeforeG);
  const after = parseFormNumber(group.labWeightAfterG);
  if (before === null || after === null || Number.isNaN(before) || Number.isNaN(after)) {
    return null;
  }
  if (after < before) {
    return `Berat sesudah (${after} g) lebih kecil dari berat sebelum (${before} g) — catat alasan bila memang penyusutan.`;
  }
  return null;
}
