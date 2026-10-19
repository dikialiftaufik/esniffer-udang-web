"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../auth/AuthProvider';
import { toHistoryRows, nextCursorOf, historyMetaOf, type HistoryRow } from '../../lib/api/history.ts';

interface ExportPanelProps {
  chamberId?: string;
  activeDeviceId?: string | null;
}

export default function ExportPanel({ chamberId = 'CH-01', activeDeviceId }: ExportPanelProps) {
  const searchParams = useSearchParams();
  const { apiFetch } = useAuth();

  // Legacy URL compatibility
  const resolvedChamberId =
    chamberId === '1' ? 'CH-01' : chamberId === '2' ? 'CH-02' : chamberId;

  // Active range from URL
  const rangeParam = searchParams.get('range') || '1h';

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // History modal state
  const [showHistory, setShowHistory] = useState(false);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [watermark, setWatermark] = useState<string | null>(null);
  const [aboveCount, setAboveCount] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  // Halaman keyset saat ini (ref: hanya penjaga refresh, tak dirender).
  const historyPageRef = useRef(1);
  // Tumpukan kursor per halaman: [null, cursorHal2, ...]. Kursor ditandatangani
  // server dan terikat pada jendela from/to, jadi halaman sebelumnya
  // dikunjungi ulang lewat kursor simpanan, bukan fetch ulang halaman 1.
  const cursorStackRef = useRef<(string | null)[]>([null]);
  // Jendela waktu dibekukan saat modal dibuka; halaman lanjutan wajib memakai
  // from/to yang identik atau kursor ditolak server (filter hash mismatch).
  const windowRef = useRef<{ from: string; to: string } | null>(null);

  // Butir 10: tabel riwayat punya filter rentang sendiri — preset atau kustom
  // WIB (datetime-local memakai jam device). Berbeda dari range grafik URL.
  const [historyMode, setHistoryMode] = useState<'24h' | '7d' | '30d' | 'custom'>('24h');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const getHistoryBounds = (
    mode: '24h' | '7d' | '30d' | 'custom' = historyMode,
    fromRaw = customFrom,
    toRaw = customTo
  ): { from: string; to: string } | null => {
    const now = new Date();
    const hours = mode === '24h' ? 24 : mode === '7d' ? 24 * 7 : mode === '30d' ? 24 * 30 : 0;
    if (hours === 0) {
      if (!fromRaw || !toRaw) return null;
      const from = new Date(fromRaw);
      const to = new Date(toRaw);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null;
      return { from: from.toISOString(), to: to.toISOString() };
    }
    return { from: new Date(now.getTime() - hours * 3_600_000).toISOString(), to: now.toISOString() };
  };

  /** Ganti rentang tabel riwayat dan muat ulang halaman 1. */
  const applyHistoryRange = (mode: '24h' | '7d' | '30d' | 'custom', from = '', to = '') => {
    if (mode === 'custom') {
      const f = from || customFrom;
      const t = to || customTo;
      setCustomFrom(f);
      setCustomTo(t);
      if (!getHistoryBounds('custom', f, t)) {
        setHistoryError('Isi kedua tanggal dan jam kustom; "dari" harus sebelum "tujuan".');
        return;
      }
    }
    setHistoryMode(mode);
    setHistoryError(null);
    cursorStackRef.current = [null];
    windowRef.current = null;
    void fetchHistoryPage(null, 1, true);
  };

  const getRangeBounds = () => {
    const now = new Date();
    let durationMs = 60 * 60 * 1000; // 1h default
    if (rangeParam === '30s') durationMs = 30 * 1000;
    else if (rangeParam === '1m') durationMs = 60 * 1000;
    else if (rangeParam === '15m') durationMs = 15 * 60 * 1000;
    else if (rangeParam === '6h') durationMs = 6 * 60 * 60 * 1000;
    else if (rangeParam === '24h') durationMs = 24 * 60 * 60 * 1000;

    const from = new Date(now.getTime() - durationMs);
    return { from: from.toISOString(), to: now.toISOString() };
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    setExportError(null);

    const { from, to } = getRangeBounds();
    const query = new URLSearchParams({ from, to });
    if (activeDeviceId) query.set('deviceId', activeDeviceId);

    try {
      const res = await apiFetch(
        `/api/v1/chambers/${encodeURIComponent(resolvedChamberId)}/export?${query.toString()}`
      );

      if (res.status === 413) {
        setExportError(
          'Rentang waktu menghasilkan lebih dari 50.000 baris (PAYLOAD_TOO_LARGE). Silakan persempit rentang waktu ekspor.'
        );
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || `Gagal ekspor CSV (HTTP ${res.status})`;
        setExportError(msg);
        return;
      }

      // Download file directly
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `esniffer_${resolvedChamberId}_${rangeParam}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan saat ekspor CSV';
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  const fetchHistoryPage = async (cursorToken?: string | null, page = 1, resetWindow = false) => {
    setIsHistoryLoading(true);
    setHistoryError(null);

    if (resetWindow || !windowRef.current) {
      const bounds = getHistoryBounds();
      if (!bounds) {
        setHistoryError('Rentang kustom belum lengkap atau urutannya salah.');
        setIsHistoryLoading(false);
        return;
      }
      windowRef.current = bounds;
    }
    const { from, to } = windowRef.current;
    const query = new URLSearchParams({
      from,
      to,
      limit: '15',
    });
    if (cursorToken) query.set('cursor', cursorToken);
    if (activeDeviceId) query.set('deviceId', activeDeviceId);

    try {
      const res = await apiFetch(
        `/api/v1/chambers/${encodeURIComponent(resolvedChamberId)}/history?${query.toString()}`
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `Gagal memuat riwayat (HTTP ${res.status})`);
      }

      const json: unknown = await res.json();
      setHistoryRows(toHistoryRows(json));
      setNextCursor(nextCursorOf(json));
      const meta = historyMetaOf(json);
      setWatermark(meta.snapshotWatermark);
      setAboveCount(meta.aboveWatermarkCount);
      setHistoryPage(page);
      historyPageRef.current = page;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat riwayat data';
      setHistoryError(msg);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    setHistoryRows([]);
    setNextCursor(null);
    setWatermark(null);
    setAboveCount(0);
    setHistoryPage(1);
    historyPageRef.current = 1;
    cursorStackRef.current = [null];
    windowRef.current = null;
    fetchHistoryPage(null, 1, true);
  };

  const handleHistoryNext = () => {
    if (!nextCursor || isHistoryLoading) return;
    cursorStackRef.current = [...cursorStackRef.current, nextCursor];
    fetchHistoryPage(nextCursor, historyPage + 1);
  };

  const handleHistoryPrev = () => {
    if (historyPage <= 1 || isHistoryLoading) return;
    const stack = cursorStackRef.current.slice(0, -1);
    cursorStackRef.current = stack;
    fetchHistoryPage(stack[stack.length - 1] ?? null, historyPage - 1);
  };

  const handleHistoryReload = () => {
    const stack = cursorStackRef.current;
    // Halaman 1 selalu memakai jendela terbaru; halaman >1 memakai jendela beku.
    if (historyPage === 1) {
      cursorStackRef.current = [null];
      fetchHistoryPage(null, 1, true);
    } else {
      fetchHistoryPage(stack[stack.length - 1] ?? null, historyPage);
    }
  };

  // Refresh otomatis tiap 10 dtk selagi modal terbuka di halaman pertama.
  // Halaman lanjut tidak disentuh agar posisi baca tak melompat.
  useEffect(() => {
    if (!showHistory) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (historyPageRef.current !== 1) return;
      cursorStackRef.current = [null];
      void fetchHistoryPage(null, 1, true);
    }, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, resolvedChamberId, rangeParam, activeDeviceId]);

  // Standar modal: Esc menutup, klik backdrop menutup.
  useEffect(() => {
    if (!showHistory) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHistory(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showHistory]);

  return (
    <>
      <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 flex flex-col justify-between shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] transition-all">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-black text-white/90 uppercase tracking-wider drop-shadow-md">
              Data & Ekspor
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold uppercase">
              Rentang: {rangeParam}
            </span>
          </div>
          <p className="text-xs text-white/60 font-mono mb-4 leading-relaxed">
            CSV dan riwayat diambil dari database. Tetap bisa diunduh saat alat mati.
            Data yang baru masuk detik ini ikut unduhan berikutnya.
          </p>

          {exportError && (
            <div
              role="alert"
              className="p-3 mb-4 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-mono backdrop-blur-md"
            >
              <div className="font-bold">Pemberitahuan Ekspor:</div>
              <div>{exportError}</div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* CSV Export Button */}
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500/30 to-teal-600/30 hover:from-emerald-500/40 hover:to-teal-600/40 border border-emerald-400/40 text-emerald-200 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 transition-all disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-emerald-300" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Menyiapkan CSV...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Unduh CSV ({rangeParam})</span>
              </>
            )}
          </button>

          {/* View History Table Button */}
          <button
            onClick={handleOpenHistory}
            className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white/90 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
          >
            <svg className="h-4 w-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 4h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Tabel Riwayat</span>
          </button>

          {/* Audit Unresolved Readings Link */}
          {activeDeviceId && (
            <a
              href={`/api/v1/devices/${encodeURIComponent(activeDeviceId)}/readings?timeQuality=UNKNOWN`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-[10px] font-mono text-cyan-300/80 hover:text-cyan-200 underline mt-1"
            >
              Audit Pembacaan Belum Terpecahkan (Unknown Time)
            </a>
          )}
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowHistory(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Riwayat telemetri ${resolvedChamberId}`}
            className="bg-slate-900 border border-white/15 rounded-3xl max-w-5xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="flex justify-between items-start gap-3 px-6 pt-5 pb-4 border-b border-white/10">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                  </span>
                  <h3 className="text-base font-bold text-white truncate">
                    Riwayat Telemetri
                    <span className="ml-2 text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      {resolvedChamberId}
                    </span>
                  </h3>
                </div>
                <p className="mt-1.5 text-[11px] font-mono text-white/50">
                  Rentang{' '}
                  {historyMode === '24h'
                    ? '24 jam terakhir'
                    : historyMode === '7d'
                      ? '7 hari terakhir'
                      : historyMode === '30d'
                        ? '30 hari terakhir'
                        : 'kustom'}{' '}
                  · 15 baris/halaman · Halaman {historyPage}
                </p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                aria-label="Tutup riwayat"
                autoFocus
                className="shrink-0 p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 pt-3">
              {/* Butir 10: filter rentang tabel riwayat */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {(['24h', '7d', '30d'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => applyHistoryRange(mode)}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-mono cursor-pointer touch-manipulation transition-colors ${
                      mode === historyMode
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100'
                        : 'bg-black/20 border-white/10 text-white/70 hover:border-white/25'
                    }`}
                  >
                    {mode === '24h' ? '24 jam terakhir' : mode === '7d' ? '7 hari terakhir' : '30 hari terakhir'}
                  </button>
                ))}
                <span className="text-[11px] font-mono text-white/50">Kustom (jam device):</span>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  aria-label="Dari tanggal dan jam (kustom)"
                  className="px-2 py-1.5 rounded-lg bg-black/25 border border-white/10 text-[11px] font-mono text-white max-w-[190px]"
                />
                <span aria-hidden="true" className="text-white/40 text-[11px] font-mono">→</span>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  aria-label="Sampai tanggal dan jam (kustom)"
                  className="px-2 py-1.5 rounded-lg bg-black/25 border border-white/10 text-[11px] font-mono text-white max-w-[190px]"
                />
                <button
                  type="button"
                  onClick={() => applyHistoryRange('custom', customFrom, customTo)}
                  className="px-3 py-1.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 text-cyan-100 text-[11px] font-mono font-bold hover:bg-cyan-500/25"
                >
                  Terapkan kustom
                </button>
              </div>
              {historyError && (
                <div className="mb-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-mono">
                  {historyError}
                </div>
              )}

              {aboveCount > 0 && (
                <div
                  role="status"
                  className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200/90 text-[11px] font-mono"
                >
                  {aboveCount} data terbaru sudah tampil di grafik dan ikut tabel berikutnya. Bukan data hilang.
                </div>
              )}
            </div>

            <div className="flex-1 overflow-auto mx-6 my-3 rounded-2xl border border-white/10 bg-black/25 min-h-[280px] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
              <table className="w-full min-w-[760px] text-left text-xs font-mono text-white/80">
                <thead className="bg-[#0f172a] text-white/60 uppercase text-[10px] tracking-widest sticky top-0 z-10 shadow-[0_1px_0_rgba(255,255,255,0.1)]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-bold">Waktu ukur</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">Temp (°C)</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">Kel (%RH)</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">MQ-137</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">MQ-136</th>
                    <th scope="col" className="px-3 py-2.5 font-bold text-right">MQ-4</th>
                    <th scope="col" className="px-4 py-2.5 font-bold text-right">Kualitas</th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-white/5 ${isHistoryLoading && historyRows.length > 0 ? 'opacity-50' : ''}`}>
                  {isHistoryLoading && historyRows.length === 0 ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={`skel-${i}`} className="animate-pulse">
                        <td className="px-4 py-3"><div className="h-3.5 w-32 rounded bg-white/10" /></td>
                        <td className="px-3 py-3"><div className="h-3.5 w-10 rounded bg-white/10 ml-auto" /></td>
                        <td className="px-3 py-3"><div className="h-3.5 w-10 rounded bg-white/10 ml-auto" /></td>
                        <td className="px-3 py-3"><div className="h-3.5 w-12 rounded bg-white/10 ml-auto" /></td>
                        <td className="px-3 py-3"><div className="h-3.5 w-12 rounded bg-white/10 ml-auto" /></td>
                        <td className="px-3 py-3"><div className="h-3.5 w-12 rounded bg-white/10 ml-auto" /></td>
                        <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-white/10 ml-auto" /></td>
                      </tr>
                    ))
                  ) : historyRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-14 text-center">
                        <p className="text-white/60 font-bold">Belum ada data di halaman ini</p>
                        <p className="mt-1 text-[11px] text-white/35">
                          {aboveCount > 0
                            ? 'Data terbaru menunggu giliran di atas watermark.'
                            : 'Tidak ada riwayat pembacaan dalam rentang ini.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    historyRows.map((r, i) => (
                      <tr key={r.id} className={`transition-colors hover:bg-cyan-400/[0.06] ${i % 2 === 1 ? 'bg-white/[0.02]' : ''}`}>
                        <td className="px-4 py-2.5 whitespace-nowrap text-white/75 tabular-nums">
                          {r.measuredAt ? new Date(r.measuredAt).toLocaleString('id-ID') : '--'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-white tabular-nums">
                          {r.temperatureC !== null ? `${r.temperatureC.toFixed(1)}` : '--'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-white tabular-nums">
                          {r.humidityPercent !== null ? `${r.humidityPercent.toFixed(1)}` : '--'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-cyan-300 tabular-nums">
                          {r.mq137Raw !== null ? `${r.mq137Raw.toFixed(1)}` : '--'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-purple-300 tabular-nums">
                          {r.mq136Raw !== null ? `${r.mq136Raw.toFixed(1)}` : '--'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-300 tabular-nums">
                          {r.mq4Raw !== null ? `${r.mq4Raw.toFixed(1)}` : '--'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                              r.measurementTimeQuality === 'SYNCED'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : r.measurementTimeQuality === 'RECONSTRUCTED'
                                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  : 'bg-white/10 text-white/50 border-white/15'
                            }`}
                          >
                            {r.measurementTimeQuality}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 px-6 py-3.5 border-t border-white/10">
              <span className="text-[11px] font-mono text-white/40 tabular-nums">
                Halaman {historyPage} · {historyRows.length} baris
                {!nextCursor && historyRows.length > 0 ? ' · terakhir' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={isHistoryLoading}
                  onClick={handleHistoryReload}
                  title="Muat ulang halaman ini"
                  aria-label="Muat ulang halaman ini"
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 text-white/70 hover:text-white text-xs font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <svg className={`w-4 h-4 ${isHistoryLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M5 9a8 8 0 0114-3M19 15a8 8 0 01-14 3" />
                  </svg>
                </button>
                <button
                  disabled={historyPage <= 1 || isHistoryLoading}
                  onClick={handleHistoryPrev}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 text-white/80 hover:text-white text-xs font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  &larr; Kembali
                </button>
                <button
                  disabled={!nextCursor || isHistoryLoading}
                  onClick={handleHistoryNext}
                  className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-mono font-bold disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  Berikutnya &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}