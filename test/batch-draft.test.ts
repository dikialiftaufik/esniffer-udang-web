import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import {
  saveBatchDraft,
  loadBatchDraft,
  removeBatchDraft,
  draftMeaningful,
  type BatchDraft,
} from '../lib/batch-draft.ts';

/** Stub localStorage minimal (node tidak punya localStorage bawaan). */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

describe('Batch draft (revisi putaran 2, butir 13)', () => {
  const before = globalThis.localStorage;
  beforeEach(() => {
    globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  });
  after(() => {
    globalThis.localStorage = before;
  });

  const filled: BatchDraft = {
    step: 1,
    procuredAt: '2099-02-02T07:10',
    marketSource: 'Pasar Harapan Jaya',
    sourceType: 'market',
    shrimpCount: '12',
    totalWeightG: '485.5',
    coolerMarket: '1.2',
    coolerLab: '3.8',
  };

  it('simpan lalu muat kembali mengembalikan nilai yang sama', () => {
    saveBatchDraft(filled);
    assert.deepEqual(loadBatchDraft(), filled);
  });

  it('draf bermakna bila ada ketikan nyata; hanya waktu otomatis tidak dihitung', () => {
    assert.ok(draftMeaningful(filled));
    // Waktu dari jam device selalu terisi otomatis — bukan tanda user mengetik.
    assert.strictEqual(draftMeaningful({ procuredAt: '2099-02-02T07:00', arrivedAt: '2099-02-02T07:10' }), false);
    assert.strictEqual(draftMeaningful({ step: 2, groupSr: { labTempC: '6.5' } }), false);
    assert.strictEqual(draftMeaningful({}), false);
  });

  it('simpan draf kosong menghapus penyimpanan lama', () => {
    saveBatchDraft(filled);
    saveBatchDraft({ step: 0 });
    assert.strictEqual(loadBatchDraft(), null);
  });

  it('hapus draf membuat muat kembali null', () => {
    saveBatchDraft(filled);
    removeBatchDraft();
    assert.strictEqual(loadBatchDraft(), null);
    removeBatchDraft(); // tanpa error walau sudah tak ada
  });

  it('JSON rusak di penyimpanan mengembalikan null tanpa melempar', () => {
    globalThis.localStorage.setItem('esniffer:batch-draft-v1', '{teu lengkap');
    assert.strictEqual(loadBatchDraft(), null);
  });

  it('localStorage tidak tersedia: semua operasi aman', () => {
    globalThis.localStorage = undefined as unknown as Storage;
    saveBatchDraft(filled);
    assert.strictEqual(loadBatchDraft(), null);
    removeBatchDraft();
    globalThis.localStorage = new MemoryStorage() as unknown as Storage;
  });
});
