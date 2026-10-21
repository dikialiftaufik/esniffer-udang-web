/**
 * Unit Test: konversi UTC → WIB untuk pecah kolom tanggal/jam CSV metadata.
 * Revisi pembimbing putaran 2 butir 5: fungsi murni `toWibParts` di lib,
 * offset tetap +7 (Indonesia tanpa DST), tanggal bergeser bila melewati
 * tengah malam WIB — jam tetap kolom terpisah.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toWibParts } from '../lib/api/csv.ts';

describe('toWibParts (butir 5, konversi di pembuat CSV)', () => {
  it('memisahkan tanggal dan jam, termasuk kasus lewat tengah malam', () => {
    // 17:30Z = 00:30 WIB keesokan harinya — tanggal bergeser, bukan jam.
    assert.deepStrictEqual(toWibParts(new Date('2099-06-05T17:30:00.000Z')), {
      date: '2099-06-06',
      time: '00:30:00',
    });
    assert.deepStrictEqual(toWibParts(new Date('2099-06-06T00:30:00.000Z')), {
      date: '2099-06-06',
      time: '07:30:00',
    });
  });

  it('kedua kolom bernilai tanggal YYYY-MM-DD dan jam HH:MM:SS', () => {
    const { date, time } = toWibParts(new Date('2099-06-05T23:59:59.000Z'));
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(time, /^\d{2}:\d{2}:\d{2}$/);
  });
});
