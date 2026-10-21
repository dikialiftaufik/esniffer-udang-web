import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseFormNumber,
  parseWibInput,
  stepOfField,
  validateGroupFields,
  validateGroupForm,
  groupWeightWarning,
  validateStepA,
  validateStepB,
  wibInputToUtcIso,
} from '../lib/batch-wizard.ts';
import { wibDateTimeLocal } from '../shared/dataset.ts';

/** Nilai langkah A yang sah, dipakai sebagai basis tiap kasus. */
const stepAOk = {
  procuredAt: '2026-10-21T07:00',
  arrivedAt: '2026-10-21T09:00',
  marketSource: 'Pasar Induk Kramat Jati',
  deviationAck: false,
};

/** Nilai langkah B yang sah. */
const stepBOk = {
  shrimpCount: '12',
  shrimpLengthCm: '12.5',
  totalWeightG: '480',
  initialTempC: '8.5',
  coolerMarket: '2.5',
  coolerLab: '3',
};

const groupOk = {
  labTempC: '7.7',
  visualCheck: 'normal',
  labWeightBeforeG: '482',
  labWeightAfterG: '478.5',
  sampleShrimpCount: '4',
};

describe('lib/batch-wizard: validator per langkah wizard batch (butir 12)', () => {
  describe('langkah A — Pengadaan', () => {
    it('nilai sah tidak menghasilkan galat', () => {
      assert.deepStrictEqual(validateStepA(stepAOk), {});
    });

    it('jam beli kosong dan di luar jendela 06:00–08:00 WIB ditolak', () => {
      assert.strictEqual(validateStepA({ ...stepAOk, procuredAt: '' }).procuredAt, 'Wajib diisi.');
      assert.match(
        validateStepA({ ...stepAOk, procuredAt: '2026-10-21T09:30' }).procuredAt ?? '',
        /06:00–08:00 WIB/
      );
    });

    it('sumber wajib diisi dan maksimal 100 karakter', () => {
      assert.strictEqual(validateStepA({ ...stepAOk, marketSource: '  ' }).marketSource, 'Wajib diisi.');
      assert.strictEqual(
        validateStepA({ ...stepAOk, marketSource: 'x'.repeat(101) }).marketSource,
        'Maksimal 100 karakter.'
      );
    });

    it('jam tiba harus setelah jam beli', () => {
      const errs = validateStepA({ ...stepAOk, arrivedAt: '2026-10-21T06:30' });
      assert.match(errs.arrivedAt ?? '', /harus setelah tanggal dan jam beli/);
    });

    it('durasi lebih dari 3 jam butuh catatan deviasi', () => {
      const slow = { ...stepAOk, arrivedAt: '2026-10-21T11:00' };
      assert.match(validateStepA(slow).arrivedAt ?? '', /Melebihi 3 jam/);
      assert.strictEqual(validateStepA({ ...slow, deviationAck: true }).arrivedAt, undefined);
    });
  });

  describe('langkah B — Kondisi & dokumentasi', () => {
    it('nilai sah tidak menghasilkan galat', () => {
      assert.deepStrictEqual(validateStepB(stepBOk), {});
    });

    it('jumlah udang minimal 10 ekor dan harus bilangan bulat', () => {
      assert.strictEqual(validateStepB({ ...stepBOk, shrimpCount: '' }).shrimpCount, 'Wajib diisi.');
      assert.strictEqual(
        validateStepB({ ...stepBOk, shrimpCount: '9' }).shrimpCount,
        'Minimal 10 ekor (bilangan bulat).'
      );
      assert.strictEqual(
        validateStepB({ ...stepBOk, shrimpCount: '12.5' }).shrimpCount,
        'Minimal 10 ekor (bilangan bulat).'
      );
    });

    it('panjang 1–50 cm, berat > 0 sampai 2000 gram, suhu -2 sampai 30 °C', () => {
      assert.strictEqual(
        validateStepB({ ...stepBOk, shrimpLengthCm: '0.5' }).shrimpLengthCm,
        'Harus 1 sampai 50 cm.'
      );
      assert.strictEqual(
        validateStepB({ ...stepBOk, totalWeightG: '0' }).totalWeightG,
        'Harus lebih dari 0 sampai 2000 gram.'
      );
      assert.strictEqual(
        validateStepB({ ...stepBOk, totalWeightG: '2001' }).totalWeightG,
        'Harus lebih dari 0 sampai 2000 gram.'
      );
      assert.strictEqual(
        validateStepB({ ...stepBOk, initialTempC: '31' }).initialTempC,
        'Harus -2 sampai 30 °C.'
      );
    });

    it('dua suhu cool box dibatasi 0–4 °C (butir 7)', () => {
      assert.strictEqual(validateStepB({ ...stepBOk, coolerMarket: '4.5' }).coolerMarket, 'Harus 0–4 °C.');
      assert.strictEqual(validateStepB({ ...stepBOk, coolerLab: '-1' }).coolerLab, 'Harus 0–4 °C.');
      assert.strictEqual(validateStepB({ ...stepBOk, coolerMarket: '0' }).coolerMarket, undefined);
      assert.strictEqual(validateStepB({ ...stepBOk, coolerLab: '4' }).coolerLab, undefined);
      assert.strictEqual(validateStepB({ ...stepBOk, coolerLab: '' }).coolerLab, 'Wajib diisi.');
    });
  });

  describe('langkah C — Pengelompokan', () => {
    it('nilai sah tidak menghasilkan galat', () => {
      assert.deepStrictEqual(validateGroupForm('sr', groupOk), {});
    });

    it('galat memakai prefiks grup agar tidak saling tertimpa', () => {
      const errs = validateGroupForm('sd', { ...groupOk, labTempC: '', visualCheck: '' });
      assert.strictEqual(errs['sd-labTempC'], 'Wajib diisi.');
      assert.strictEqual(errs['sd-visualCheck'], 'Wajib dipilih.');
      assert.strictEqual(errs['sr-labTempC'], undefined);
    });

    it('bobot sampel harus lebih dari 0 dan jumlah sampel 3–5 ekor', () => {
      const errs = validateGroupForm('sr', {
        ...groupOk,
        labWeightBeforeG: '0',
        labWeightAfterG: '-2',
        sampleShrimpCount: '2',
      });
      assert.strictEqual(errs['sr-labWeightBeforeG'], 'Harus lebih dari 0.');
      assert.strictEqual(errs['sr-labWeightAfterG'], 'Harus lebih dari 0.');
      assert.strictEqual(errs['sr-sampleShrimpCount'], 'Harus 3–5 ekor.');
    });
  });

  describe('pemetaan field ke langkah', () => {    it('field langkah A/B/C dipetakan dengan benar', () => {
      assert.strictEqual(stepOfField('procuredAt'), 0);
      assert.strictEqual(stepOfField('marketSource'), 0);
      assert.strictEqual(stepOfField('arrivedAt'), 0);
      assert.strictEqual(stepOfField('shrimpCount'), 1);
      assert.strictEqual(stepOfField('coolerLab'), 1);
      assert.strictEqual(stepOfField('photos'), 1);
      assert.strictEqual(stepOfField('sr-labTempC'), 2);
      assert.strictEqual(stepOfField('sd-sampleShrimpCount'), 2);
    });
  });

  describe('waktu WIB (butir 5)', () => {
    it('input datetime-local dibaca sebagai WIB lalu disimpan sebagai UTC', () => {
      assert.strictEqual(wibInputToUtcIso('2026-10-21T07:00'), '2026-10-21T00:00:00.000Z');
      assert.strictEqual(parseWibInput('2026-10-21T07:00').date?.toISOString(), '2026-10-21T00:00:00.000Z');
    });

    it('nilai kosong dan format salah ditolak dengan pesan yang jelas', () => {
      assert.strictEqual(parseWibInput('').error, 'Wajib diisi.');
      assert.strictEqual(parseWibInput('bukan tanggal').error, 'Format tanggal tidak valid.');
    });

    it('jam device diformat dalam zona WIB, bukan zona lokal device', () => {
      // 2026-10-21T00:00:00Z = 07:00 WIB
      assert.strictEqual(wibDateTimeLocal(new Date('2026-10-21T00:00:00.000Z')), '2026-10-21T07:00');
      assert.strictEqual(wibDateTimeLocal(new Date('2026-10-20T20:00:00.000Z')), '2026-10-21T03:00');
    });

    it('angka form: kosong jadi null, isian bukan angka jadi NaN', () => {
      assert.strictEqual(parseFormNumber(''), null);
      assert.strictEqual(parseFormNumber('  '), null);
      assert.ok(Number.isNaN(parseFormNumber('abc') as number));
      assert.strictEqual(parseFormNumber('12.5'), 12.5);
    });
  });

  describe('aturan kolom grup — sumber tunggal wizard & form edit detail', () => {
    const groupOk = {
      labTempC: '7.7',
      visualCheck: 'normal',
      labWeightBeforeG: '482',
      labWeightAfterG: '486',
      sampleShrimpCount: '4',
    };

    it('nilai sah tidak menghasilkan galat', () => {
      assert.deepStrictEqual(validateGroupFields(groupOk), {});
    });

    it('rentang sama dengan wizard: suhu -2..30, berat > 0, sampel 3–5', () => {
      assert.strictEqual(validateGroupFields({ ...groupOk, labTempC: '31' }).labTempC, 'Harus -2 sampai 30 °C.');
      assert.strictEqual(validateGroupFields({ ...groupOk, labTempC: '' }).labTempC, 'Wajib diisi.');
      assert.strictEqual(
        validateGroupFields({ ...groupOk, labWeightBeforeG: '0' }).labWeightBeforeG,
        'Harus lebih dari 0.'
      );
      assert.strictEqual(
        validateGroupFields({ ...groupOk, labWeightAfterG: '-3' }).labWeightAfterG,
        'Harus lebih dari 0.'
      );
      assert.strictEqual(
        validateGroupFields({ ...groupOk, sampleShrimpCount: '2' }).sampleShrimpCount,
        'Harus 3–5 ekor.'
      );
      assert.strictEqual(validateGroupFields({ ...groupOk, visualCheck: '' }).visualCheck, 'Wajib dipilih.');
    });

    it('versi berprefiks memakai aturan yang sama (wizard SR/SD)', () => {
      const prefixed = validateGroupForm('sd', { ...groupOk, labTempC: '99' });
      assert.strictEqual(prefixed['sd-labTempC'], 'Harus -2 sampai 30 °C.');
      assert.strictEqual(prefixed['sr-labTempC'], undefined);
    });

    it('peringatan berat sesudah lebih kecil dari sebelum — bukan error', () => {
      const warn = groupWeightWarning({ ...groupOk, labWeightAfterG: '470' });
      assert.ok(warn && warn.includes('lebih kecil'));
      assert.strictEqual(groupWeightWarning(groupOk), null);
      assert.strictEqual(groupWeightWarning({ ...groupOk, labWeightAfterG: '490' }), null);
      assert.strictEqual(groupWeightWarning({ ...groupOk, labWeightAfterG: '' }), null);
    });
  });
});
