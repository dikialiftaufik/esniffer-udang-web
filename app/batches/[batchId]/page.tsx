"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../components/auth/AuthProvider';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import SuccessNotice, { useSuccessNotice } from '../../../components/ui/SuccessNotice';
import { TIMEPOINT_SEQUENCES, MAX_PHOTO_BYTES, MAX_PHOTO_CAPTION_LENGTH } from '../../../shared/dataset.ts';
import { validateGroupFields, groupWeightWarning } from '../../../lib/batch-wizard.ts';
import type { ApiSessionStatus } from '../../../lib/api/dataset.ts';

interface SessionItem {
  sessionId: string;
  timepointCode: string;
  elapsedHours: number;
  status: ApiSessionStatus;
  warmupDone: boolean;
  cleaningDone: boolean;
  chamberId: string | null;
  deviceId: string | null;
}

interface GroupItem {
  groupId: string;
  storageCondition: string;
  coldStorageMode: string;
  chamberId: string | null;
  targetTempC: number | null;
  labTempC: number | null;
  visualCheck: string;
  labWeightBeforeG: number | null;
  labWeightAfterG: number | null;
  sampleShrimpCount: number;
  sessions: SessionItem[];
}

/** Device yang terpasang pada chamber (butir 4: device dipilih otomatis). */
interface DeviceItem {
  id: string;
  mqttDeviceId: string;
  name: string;
  chamberId: string | null;
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
  coolerTempMarketC: number | null;
  coolerTempLabC: number | null;
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
  'px-4 py-2 min-h-[44px] rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-mono font-bold tracking-wider transition-all disabled:opacity-50';
const btnGhost =
  'px-4 py-2 min-h-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs font-mono font-bold transition-all disabled:opacity-50';

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
  const [chambers, setChambers] = useState<Array<{ id: string; code: string; name: string }>>([]);
  // Butir 4: device tidak lagi dipilih; chamber menentukan device, ditampilkan
  // sebagai teks baca-saja.
  const [devices, setDevices] = useState<DeviceItem[]>([]);
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
    coldStorageMode: 'chamber' | 'plain_fridge';
  } | null>(null);
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});
  const [savingGroup, setSavingGroup] = useState(false);
  // Modal form pra-sesi: input suhu berat foto sebelum start sesi.
  const [preSessionModal, setPreSessionModal] = useState<{
    groupId: string;
    timepointCode: string;
    labTempC: string;
    labWeightAfterG: string;
    photos: File[];
    photoPreviews: string[];
    photoCaptions: string[];
    err: string | null;
    busy: boolean;
  } | null>(null);
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
  }, [user, apiFetch]);

  // Butir 4: device diturunkan dari chamber yang terpasang — tanpa dropdown.
  useEffect(() => {
    if (!user) {
      return;
    }
    apiFetch('/api/v1/devices?limit=100')
      .then(async (res) => {
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json.data)) {
          setDevices(
            json.data.map(
              (d: {
                id: string;
                mqttDeviceId?: string;
                name?: string;
                activeAssignment?: { chamber?: { id: string } | null } | null;
              }) => ({
                id: d.id,
                mqttDeviceId: d.mqttDeviceId || d.id,
                name: d.name || d.mqttDeviceId || d.id,
                chamberId: d.activeAssignment?.chamber?.id ?? null,
              })
            )
          );
        }
      })
      .catch(() => {});
  }, [user, apiFetch]);

  /** Device yang terpasang pada chamber — pemetaan otomatis, bukan pilihan user. */
  const deviceForChamber = (chamberId: string | null): DeviceItem | null =>
    chamberId ? devices.find((d) => d.chamberId === chamberId) ?? null : null;

  /** Nama chamber untuk ditampilkan (butir 1). */
  const chamberName = (chamberId: string | null): string => {
    if (!chamberId) return '';
    return chambers.find((c) => c.id === chamberId)?.name ?? chamberId;
  };

  /** Label device untuk sesi yang sudah tertaut (butir 4). */
  const deviceLabel = (deviceId: string | null): string | null => {
    if (!deviceId) return null;
    return devices.find((d) => d.id === deviceId)?.mqttDeviceId ?? null;
  };

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
    // Modal form pra-sesi: isi suhu/berat/foto dulu, sesi dibuat setelah submit.
    setPreSessionModal({
      groupId: g.groupId,
      timepointCode,
      labTempC: '',
      labWeightAfterG: '',
      photos: [],
      photoPreviews: [],
      photoCaptions: [],
      err: null,
      busy: false,
    });
  };

  // Handler submit modal pra-sesi: simpan data grup + foto, lalu buat sesi.
  const handlePreSessionSubmit = async () => {
    if (!preSessionModal) return;
    const { groupId, timepointCode, labTempC, labWeightAfterG, photos, photoCaptions } = preSessionModal;
    const fail = (msg: string) =>
      setPreSessionModal((m) => (m ? { ...m, err: msg, busy: false } : null));
    const tempOk = labTempC.trim() === '' || Number.isFinite(Number(labTempC));
    const weightOk = labWeightAfterG.trim() === '' || Number.isFinite(Number(labWeightAfterG));
    if (!tempOk || !weightOk) {
      fail('Suhu dan berat harus angka yang sah (atau dikosongkan).');
      return;
    }
    if (photos.length > 0) {
      const badCaption = photoCaptions.findIndex((c) => c.trim() === '' || c.trim().length > MAX_PHOTO_CAPTION_LENGTH);
      if (badCaption >= 0) {
        fail(`Caption foto ke-${badCaption + 1} wajib diisi (maks ${MAX_PHOTO_CAPTION_LENGTH} karakter).`);
        return;
      }
    }
    setPreSessionModal((m) => (m ? { ...m, busy: true, err: null } : null));
    try {
      // 1. Simpan suhu/berat ke grup (PATCH, bukan POST).
      if (labTempC.trim() !== '' || labWeightAfterG.trim() !== '') {
        const payload: Record<string, unknown> = {};
        if (labTempC.trim() !== '') payload.labTempC = Number(labTempC);
        if (labWeightAfterG.trim() !== '') payload.labWeightAfterG = Number(labWeightAfterG);
        const res = await apiFetch(`/api/v1/groups/${encodeURIComponent(groupId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error?.message || `Gagal menyimpan data grup (kode ${res.status}).`);
      }
      // 2. Upload foto dokumentasi terpasang ke grup ini (caption wajib).
      if (photos.length > 0) {
        const form = new FormData();
        for (const f of photos) form.append('photos', f);
        form.append('captions', JSON.stringify(photoCaptions));
        form.append('groupId', groupId);
        const res = await apiFetch(`/api/v1/batches/${encodeURIComponent(batchId)}/photos`, {
          method: 'POST',
          body: form,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error?.message || `Gagal mengunggah foto (kode ${res.status}).`);
      }
      // 3. Baru saat ini sesi dibuat.
      // Grup "langsung di kulkas" (butir 1) tidak pernah ditautkan ke chamber.
      const targetGroup = batch?.sampleGroups.find((g) => g.groupId === groupId);
      const chamberId =
        targetGroup?.coldStorageMode === 'plain_fridge' ? null : chSel[groupId] || null;
      await callJson(`/api/v1/groups/${encodeURIComponent(groupId)}/sessions`, {
        timepointCode,
        warmupDone: true,
        chamberId,
      });
      setPreSessionModal(null);
      notify(`Sesi ${timepointCode} berhasil dimulai.`);
      refresh();
    } catch (err) {
      setPreSessionModal((m) => (m ? { ...m, err: err instanceof Error ? err.message : 'Gagal memulai sesi', busy: false } : null));
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
    setGroupErrors({});
    setGroupDraft({
      labTempC: g.labTempC === null ? '' : String(g.labTempC),
      labWeightBeforeG: g.labWeightBeforeG === null ? '' : String(g.labWeightBeforeG),
      labWeightAfterG: g.labWeightAfterG === null ? '' : String(g.labWeightAfterG),
      coldStorageMode: g.coldStorageMode === 'plain_fridge' ? 'plain_fridge' : 'chamber',
    });
  };

  /** Peringatan berat untuk form edit grup yang sedang dibuka. */
  const draftWeightWarning = (g: GroupItem): string | null => {
    if (!groupDraft || editGroupId !== g.groupId) {
      return null;
    }
    return groupWeightWarning({
      labTempC: groupDraft.labTempC,
      visualCheck: g.visualCheck,
      labWeightBeforeG: groupDraft.labWeightBeforeG,
      labWeightAfterG: groupDraft.labWeightAfterG,
      sampleShrimpCount: String(g.sampleShrimpCount),
    });
  };

  const saveGroupEdit = async (g: GroupItem) => {
    if (!groupDraft) {
      return;
    }
    // Aturan kolom grup: sumber tunggal sama dengan wizard (butir 3).
    const errs = validateGroupFields({
      labTempC: groupDraft.labTempC,
      visualCheck: g.visualCheck,
      labWeightBeforeG: groupDraft.labWeightBeforeG,
      labWeightAfterG: groupDraft.labWeightAfterG,
      sampleShrimpCount: String(g.sampleShrimpCount),
    });
    if (Object.keys(errs).length > 0) {
      setGroupErrors(errs);
      notify('Periksa lagi kolom yang ditandai.');
      return;
    }
    setGroupErrors({});
    setSavingGroup(true);
    try {
      const res = await apiFetch(`/api/v1/groups/${encodeURIComponent(g.groupId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labTempC: Number(groupDraft.labTempC),
          labWeightBeforeG: Number(groupDraft.labWeightBeforeG),
          labWeightAfterG: Number(groupDraft.labWeightAfterG),
          // Butir 1: mode penyimpanan hanya relevan untuk grup dingin.
          ...(g.storageCondition === 'cold' ? { coldStorageMode: groupDraft.coldStorageMode } : {}),
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
          <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
            <DataPair label="Tanggal dan jam beli (WIB)" value={dtFmt.format(new Date(batch.procuredAtUtc))} />
            <DataPair label="Tanggal dan jam tiba di lab (WIB)" value={dtFmt.format(new Date(batch.arrivedAtUtc))} />
            <DataPair label="Durasi beli ke tiba" value={durationText(batch.procuredAtUtc, batch.arrivedAtUtc)} />
            <DataPair label="Sumber" value={batch.marketSource} />
            <DataPair label="Jenis sumber" value={SOURCE_LABEL[batch.sourceType] ?? batch.sourceType} />
            <DataPair label="Kondisi awal udang" value={CONDITION_LABEL[batch.initialCondition] ?? batch.initialCondition} />
            <DataPair label="Jumlah total udang (ekor)" value={num(batch.shrimpCount)} />
            <DataPair label="Berat total udang (g)" value={num(batch.totalWeightG, ' g')} />
            <DataPair label="Panjang udang (cm)" value={num(batch.shrimpLengthCm, ' cm')} />
            <DataPair label="Ukuran (ekor/kg)" value={num(batch.sizeGrade)} />
            <DataPair label="Suhu awal udang (°C)" value={num(batch.initialTempC, ' °C')} />
            <DataPair label="Suhu cool box saat di pasar (°C)" value={num(batch.coolerTempMarketC, ' °C')} />
            <DataPair label="Suhu cool box saat di lab (°C)" value={num(batch.coolerTempLabC, ' °C')} />
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
                <p className="text-[11px] font-mono text-white/50">
                  {g.storageCondition === 'cold'
                    ? g.coldStorageMode === 'plain_fridge'
                      ? 'Penyimpanan: langsung di kulkas (tanpa chamber).'
                      : `Penyimpanan: dalam chamber${g.chamberId ? ` — ${chamberName(g.chamberId)}` : ' (belum ditugaskan)'}.`
                    : 'Penyimpanan: ruang (25 ± 1 °C).'}
                </p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 mt-1.5">
                  <DataPair label="Suhu udang sebelum observasi (°C)" value={num(g.labTempC, ' °C')} />
                  <DataPair label="Temuan visual udang" value={VISUAL_LABEL[g.visualCheck] ?? g.visualCheck} />
                  <DataPair label="Jumlah udang per sesi (ekor)" value={num(g.sampleShrimpCount)} />
                  <DataPair label="Berat sampel sebelum observasi (g)" value={num(g.labWeightBeforeG, ' g')} />
                  <DataPair label="Berat sampel sesudah observasi (g)" value={num(g.labWeightAfterG, ' g')} />
                </dl>
                {/* Butir 2: foto grup tampil di section grupnya. */}
                {batch.photos.some((p) => p.groupId === g.groupId) && (
                  <div className="mt-2">
                    <p className="text-[11px] font-mono text-white/45">Foto grup</p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-1">
                      {batch.photos
                        .filter((p) => p.groupId === g.groupId)
                        .map((p) => (
                          <figure key={p.url} className="space-y-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/${p.url}`}
                              alt={p.caption || `Foto grup ${g.groupId}`}
                              className="w-full h-20 object-cover rounded-lg border border-white/10"
                            />
                            <figcaption className="text-[10px] font-mono text-white/50 truncate">
                              {p.caption}
                            </figcaption>
                          </figure>
                        ))}
                    </div>
                  </div>
                )}
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
                      Field memakai aturan yang sama dengan wizard: suhu -2 sampai 30 °C, berat lebih dari 0 g.
                    </p>
                    {g.storageCondition === 'cold' && (
                      <fieldset className="space-y-1">
                        <legend className="text-[11px] font-mono font-semibold text-white/80">
                          Tempat penyimpanan (butir 1)
                        </legend>
                        <div className="flex flex-wrap gap-3">
                          {(
                            [
                              ['chamber', 'Dalam chamber'],
                              ['plain_fridge', 'Langsung di kulkas, tanpa chamber'],
                            ] as const
                          ).map(([value, label]) => (
                            <label key={value} className="flex items-center gap-1.5 text-[11px] font-mono text-white/80">
                              <input
                                type="radio"
                                name={`cold-mode-${g.groupId}`}
                                checked={groupDraft.coldStorageMode === value}
                                onChange={() =>
                                  setGroupDraft((prev) =>
                                    prev ? { ...prev, coldStorageMode: value } : prev
                                  )
                                }
                                className="accent-cyan-400"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                        {groupDraft.coldStorageMode === 'plain_fridge' && (
                          <p className="text-[11px] font-mono text-amber-200/80">
                            Grup ini tanpa chamber — pemilihan chamber disembunyikan saat mulai sesi.
                          </p>
                        )}
                      </fieldset>
                    )}
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
                            id={key}
                            name={key}
                            type="number"
                            step="0.1"
                            inputMode="decimal"
                            autoComplete="off"
                            value={groupDraft[key]}
                            aria-required="true"
                            aria-invalid={!!groupErrors[key]}
                            onChange={(e) => {
                              const value = e.target.value;
                              setGroupDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
                              setGroupErrors((prev) => {
                                if (!prev[key]) return prev;
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                            }}
                            placeholder={placeholder}
                            className={`w-full px-3 py-2 rounded-xl bg-black/25 border text-sm font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-400/60 ${
                              groupErrors[key] ? 'border-rose-400/70' : 'border-white/10'
                            }`}
                          />
                          {groupErrors[key] && (
                            <span role="alert" className="text-[11px] font-mono text-rose-300">
                              {groupErrors[key]}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    {draftWeightWarning(g) && (
                      <p className="text-[11px] font-mono text-amber-200/90">{draftWeightWarning(g)}</p>
                    )}
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
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
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
                    className="absolute top-1 right-1 w-8 h-8 rounded-full bg-black/60 hover:bg-rose-500/80 border border-white/20 text-white text-xs font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-50"
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
                capture="environment"
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
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
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
                      className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-rose-500/90 text-white text-[12px] font-bold leading-none flex items-center justify-center hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
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
                        {s.chamberId && (
                          <span className="text-[10px] font-mono text-white/45">
                            {' '}
                            • Chamber: {chamberName(s.chamberId)}
                            {deviceLabel(s.deviceId) ? ` — Device: ${deviceLabel(s.deviceId)}` : ''}
                          </span>
                        )}
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
              <p className="text-xs font-mono text-white/50">Belum ada sesi observasi. Pilih timepoint di bawah lalu mulai sesi pertama.</p>
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
                {g.coldStorageMode === 'plain_fridge' ? (
                  // Butir 1: grup "langsung di kulkas" tidak memakai chamber,
                  // jadi pemilih chamber disembunyikan.
                  <p className="text-[11px] font-mono text-amber-200/80">
                    Grup ini disimpan langsung di kulkas — tanpa chamber, jadi sensor chamber tidak ditautkan.
                  </p>
                ) : (
                  <>
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
                    {/* Butir 4: device dibaca dari chamber, bukan dipilih user. */}
                    <span className="text-[11px] font-mono text-white/55">
                      {(() => {
                        const device = deviceForChamber(chSel[g.groupId] || null);
                        return device ? `Device: ${device.mqttDeviceId}` : 'Device: otomatis dari chamber';
                      })()}
                    </span>
                  </>
                )}
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
                  {g.coldStorageMode === 'plain_fridge'
                    ? 'Tanpa chamber: sesi ini sengaja tidak punya data sensor chamber.'
                    : chSel[g.groupId]
                      ? 'Chamber terisi: sensor chamber otomatis tertaut ke sesi.'
                      : 'Chamber kosong: sesi ini tidak akan punya data sensor.'}
                </p>
              </div>
            )}
          </div>
        );
      })}
      {/* Modal form pra-sesi: wajib diisi sebelum sesi dibuat. */}
      {preSessionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setPreSessionModal(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pre-session-title"
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'linear-gradient(180deg, #24407f 0%, #16295c 100%)' }}
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 p-5 space-y-4"
          >
            <h3 id="pre-session-title" className="text-base font-mono font-bold text-white">
              Observasi Pra-Sesi — {preSessionModal.timepointCode}
            </h3>
            <p className="text-[13px] font-mono text-white/75 leading-relaxed">
              Isi data observasi dulu, lalu sesi baru dimulai kembali.
            </p>
            {preSessionModal.err && (
              <p role="alert" className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-mono">
                {preSessionModal.err}
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label htmlFor="pre-temp" className="block text-[12px] font-mono text-white/75 mb-1">
                  Suhu udang sebelum observasi (°C)
                </label>
                <input
                  id="pre-temp"
                  type="number"
                  step="0.1"
                  lang="en"
                  aria-label="Suhu udang sebelum observasi dalam derajat Celsius, titik desimal pakai titik"
                  value={preSessionModal.labTempC}
                  onChange={(e) =>
                    setPreSessionModal((m) => (m ? { ...m, labTempC: e.target.value } : null))}
                  placeholder="Contoh: 28.5"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/25 border border-white/10 text-white text-sm font-mono placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                />
                <p className="text-[11px] font-mono text-white/45 mt-1">
                  Angka desimal menggunakan titik, mis. 28.5
                </p>
              </div>
              <div>
                <label htmlFor="pre-weight" className="block text-[12px] font-mono text-white/75 mb-1">
                  Berat sampel sesudah observasi (g)
                </label>
                <input
                  id="pre-weight"
                  type="number"
                  step="0.1"
                  aria-label="Berat sampel sesudah observasi dalam gram, titik desimal pakai titik"
                  value={preSessionModal.labWeightAfterG}
                  onChange={(e) =>
                    setPreSessionModal((m) => (m ? { ...m, labWeightAfterG: e.target.value } : null))}
                  placeholder="Contoh: 478.5"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/25 border border-white/10 text-white text-sm font-mono placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                />
                <p className="text-[11px] font-mono text-white/45 mt-1">
                  Angka desimal menggunakan titik, mis. 478.5
                </p>
              </div>
              <div>
                <label htmlFor="pre-photo" className="block text-[12px] font-mono text-white/75 mb-1">
                  Foto dokumentasi (opsional)
                </label>
                <input
                  id="pre-photo"
                  type="file"
                  accept="image/jpeg,image/png"
                  capture="environment"
                  multiple
                  onChange={(e) => {
                    const incoming = Array.from(e.target.files ?? []);
                    const usable = incoming.filter(
                      (f) => /image\/(jpeg|png)/.test(f.type) && f.size > 0 && f.size <= MAX_PHOTO_BYTES
                    );
                    if (usable.length !== incoming.length) {
                      setPreSessionModal((m) => (m ? {
                        ...m,
                        err: 'Beberapa file dilewati: wajib jpg/png maks 5MB.',
                      } : null));
                    }
                    setPreSessionModal((m) => (m ? {
                      ...m,
                      photos: usable,
                      photoPreviews: usable.map((f) => URL.createObjectURL(f)),
                      photoCaptions: usable.map(() => ''),
                      err: null,
                    } : null));
                  }}
                  className="w-full text-xs font-mono text-white/60 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:bg-white/10 file:border file:border-white/10 file:text-white/80 file:text-xs file:font-mono"
                />
                {preSessionModal.photoPreviews.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {preSessionModal.photoPreviews.map((src, i) => (
                      <div key={src} className="relative space-y-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`Pratinjau foto ${i + 1}`}
                          className="w-full h-20 object-cover rounded-lg border border-white/10"
                        />
                        <input
                          type="text"
                          maxLength={MAX_PHOTO_CAPTION_LENGTH}
                          autoComplete="off"
                          value={preSessionModal.photoCaptions[i] ?? ''}
                          onChange={(e) =>
                            setPreSessionModal((m) => (m ? {
                              ...m,
                              photoCaptions: m.photoCaptions.map((c, j) => (j === i ? e.target.value : c)),
                            } : null))}
                          placeholder="Caption wajib"
                          className="w-full text-[11px] font-mono px-2 py-1 rounded-lg bg-black/25 border border-white/10 text-white/80 placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPreSessionModal((m) => (m ? {
                              ...m,
                              photos: m.photos.filter((_, j) => j !== i),
                              photoPreviews: m.photoPreviews.filter((_, j) => j !== i),
                              photoCaptions: m.photoCaptions.filter((_, j) => j !== i),
                            } : null))}
                          aria-label={`Hapus foto ${i + 1} dari pilihan`}
                          className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-rose-500/90 text-white text-[12px] font-bold leading-none flex items-center justify-center hover:bg-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPreSessionModal(null)}
                disabled={preSessionModal.busy}
                className="flex-1 py-2.5 rounded-xl bg-transparent hover:bg-white/10 border border-white/15 text-white/80 text-sm font-mono font-bold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                Batal
              </button>
              <button
                onClick={() => void handlePreSessionSubmit()}
                disabled={preSessionModal.busy}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-100 text-sm font-mono font-bold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
              >
                {preSessionModal.busy ? 'Memproses…' : 'Mulai Sesi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
