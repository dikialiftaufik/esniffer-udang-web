/**
 * Draf wizard batch baru (revisi putaran 2 butir 13): teks form tersimpan di
 * localStorage browser, bukan di server. Foto tidak ikut — File tidak bisa
 * diserialisasi ke JSON dan tetap harus dipilih ulang secara manual.
 */

export interface BatchDraft {
  step?: number;
  procuredAt?: string;
  arrivedAt?: string;
  marketSource?: string;
  sourceType?: string;
  shrimpCount?: string;
  shrimpLengthCm?: string;
  totalWeightG?: string;
  initialCondition?: string;
  initialTempC?: string;
  coolerMarket?: string;
  coolerLab?: string;
  deviationAck?: boolean;
  groupSr?: unknown;
  groupSd?: unknown;
}

const BATCH_DRAFT_KEY = 'esniffer:batch-draft-v1';

const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Penjelajah mode privat/kuota penuh boleh melempar; draf lalu diabaikan.
    return null;
  }
};

/** Draf dianggap ada isi bila user mengetik sesuatu — waktu oxothe dari jam device tidak dihitung. */
export const draftMeaningful = (d: BatchDraft): boolean =>
  [
    d.marketSource,
    d.sourceType,
    d.shrimpCount,
    d.shrimpLengthCm,
    d.totalWeightG,
    d.initialCondition,
    d.initialTempC,
    d.coolerMarket,
    d.coolerLab,
  ].some((v) => typeof v === 'string' && v.trim() !== '');

export function saveBatchDraft(draft: BatchDraft): void {
  if (!draftMeaningful(draft)) {
    // Semua dikosongkan user? Bersihkan draf agar tidak bangkit dari kuburan.
    removeBatchDraft();
    return;
  }
  try {
    storage()?.setItem(BATCH_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Tanpa localStorage: wizard tetap jalan, hanya tanpa draf.
  }
}

export function loadBatchDraft(): BatchDraft | null {
  try {
    const raw = storage()?.getItem(BATCH_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed as BatchDraft;
  } catch {
    return null;
  }
}

export function removeBatchDraft(): void {
  try {
    storage()?.removeItem(BATCH_DRAFT_KEY);
  } catch {
    // Abaikan.
  }
}
