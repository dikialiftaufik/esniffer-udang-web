"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../components/auth/AuthProvider';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import SuccessNotice, { useSuccessNotice } from '../../../components/ui/SuccessNotice';
import { TIMEPOINT_SEQUENCES, MAX_PHOTO_BYTES, MAX_PHOTO_CAPTION_LENGTH } from '../../../shared/dataset.ts';
import type { ApiSessionStatus } from '../../../lib/api/dataset.ts';

interface SessionItem {
  sessionId: string;
  timepointCode: string;
  elapsedHours: number;
  status: ApiSessionStatus;
  warmupDone: boolean;
  cleaningDone: boolean;
}

interface GroupItem {
  groupId: string;
  storageCondition: string;
  coldStorageMode: string;
  targetTempC: number | null;
  labTempC: number | null;
  visualCheck: string;
  labWeightBeforeG: number | null;
  labWeightAfterG: number | null;
  sampleShrimpCount: number;
  sessions: SessionItem[];
}

interface PhotoItem {
  url: string;
  caption: string;
  groupId: string | null;
}

interface BatchDetail {
  batchId: string;
  procuredAtUtc: string;
  arrivedAtUtc: string;
  marketSource: string;
  sourceType: string;
  shrimpCount: number;
  totalWeightG: number | null;
  shrimpLengthCm: number | null;
  sizeGrade: number;
  initialCondition: string;
  initialTempC: number | null;
  coolerTempMinC: number | null;
  coolerTempMaxC: number | null;
  iceToShrimpRatio: string;
  rejectionNotes: string | null;
  photos: PhotoItem[];
  lockedAt: string | null;
  sampleGroups: GroupItem[];
}

const SR_TIMEPOINTS = TIMEPOINT_SEQUENCES.room_temp;
const SD_TIMEPOINTS = TIMEPOINT_SEQUENCES.cold;

const cardCls = 'p-5 rounded-2xl bg-white/10 backdrop-blur-lg border border-white/20 space-y-3';
const btnPrimary =
  'px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-mono font-bold tracking-wider transition-all disabled:opacity-50';
const btnGhost =
  'px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs font-mono font-bold transition-all disabled:opacity-50';

/** Tanggal + jam WIB (UTC+7) — input wizard memakai datetime-local WIB. */
const dtFmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});
/** Angka id-ID (koma desimal) — dipakai semua nilai numerik di section ini. */
const numFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });

const SOURCE_LABEL: Record<string, string> = { market: 'Pasar', supermarket: 'Supermarket', farm: 'Tambak' };
const CONDITION_LABEL: Record<string, string> = { alive: 'Hidup saat dibeli', dead: 'Mati saat dibeli' };
const VISUAL_LABEL: Record<string, string> = {
  normal: 'Normal',
  melanosis: 'Melanosis (bintik hitam)',
  damaged: 'Rusak fisik',
  mixed_species: 'Campur spesies lain',
};

const EM_DASH = '—';

const num = (v: number | null | undefined, unit = '') =>
  v === null || v === undefined ? EM_DASH : `${numFmt.format(v)}${unit}`;

/** Durasi beli→tiba: menit bila <1 jam, jam berpecahan desimal bila ≥1 jam. */
const durationText = (procuredIso: string, arrivedIso: string) => {
  const minutes = Math.round((Date.parse(arrivedIso) - Date.parse(procuredIso)) / 60_000);
  return minutes < 60 ? `${minutes} menit` : `${numFmt.format(minutes / 60)} jam`;
};

/**
 * Pasangan label–nilai: label kecil redup di atas, nilai terang & lebih besar
 * di bawah — hierarki baca jelas, nilai kosong ("—") diredupkan agar mata
 * melompati kolom kosong.
 */
function DataPair({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === EM_DASH;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-mono text-white/55 leading-snug">{label}</dt>
      <dd
        className={`text-sm font-mono font-semibold leading-snug break-words ${
          empty ? 'text-white/30' : 'text-white'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function BatchDetailPage() {
  const params = useParams();
  const batchId = decodeURIComponent(params.batchId as string);
  const { user, isLoading, apiFetch } = useAuth();
  const router = useRouter();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // form sesi per grup
  const [tpSel, setTpSel] = useState<Record<string, string>>({});
  const [warmup, setWarmup] = useState<Record<string, boolean>>({});
  const [cleaning, setCleaning] = useState<Record<string, boolean>>({});
  const [chSel, setChSel] = useState<Record<string, string>>({});
  const [devSel, setDevSel] = useState<Record<string, string>>({});
  const [chambers, setChambers] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [devices, setDevices] = useState<Array<{ id: string; mqttDeviceId: string; name: string }>>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [fileCaptions, setFileCaptions] = useState<string[]>([]);
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({});
  const [savingCaption, setSavingCaption] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmPhoto, setConfirmPhoto] = useState<{ message: string; photoUrl: string } | null>(null);
  // Butir 3: edit parsial data grup di halaman detail (PATCH /groups/[id]).
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<{
    labTempC: string;
    labWeightBeforeG: string;
    labWeightAfterG: string;
  } | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const { message: notice, notify, dismiss } = useSuccessNotice();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    apiFetch(`/api/v1/batches/${encodeURIComponent(batchId)}`)
      .then(async (res) => {
        if (res.status === 404) {
          throw new Error('Batch tidak ditemukan');
        }
        if (!res.ok) {
          throw new Error(`Gagal memuat (${res.status})`);
        }
        return (await res.json()).data as BatchDetail;
      })
      .then((data) => {
        if (cancelled) return;
        setBatch(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat batch');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, apiFetch, batchId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!user) {
      return;
    }
    apiFetch('/api/v1/chambers?active=true&limit=50')
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json.data)) {
          setChambers(json.data.map((c: { id: string; code: string; name?: string }) => ({
            id: c.id,
            code: c.code,
            name: c.name || c.code,
          })));
        }
      })
      .catch(() => {});
    apiFetch('/api/v1/devices?limit=100')
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json.data)) {
          setDevices(json.data.map((d: { id: string; mqttDeviceId?: string; name?: string }) => ({
            id: d.id,
            mqttDeviceId: d.mqttDeviceId || d.id,
            name: d.name || d.mqttDeviceId || d.id,
          })));
        }
      })
      .catch(() => {});
  }, [user, apiFetch]);

  const callJson = async (url: string, payload: unknown) => {
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error?.message || `Gagal menyimpan (kode ${res.status}). Periksa koneksi lalu coba lagi.`);
    }
    return body.data;
  };

  const usedCodes = (g: GroupItem): Set<string> =>
    new Set(g.sessions.filter((s) => s.status !== 'incomplete').map((s) => s.timepointCode));

  const handleReopen = async (s: SessionItem) => {
    setBusy(true);
    setError(null);
    try {
      await callJson(`/api/v1/sessions/${encodeURIComponent(s.sessionId)}/reopen`, {});
      notify(`Sesi ${s.timepointCode} berhasil dibuka kembali.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka ulang sesi');
    } finally {
      setBusy(false);
    }
  };

  const suggestNext = (g: GroupItem): string => {
    const seq = g.storageCondition === 'cold' ? SD_TIMEPOINTS : SR_TIMEPOINTS;
    const used = usedCodes(g);
    return seq.find((t) => !used.has(t)) ?? seq[seq.length - 1];
  };

  const handleCreateSession = async (g: GroupItem) => {
    const timepointCode = tpSel[g.groupId] || suggestNext(g);
    if (!warmup[g.groupId]) {
      setError('Nyalakan sensor 30 menit dulu (centang warmup) sebelum Start sesi');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callJson(`/api/v1/groups/${encodeURIComponent(g.groupId)}/sessions`, {
        timepointCode,
        warmupDone: true,
        chamberId: chSel[g.groupId] || null,
        deviceId: devSel[g.groupId] || null,
      });
      notify(`Sesi ${timepointCode} berhasil dimulai.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat sesi');
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async (s: SessionItem) => {
    if (!cleaning[s.sessionId]) {
      setError('Bersihkan chamber alkohol 70% dulu (centang cleaning) sebelum complete');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callJson(`/api/v1/sessions/${encodeURIComponent(s.sessionId)}/complete`, {
        cleaningDone: true,
      });
      notify(`Sesi ${s.timepointCode} berhasil diselesaikan.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal complete sesi');
    } finally {
      setBusy(false);
    }
  };

  /** Pilih foto: tambah ke yang sudah ada (bukan mengganti). */
  const handlePhotoSelect = (list: FileList | null, input: HTMLInputElement) => {
    const incoming = Array.from(list ?? []);
    const usable = incoming.filter((f) => /image\/(jpeg|png)/.test(f.type) && f.size > 0);
    const fitting = usable.filter((f) => f.size <= MAX_PHOTO_BYTES);
    const accepted = fitting;
    if (accepted.length < incoming.length) {
      setError('Ada file yang dilewati: hanya JPG/PNG dan maksimal 5 MB per file.');
    }
    setFiles((prev) => [...prev, ...accepted]);
    setFilePreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
    setFileCaptions((prev) => [...prev, ...accepted.map(() => '')]);
    input.value = '';
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(filePreviews[index]);
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFilePreviews((prev) => prev.filter((_, i) => i !== index));
    setFileCaptions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Pilih minimal 1 file foto dulu');
      return;
    }
    const badCaption = fileCaptions.findIndex(
      (c) => c.trim() === '' || c.trim().length > MAX_PHOTO_CAPTION_LENGTH
    );
    if (badCaption >= 0) {
      setError(`Caption foto ke-${badCaption + 1} wajib diisi (maks ${MAX_PHOTO_CAPTION_LENGTH} karakter).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const f of files) {
        form.append('photos', f);
      }
      form.append('captions', JSON.stringify(fileCaptions));
      const res = await apiFetch(`/api/v1/batches/${encodeURIComponent(batchId)}/photos`, {
        method: 'POST',
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error?.message || `Gagal mengunggah foto (kode ${res.status}). Periksa koneksi lalu coba lagi.`);
      }
      notify(`Berhasil mengunggah ${files.length} foto.`);
      filePreviews.forEach((src) => URL.revokeObjectURL(src));
      setFiles([]);
      setFilePreviews([]);
      setFileCaptions([]);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal upload foto');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCaption = async (photoUrl: string) => {
    const caption = (captionEdits[photoUrl] ?? '').trim();
    if (caption === '' || caption.length > MAX_PHOTO_CAPTION_LENGTH) {
      setError(`Caption wajib diisi (maks ${MAX_PHOTO_CAPTION_LENGTH} karakter).`);
      return;
    }
    setSavingCaption(photoUrl);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/batches/${encodeURIComponent(batchId)}/photos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photos: [{ url: photoUrl, caption }] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error?.message || `Gagal menyimpan caption (kode ${res.status}). Periksa koneksi lalu coba lagi.`);
      }
      notify('Caption foto berhasil disimpan.');
      setCaptionEdits((prev) => {
        const next = { ...prev };
        delete next[photoUrl];
        return next;
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan caption');
    } finally {
      setSavingCaption(null);
    }
  };

  const handleLock = async () => {
    if (!window.confirm(`Kunci batch ${batchId}? Setelah terkunci tidak bisa diubah.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await callJson(`/api/v1/batches/${encodeURIComponent(batchId)}/lock`, {});
      notify(`Batch ${batchId} berhasil dikunci.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunci batch');
    } finally {
      setBusy(false);
    }
  };

  const handleDeletePhoto = async (photoUrl: string) => {
    setConfirmPhoto(null);
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/batches/${encodeURIComponent(batchId)}/photos`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrls: [photoUrl] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error?.message || `Gagal menghapus foto (kode ${res.status}). Periksa koneksi lalu coba lagi.`);
      }
      notify('Foto berhasil dihapus.');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus foto');
    } finally {
      setBusy(false);
    }
  };

  /** Butir 3: buka form edit data grup di halaman detail. */
  const startGroupEdit = (g: GroupItem) => {
    setEditGroupId(g.groupId);
    setGroupDraft({
      labTempC: g.labTempC === null ? '' : String(g.labTempC),
      labWeightBeforeG: g.labWeightBeforeG === null ? '' : String(g.labWeightBeforeG),
      labWeightAfterG: g.labWeightAfterG === null ? '' : String(g.labWeightAfterG),
    });
  };

  const saveGroupEdit = async (g: GroupItem) => {
    if (!groupDraft) {
      return;
    }
    for (const v of [groupDraft.labTempC, groupDraft.labWeightBeforeG, groupDraft.labWeightAfterG]) {
      if (v.trim() === '' || !Number.isFinite(Number(v))) {
        notify('Ketiga nilai harus angka yang sah — periksa kembali.');
        return;
      }
    }
    setSavingGroup(true);
    try {
      const res = await apiFetch(`/api/v1/groups/${encodeURIComponent(g.groupId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labTempC: Number(groupDraft.labTempC),
          labWeightBeforeG: Number(groupDraft.labWeightBeforeG),
          labWeightAfterG: Number(groupDraft.labWeightAfterG),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error?.message || `Gagal menyimpan grup (kode ${res.status}).`);
      }
      setEditGroupId(null);
      setGroupDraft(null);
      notify('Data grup berhasil diperbarui.');
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan grup.');
    } finally {
      setSavingGroup(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-cyan-400 animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-cyan-400 animate-spin" />
      </div>
    );
  }

  if (error && !batch) {
    return (
      <div role="alert" className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-mono">
        {error}
      </div>
    );
  }

  if (!batch) {
    return null;
  }

  const isAdmin = user.role === 'ADMIN';
  const locked = !!batch.lockedAt;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-mono font-black text-white tracking-widest">{batch.batchId}</h2>
          <p className="text-xs font-mono text-white/60 mt-1">
            {batch.marketSource} • {batch.shrimpCount} ekor • {batch.totalWeightG ?? '--'} g • {batch.shrimpLengthCm ?? '--'} cm
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/v1/batches/${encodeURIComponent(batch.batchId)}/export?format=metadata`}
            download
            className="px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-mono font-bold tracking-wider transition-all"
          >
            Unduh Metadata
          </a>
          <a
            href={`/api/v1/batches/${encodeURIComponent(batch.batchId)}/export`}
            download
            className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-mono font-bold tracking-wider transition-all"
          >
            Unduh CSV Data
          </a>
          {locked ? (
            <span className="text-[10px] font-mono px-2 py-1 rounded border uppercase bg-white/10 text-white/60 border-white/20">
              Terkunci
            </span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-1 rounded border uppercase bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
              Terbuka
            </span>
          )}
          {isAdmin && !locked && (
            <button onClick={() => void handleLock()} disabled={busy} className={btnPrimary}>
              Kunci Batch
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmPhoto !== null}
        title="Hapus foto ini?"
        message={confirmPhoto?.message ?? ''}
        confirmLabel="Ya, hapus"
        busy={busy}
        onConfirm={() => {
          if (confirmPhoto) {
            void handleDeletePhoto(confirmPhoto.photoUrl);
          }
        }}
        onCancel={() => setConfirmPhoto(null)}
      />

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-mono">
          {error}
        </div>
      )}

      <SuccessNotice message={notice} onDismiss={dismiss} />

      <div className={cardCls}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-mono font-bold text-white tracking-widest">DATA PENCATATAN</h3>
          <p className="text-[11px] font-mono text-white/45">
            Unduh metadata bersifat opsional — data form tampil di sini.
          </p>
        </div>

        <div>
          <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-cyan-300/80">
            Pengadaan
          </p>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
            <DataPair label="Tanggal dan jam beli (WIB)" value={dtFmt.format(new Date(batch.procuredAtUtc))} />
            <DataPair label="Tanggal dan jam tiba di lab (WIB)" value={dtFmt.format(new Date(batch.arrivedAtUtc))} />
            <DataPair label="Durasi beli ke tiba" value={durationText(batch.procuredAtUtc, batch.arrivedAtUtc)} />
            <DataPair label="Sumber pasar" value={batch.marketSource} />
            <DataPair label="Jenis sumber" value={SOURCE_LABEL[batch.sourceType] ?? batch.sourceType} />
            <DataPair label="Kondisi awal udang" value={CONDITION_LABEL[batch.initialCondition] ?? batch.initialCondition} />
            <DataPair label="Jumlah total udang (ekor)" value={num(batch.shrimpCount)} />
            <DataPair label="Berat total udang (g)" value={num(batch.totalWeightG, ' g')} />
            <DataPair label="Panjang udang (cm)" value={num(batch.shrimpLengthCm, ' cm')} />
            <DataPair label="Ukuran (ekor/kg)" value={num(batch.sizeGrade)} />
            <DataPair label="Suhu awal udang (°C)" value={num(batch.initialTempC, ' °C')} />
            <DataPair
              label="Suhu cool box pasar → lab (°C)"
              value={
                batch.coolerTempMinC === null && batch.coolerTempMaxC === null
                  ? EM_DASH
                  : `${num(batch.coolerTempMinC)} → ${num(batch.coolerTempMaxC, ' °C')}`
              }
            />
          </dl>
        </div>

        <div>
          <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-cyan-300/80">
            Pengelompokan
          </p>
          <div className="space-y-4">
            {batch.sampleGroups.map((g) => (
              <div
                key={g.groupId}
                className={`pl-3 border-l-2 ${
                  g.storageCondition === 'cold' ? 'border-cyan-400/60' : 'border-amber-300/60'
                }`}
              >
                <p className="text-xs font-mono font-bold text-white">
                  {g.groupId} •{' '}
                  {g.storageCondition === 'cold'
                    ? `Suhu Dingin, ${g.coldStorageMode === 'plain_fridge' ? 'langsung di kulkas' : 'chamber'} (4 ± 1 °C)`
                    : 'Suhu Ruang (25 ± 2 °C)'}
                </p>
                <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 mt-1.5">
                  <DataPair label="Suhu udang sebelum observasi (°C)" value={num(g.labTempC, ' °C')} />
                  <DataPair label="Temuan visual udang" value={VISUAL_LABEL[g.visualCheck] ?? g.visualCheck} />
                  <DataPair label="Jumlah udang per sesi (ekor)" value={num(g.sampleShrimpCount)} />
                  <DataPair label="Berat sampel sebelum observasi (g)" value={num(g.labWeightBeforeG, ' g')} />
                  <DataPair label="Berat sampel sesudah observasi (g)" value={num(g.labWeightAfterG, ' g')} />
                </dl>
                {isAdmin && !locked && editGroupId !== g.groupId && (
                  <button type="button" onClick={() => startGroupEdit(g)} className={btnGhost}>
                    Edit data grup
                  </button>
                )}
                {isAdmin && !locked && editGroupId === g.groupId && groupDraft && (
                  <form
                    noValidate
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveGroupEdit(g);
                    }}
                    className="border-t border-white/10 pt-3 space-y-2"
                  >
                    <p className="text-[11px] font-mono text-white/60">
                      Field memakai aturan yang sama dengan wizard: suhu -2 sampai 30 °C, berat sampai 2000 g.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(
                        [
                          ['labTempC', 'Suhu udang sebelum observasi (°C)', '6.5…'],
                          ['labWeightBeforeG', 'Berat sampel sebelum observasi (g)', '482.0…'],
                          ['labWeightAfterG', 'Berat sampel sesudah observasi (g)', '478.5…'],
                        ] as const
                      ).map(([key, label, placeholder]) => (
                        <label key={key} className="flex flex-col gap-1">
                          <span className="text-[11px] font-mono font-semibold text-white/80">{label}</span>
                          <input
                            type="number"
                            step="0.1"
                            inputMode="decimal"
                            autoComplete="off"
                            value={groupDraft[key]}
                            aria-required="true"
                            onChange={(e) =>
                              setGroupDraft((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))
                            }
                            placeholder={placeholder}
                            className="w-full px-3 py-2 rounded-xl bg-black/25 border border-white/10 text-sm font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400/60"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={savingGroup} className={btnPrimary}>
                        Simpan perubahan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditGroupId(null);
                          setGroupDraft(null);
                        }}
                        disabled={savingGroup}
                        className={btnGhost}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-mono font-bold text-white tracking-widest">FOTO DOKUMENTASI ({batch.photos.length})</h3>
        {batch.photos.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {batch.photos.map((p, i) => (
              <div key={p.url} className="relative space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/${p.url}`} alt={p.caption || `Dokumentasi batch ${i + 1}`} className="w-full h-20 object-cover rounded-lg border border-white/10" />
                {p.groupId ? (
                  <span
                    aria-label={`Foto grup ${p.groupId.slice(-2)}`}
                    className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded-md bg-cyan-500/30 border border-cyan-300/40 text-cyan-100 text-[9px] font-mono font-bold"
                  >
                    {p.groupId.slice(-2)}
                  </span>
                ) : null}
                {isAdmin && !locked ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      maxLength={MAX_PHOTO_CAPTION_LENGTH}
                      autoComplete="off"
                      value={captionEdits[p.url] ?? p.caption}
                      aria-required="true"
                      aria-label={`Caption foto ${i + 1}`}
                      onChange={(e) => setCaptionEdits((prev) => ({ ...prev, [p.url]: e.target.value }))}
                      placeholder="Caption…"
                      className="w-full text-[11px] font-mono px-2 py-1 rounded-lg bg-black/25 border border-white/10 text-white/80 placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    />
                    {captionEdits[p.url] !== undefined && captionEdits[p.url] !== p.caption && (
                      <button
                        type="button"
                        onClick={() => void handleSaveCaption(p.url)}
                        disabled={busy || savingCaption === p.url}
                        className="shrink-0 px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-[11px] font-mono font-bold disabled:opacity-50"
                      >
                        {savingCaption === p.url ? '…' : 'OK'}
                      </button>
                    )}
                  </div>
                ) : (
                  p.caption !== '' && (
                    <p className="text-[10px] font-mono text-white/60 leading-tight">{p.caption}</p>
                  )
                )}
                {isAdmin && !locked && (
                  <button
                    onClick={() => setConfirmPhoto({
                      photoUrl: p.url,
                      message: `Hapus foto ${i + 1} dari batch ini? File dihapus permanen.`,
                    })}
                    disabled={busy}
                    aria-label={`Hapus foto ${i + 1}`}
                    title={`Hapus foto ${i + 1}`}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-rose-500/80 border border-white/20 text-white text-xs font-bold leading-none transition-colors disabled:opacity-50"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && !locked && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/jpeg,image/png"
                multiple
                aria-label="Pilih file foto untuk diunggah"
                onChange={(e) => handlePhotoSelect(e.target.files, e.currentTarget)}
                className="text-xs font-mono text-white/60 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:bg-white/10 file:border file:border-white/10 file:text-white/80 file:text-xs file:font-mono"
              />
              <button
                onClick={() => void handleUpload()}
                disabled={busy || files.length === 0}
                className={btnPrimary}
              >
                Upload{files.length > 0 ? ` (${files.length})` : ''}
              </button>
            </div>
            {files.length === 0 ? (
              <p className="text-[11px] font-mono text-white/50">Belum ada foto dipilih — pratinjau tampil di sini sebelum diunggah.</p>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {filePreviews.map((src, i) => (
                  <div key={src} className="relative space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Pratinjau foto ${i + 1}`} className="w-full h-20 object-cover rounded-lg border border-white/10" />
                    <label className="flex items-center gap-1 text-[11px] font-mono font-semibold text-white/85" htmlFor={`upload-caption-${i}`}>
                      Caption <span aria-hidden="true" className="text-rose-400">*</span>
                    </label>
                    <input
                      id={`upload-caption-${i}`}
                      name={`upload-caption-${i}`}
                      type="text"
                      maxLength={MAX_PHOTO_CAPTION_LENGTH}
                      autoComplete="off"
                      value={fileCaptions[i] ?? ''}
                      aria-required="true"
                      onChange={(e) => setFileCaptions((prev) => prev.map((c, j) => (j === i ? e.target.value : c)))}
                      placeholder="Di pasar…"
                      className="w-full text-[11px] font-mono px-2 py-1 rounded-lg bg-black/25 border border-white/10 text-white/80 placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      aria-label={`Hapus foto ${i + 1} dari pilihan`}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500/90 text-white text-[10px] font-bold leading-none hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {batch.sampleGroups.map((g) => {
        const seq = g.storageCondition === 'cold' ? SD_TIMEPOINTS : SR_TIMEPOINTS;
        const taken = usedCodes(g);
        const available = seq.filter((t) => !taken.has(t));
        const running = g.sessions.filter((s) => s.status === 'open');
        const history = g.sessions.filter((s) => s.status !== 'open');
        return (
          <div key={g.groupId} className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-mono font-bold text-white tracking-widest">
                {g.groupId} • {g.storageCondition === 'cold' ? 'Dingin (4±1°C)' : 'Ruang (25±2°C)'} • {g.sampleShrimpCount} ekor
              </h3>
              <p className="text-[11px] font-mono text-white/45">
                Jadwal timepoint: {seq.join(' · ')}
              </p>
            </div>
            {running.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-mono font-bold tracking-widest uppercase text-cyan-300/80">
                  Sesi berjalan
                </p>
                <ul className="space-y-2">
                  {running.map((s) => (
                    <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-black/25 border border-cyan-400/20">
                      <div className="text-xs font-mono text-white/80">
                        <span className="font-bold text-white">{s.timepointCode}</span>
                        <span className="text-white/50"> ({s.elapsedHours} jam)</span>{' '}
                        <span className="text-[10px] px-1.5 py-0.5 rounded border uppercase bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                          {s.status}
                        </span>
                      </div>
                      {isAdmin && !locked && (
                        <label className="flex items-center gap-2 text-[11px] font-mono text-white/70 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!cleaning[s.sessionId]}
                            onChange={(e) => setCleaning({ ...cleaning, [s.sessionId]: e.target.checked })}
                            className="accent-emerald-500"
                          />
                          Cleaning 70%
                          <button onClick={() => void handleComplete(s)} disabled={busy || !cleaning[s.sessionId]} className={btnPrimary} title={!cleaning[s.sessionId] ? 'Centang cleaning 70% dulu' : 'Selesaikan sesi'}>
                            Complete
                          </button>
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {history.length > 0 && (
              <details className="rounded-xl bg-black/15 border border-white/10 px-3 py-2">
                <summary className="cursor-pointer text-[11px] font-mono font-bold tracking-widest uppercase text-white/50 hover:text-white/80">
                  Riwayat ({history.length})
                </summary>
                <ul className="mt-2 space-y-2">
                  {history.map((s) => (
                    <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-black/25 border border-white/10">
                      <div className="text-xs font-mono text-white/80">
                        <span className="font-bold text-white">{s.timepointCode}</span>
                        <span className="text-white/50"> ({s.elapsedHours} jam)</span>{' '}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border uppercase ${
                            s.status === 'complete'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-white/10 text-white/60 border-white/20'
                          }`}
                          title={s.status === 'incomplete' ? 'Selesai tanpa data tertaut — bisa diulang' : undefined}
                        >
                          {s.status}
                        </span>
                      </div>
                      {isAdmin && !locked && s.status === 'incomplete' && (
                        <button onClick={() => void handleReopen(s)} disabled={busy} className={btnGhost} title="Buka ulang sesi untuk mengukur ulang timepoint ini">
                          Ulangi
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {g.sessions.length === 0 && (
              <p className="text-xs font-mono text-white/50">Belum ada sesi pengukuran. Pilih timepoint di bawah lalu mulai sesi pertama.</p>
            )}
            {isAdmin && !locked && available.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select
                  value={tpSel[g.groupId] || suggestNext(g)}
                  onChange={(e) => setTpSel({ ...tpSel, [g.groupId]: e.target.value })}
                  aria-label="Timepoint sesi baru"
                  className="px-3 py-2 rounded-xl bg-black/25 border border-white/10 text-xs font-mono text-white"
                >
                  {available.map((t) => (
                    <option key={t} value={t} className="bg-slate-900">
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  value={chSel[g.groupId] || ''}
                  onChange={(e) => setChSel({ ...chSel, [g.groupId]: e.target.value })}
                  aria-label="Chamber sesi (opsional, wajib agar data tertaut)"
                  className="px-3 py-2 rounded-xl bg-black/25 border border-white/10 text-xs font-mono text-white max-w-[180px]"
                >
                  <option value="" className="bg-slate-900">
                    Chamber: —
                  </option>
                  {chambers.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900">
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  value={devSel[g.groupId] || ''}
                  onChange={(e) => setDevSel({ ...devSel, [g.groupId]: e.target.value })}
                  aria-label="Device sesi (opsional, wajib agar data tertaut)"
                  className="px-3 py-2 rounded-xl bg-black/25 border border-white/10 text-xs font-mono text-white max-w-[180px]"
                >
                  <option value="" className="bg-slate-900">
                    Device: —
                  </option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id} className="bg-slate-900">
                      {d.mqttDeviceId}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-[11px] font-mono text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!warmup[g.groupId]}
                    onChange={(e) => setWarmup({ ...warmup, [g.groupId]: e.target.checked })}
                    className="accent-emerald-500"
                  />
                  Warmup 30 mnt
                </label>
                <button onClick={() => void handleCreateSession(g)} disabled={busy || !warmup[g.groupId]} className={btnGhost} title={!warmup[g.groupId] ? 'Centang warmup 30 menit dulu' : 'Mulai sesi'}>
                  Start Sesi
                </button>
                <p className="w-full text-[11px] font-mono text-white/45">
                  {chSel[g.groupId] || devSel[g.groupId]
                    ? 'Chamber + device terisi: data sensor otomatis tertaut ke sesi.'
                    : 'Chamber + device kosong: sesi ini tidak akan punya data sensor.'}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
