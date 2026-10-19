/**
 * Unit test ambang kestabilan (revisi putaran 2 butir 9): rentang, CV,
 * dan drift diuji pada data sintetis lolos dan tidak lolos — termasuk
 * kasus siklus kompresor dan kasus drift menurut tabel pembimbing.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stabilityConditionFor,
  stabilityMetrics,
  isGasStable,
  isTempStable,
  isHumidityStable,
  MIN_STABILITY_SAMPLES,
  hasEnoughData,
  type StabilityPoint,
} from '../lib/stability.ts';

/** Deret konstan dengan derau ±noise di sekitar `base`. */
function flat(base: number, noise: number, samples: number): StabilityPoint[] {
  const points: StabilityPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const wobble = i % 2 === 0 ? noise : -noise;
    points.push({ value: base + wobble, atMs: i * 20_000 });
  }
  return points;
}

/** Deret linear naik: `slope` unit per sampel (drift konstan). */
function ramp(base: number, slope: number, samples: number): StabilityPoint[] {
  const points: StabilityPoint[] = [];
  for (let i = 0; i < samples; i++) {
    points.push({ value: base + slope * i, atMs: i * 20_000 });
  }
  return points;
}

/** Deret siklus kompresor: naik-turun antara lo dan hi tiap beberapa titik. */
function oscillate(lo: number, hi: number, samples: number): StabilityPoint[] {
  const points: StabilityPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const up = Math.floor(i / 4) % 2 === 0 ? hi : lo;
    points.push({ value: up, atMs: i * 20_000 });
  }
  return points;
}

describe('stabilityConditionFor (pemetaan kolom ambang)', () => {
  it('memetakan kondisi ruang, dingin plain, dan dingin chamber', () => {
    assert.strictEqual(stabilityConditionFor('ROOM_TEMP', null), 'ROOM_TEMP');
    assert.strictEqual(stabilityConditionFor('COLD', 'PLAIN_FRIDGE'), 'COLD_PLAIN_FRIDGE');
    assert.strictEqual(stabilityConditionFor('COLD', 'CHAMBER'), 'COLD_CHAMBER');
  });

  it('menolak kombinasi tak dikenal', () => {
    assert.throws(() => stabilityConditionFor('WARM', 'CHAMBER'));
    assert.throws(() => stabilityConditionFor('COLD', 'ICE_BOX'));
  });
});

describe('stabilityMetrics (rentang, CV, drift)', () => {
  it('memberi null bila data kurang dari minimum sampel', () => {
    assert.strictEqual(stabilityMetrics(flat(450, 1, MIN_STABILITY_SAMPLES - 1)), null);
    assert.strictEqual(stabilityMetrics([]), null);
  });

  it('deret datar dekat rata-rata lolos ketiga ambang ruang', () => {
    const m = stabilityMetrics(flat(450, 1, 300))!;
    assert.ok(m);
    // Rentang bergerak 449..451 → proportion 2/450 ≈ 0,44 %.
    assert.ok(m.rangeRatio <= 0.02, `rangeRatio ${m.rangeRatio}`);
    assert.ok(m.cv <= 0.01, `cv ${m.cv}`);
    assert.ok(m.driftPer10Min <= 0.01, `drift ${m.driftPer10Min}`);
    assert.ok(isGasStable(m, 'ROOM_TEMP'));
  });

  it('siklus kompresor suhu 4±1 °C plain: rentang 1 °C lolos plain, gagal chamber', () => {
    // Siklus 3,6..4,4 °C: rentang 0,8 °C — plain boleh ≤ 1 °C, chamber ≤ 0,5 °C.
    const points = oscillate(3.6, 4.4, 100);
    assert.ok(isTempStable(points, 'COLD_PLAIN_FRIDGE'));
    assert.strictEqual(isTempStable(points, 'COLD_CHAMBER'), false);
  });

  it('drift gas 1 % per 10 menit: data dengan drift ≈ 6 % gagal semua kolom', () => {
    // Naik 0,9 ADC per 20 detik pada basis 450 → ≈ 6 % per 10 menit.
    const rising = ramp(450, 0.9, 300);
    const m = stabilityMetrics(rising)!;
    assert.ok(m.driftPer10Min > 0.02);
    assert.strictEqual(isGasStable(m, 'ROOM_TEMP'), false);
    assert.strictEqual(isGasStable(m, 'COLD_PLAIN_FRIDGE'), false);
    assert.strictEqual(isGasStable(m, 'COLD_CHAMBER'), false);
  });

  it('drift dalam ambang plain (≈ 1,8 % per 10 menit) lolos plain, gagal ruang', () => {
    // Naik total 8 ADC di atas basis 450 selama 10 menit: rentang 1,8 %,
    // CV kecil, dan drift 8/mean ≈ 1,8 % — di dalam plain (≤ 2 %), di
    // luar ambang ruang (≤ 1 %).
    const gentle = ramp(450, 8 / 29, 30); // 30 sampel × 20 s = jendela penuh 10 menit
    const m = stabilityMetrics(gentle)!;
    assert.ok(m.driftPer10Min > 0.01 && m.driftPer10Min <= 0.02, `drift ${m.driftPer10Min}`);
    assert.ok(isGasStable(m, 'COLD_PLAIN_FRIDGE'));
    assert.strictEqual(isGasStable(m, 'ROOM_TEMP'), false);
  });

  it('rentang persen besar pada gas ditolak sesuai kolom ruang', () => {
    const m = stabilityMetrics(flat(450, 12, 300))!; // rentang .48/450 ≈ 10 %
    assert.strictEqual(isGasStable(m, 'ROOM_TEMP'), false);
    assert.strictEqual(isGasStable(m, 'COLD_CHAMBER'), false);
  });
});

describe('isTempStable dan isHumidityStable (DHT22)', () => {
  it('suhu terbangun 1,3 °C ditolak pada semua kolom', () => {
    const points = oscillate(25.0, 26.3, 120);
    assert.strictEqual(isTempStable(points, 'ROOM_TEMP'), false);
    assert.strictEqual(isTempStable(points, 'COLD_PLAIN_FRIDGE'), false);
    assert.strictEqual(isTempStable(points, 'COLD_CHAMBER'), false);
  });

  it('RH rentang 1,5 % lolos semua kolom', () => {
    const points = oscillate(70, 71.5, 120);
    assert.ok(isHumidityStable(points, 'ROOM_TEMP'));
    assert.ok(isHumidityStable(points, 'COLD_PLAIN_FRIDGE'));
    assert.ok(isHumidityStable(points, 'COLD_CHAMBER'));
  });

  it('rata-rata RH 96 % ditolak hanya di kolom dingin chamber', () => {
    const points = oscillate(95.8, 96.2, 120); // rentang kecil, rata-rata 96 %
    assert.ok(isHumidityStable(points, 'ROOM_TEMP'), 'tanpa ceiling');
    assert.ok(isHumidityStable(points, 'COLD_PLAIN_FRIDGE'), 'tanpa ceiling');
    assert.strictEqual(isHumidityStable(points, 'COLD_CHAMBER'), false, 'RH < 95 %');
  });

  it('rentang RH 2,5 % lolos plain (≤ 3 %), ditolak ruang dan chamber', () => {
    const points = oscillate(70, 72.5, 120);
    assert.strictEqual(isHumidityStable(points, 'ROOM_TEMP'), false);
    assert.ok(isHumidityStable(points, 'COLD_PLAIN_FRIDGE'));
    assert.strictEqual(isHumidityStable(points, 'COLD_CHAMBER'), false);
  });

  it('sampel terjajar rapat (rentang waktu < setengah jendela) tidak dianggap stabil', () => {
    const few: StabilityPoint[] = [];
    for (let i = 0; i < MIN_STABILITY_SAMPLES; i++) {
      few.push({ value: 25, atMs: i * 5000 }); // total 149 s < 5 menit
    }
    assert.strictEqual(hasEnoughData(few), false);
    assert.strictEqual(isTempStable(few, 'ROOM_TEMP'), false);
  });
});
