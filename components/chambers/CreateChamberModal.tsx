"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../auth/AuthProvider';

interface DeviceItem {
  id: string;
  mqttDeviceId: string;
  name: string;
  isActive: boolean;
  activeAssignment?: {
    id: string;
    chamber?: { id: string; code: string; name: string } | null;
  } | null;
}

interface CreateChamberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChamberCreated?: (newChamber: { id: string; code: string; name: string }) => void;
  existingChambers?: Array<{ code: string }>;
}

function getInitialChamberData(existingChambers: Array<{ code: string }>) {
  const codes = existingChambers.map((c) => c.code.toUpperCase());
  let nextNum = 1;
  while (codes.includes(`CH-${String(nextNum).padStart(2, '0')}`)) {
    nextNum++;
  }
  return {
    code: `CH-${String(nextNum).padStart(2, '0')}`,
    name: `Chamber ${nextNum}`,
    description: `Chamber pemantauan kualitas air ${nextNum}`,
    mqttDeviceId: `esp32-${String(nextNum).padStart(3, '0')}`,
    deviceName: `e-Sniffer Sensor Node ${String(nextNum).padStart(2, '0')}`,
  };
}

function CreateChamberDialog({
  onClose,
  onChamberCreated,
  existingChambers = [],
}: CreateChamberModalProps) {
  const router = useRouter();
  const { user, apiFetch } = useAuth();

  const initial = useMemo(() => getInitialChamberData(existingChambers), [existingChambers]);

  // Form states initialized with computed defaults
  const [code, setCode] = useState(initial.code);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [isActive, setIsActive] = useState(true);

  // Device pairing states
  const [deviceMode, setDeviceMode] = useState<'existing' | 'new' | 'none'>('new');
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [newMqttDeviceId, setNewMqttDeviceId] = useState(initial.mqttDeviceId);
  const [newDeviceName, setNewDeviceName] = useState(initial.deviceName);

  // Auxiliary data & status
  const [availableDevices, setAvailableDevices] = useState<DeviceItem[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Focus first input on mount
  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  // Fetch devices asynchronously
  useEffect(() => {
    let isMounted = true;
    const loadDevices = async () => {
      try {
        const res = await apiFetch('/api/v1/devices?limit=50&active=true');
        if (res.ok) {
          const json = await res.json();
          if (isMounted && Array.isArray(json.data)) {
            setAvailableDevices(json.data);
            if (json.data.length > 0) {
              const unassigned = json.data.find((d: DeviceItem) => !d.activeAssignment);
              setSelectedDeviceId(unassigned ? unassigned.id : json.data[0].id);
            }
          }
        }
      } catch {
        // Silently handle device list fetch error
      } finally {
        if (isMounted) {
          setIsLoadingDevices(false);
        }
      }
    };

    void loadDevices();
    return () => {
      isMounted = false;
    };
  }, [apiFetch]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isAdmin = user?.role === 'ADMIN';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Hanya akun dengan peran ADMIN yang dapat membuat chamber baru.');
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    if (!cleanCode || !cleanName) {
      setError('Kode dan Nama Chamber wajib diisi.');
      return;
    }

    if (!/^[A-Za-z0-9_-]+$/.test(cleanCode)) {
      setError('Kode Chamber hanya boleh berupa huruf, angka, tanda strip (-), atau garis bawah (_).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1. Create Chamber
      const chamberRes = await apiFetch('/api/v1/chambers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          name: cleanName,
          description: description.trim() || undefined,
          isActive,
        }),
      });

      const chamberJson = await chamberRes.json().catch(() => ({}));
      if (!chamberRes.ok) {
        throw new Error(
          chamberJson?.error?.message ||
            `Gagal membuat chamber (HTTP ${chamberRes.status})`
        );
      }

      const createdChamber = chamberJson.data;

      // 2. Handle Device Assignment if requested
      if (deviceMode === 'new') {
        const cleanMqttId = newMqttDeviceId.trim();
        if (cleanMqttId) {
          let devId = cleanMqttId;
          const devRes = await apiFetch('/api/v1/devices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mqttDeviceId: cleanMqttId,
              name: newDeviceName.trim() || `Sensor Node ${cleanCode}`,
            }),
          });

          if (devRes.ok) {
            const devJson = await devRes.json();
            devId = devJson.data.id;
          } else if (devRes.status === 409) {
            devId = cleanMqttId;
          }

          await apiFetch('/api/v1/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceId: devId,
              chamberId: createdChamber.id,
            }),
          });
        }
      } else if (deviceMode === 'existing' && selectedDeviceId) {
        await apiFetch('/api/v1/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deviceId: selectedDeviceId,
            chamberId: createdChamber.id,
          }),
        });
      }

      // Notify parent & redirect to new chamber
      if (onChamberCreated) {
        onChamberCreated(createdChamber);
      }
      onClose();
      router.push(`/chamber/${encodeURIComponent(cleanCode)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat membuat chamber.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-chamber-title"
        className="bg-slate-900 border border-white/15 rounded-3xl max-w-xl w-full flex flex-col shadow-2xl overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="flex justify-between items-start gap-3 px-6 pt-5 pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </span>
            <div>
              <h3 id="create-chamber-title" className="text-base font-bold text-white">
                Tambah Chamber Baru
              </h3>
              <p className="text-xs font-mono text-white/50">
                Daftarkan chamber untuk pemantauan telemetri sensor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup form"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/60 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {!isAdmin && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-mono"
            >
              <span className="font-bold">Akses Terbatas:</span> Akun Anda saat ini memiliki peran{' '}
              <span className="font-bold underline">{user?.role || 'VIEWER'}</span>. Hanya akun{' '}
              <span className="font-bold text-emerald-300">ADMIN</span> yang diizinkan menambahkan chamber baru.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-mono"
            >
              <span className="font-bold">Gagal: </span>
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="chamber-code" className="block text-xs font-mono font-bold text-white/70 mb-1">
                Kode Chamber <span className="text-rose-400">*</span>
              </label>
              <input
                ref={firstInputRef}
                id="chamber-code"
                type="text"
                required
                maxLength={32}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="mis. CH-02"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-sm uppercase focus:outline-none focus:border-cyan-400"
              />
              <span className="text-[10px] font-mono text-white/40">Contoh: CH-02, CH-03</span>
            </div>

            <div>
              <label htmlFor="chamber-name" className="block text-xs font-mono font-bold text-white/70 mb-1">
                Nama Tampilan <span className="text-rose-400">*</span>
              </label>
              <input
                id="chamber-name"
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mis. Chamber 2 (Kolam B)"
                className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
              />
              <span className="text-[10px] font-mono text-white/40">Tampil di navigasi & grafik</span>
            </div>
          </div>

          <div>
            <label htmlFor="chamber-desc" className="block text-xs font-mono font-bold text-white/70 mb-1">
              Deskripsi (Opsional)
            </label>
            <input
              id="chamber-desc"
              type="text"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="mis. Chamber monitoring kolam pembesaran B"
              className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="chamber-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded bg-black/40 border-white/20 text-cyan-500 focus:ring-0 focus:ring-offset-0"
            />
            <label htmlFor="chamber-active" className="text-xs font-mono text-white/80 cursor-pointer">
              Langsung aktifkan chamber ini di navigasi publik
            </label>
          </div>

          {/* Section: Pasangkan Alat Sensor (ESP32) */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-emerald-200 flex items-center gap-1.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                  />
                </svg>
                Hubungkan Perangkat Sensor (ESP32)
              </span>
              <span className="text-[10px] font-mono text-white/40">Opsional</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setDeviceMode('new')}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono cursor-pointer transition-all ${
                  deviceMode === 'new'
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100 font-bold'
                    : 'bg-black/20 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                + Alat Baru
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('existing')}
                disabled={availableDevices.length === 0}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  deviceMode === 'existing'
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100 font-bold'
                    : 'bg-black/20 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                Alat Terdaftar ({availableDevices.length})
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('none')}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-mono cursor-pointer transition-all ${
                  deviceMode === 'none'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                    : 'bg-black/20 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                Lewati (Nanti)
              </button>
            </div>

            {deviceMode === 'new' && (
              <div className="p-3 rounded-2xl bg-black/30 border border-white/10 space-y-2.5">
                <div>
                  <label htmlFor="new-device-mqtt-id" className="block text-[11px] font-mono text-white/70 mb-1">
                    MQTT Device ID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="new-device-mqtt-id"
                    type="text"
                    required={deviceMode === 'new'}
                    value={newMqttDeviceId}
                    onChange={(e) => setNewMqttDeviceId(e.target.value.toLowerCase())}
                    placeholder="mis. esp32-002"
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-[10px] font-mono text-white/40">
                    Sesuai topik MQTT: <code className="text-cyan-300">esniffer/{newMqttDeviceId || '...'}/telemetry</code>
                  </span>
                </div>
                <div>
                  <label htmlFor="new-device-name" className="block text-[11px] font-mono text-white/70 mb-1">
                    Nama Alat (Label)
                  </label>
                  <input
                    id="new-device-name"
                    type="text"
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    placeholder="mis. e-Sniffer Sensor Node 02"
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            )}

            {deviceMode === 'existing' && (
              <div className="p-3 rounded-2xl bg-black/30 border border-white/10">
                <label htmlFor="select-device-id" className="block text-[11px] font-mono text-white/70 mb-1">
                  Pilih Alat Sensor
                </label>
                {isLoadingDevices ? (
                  <p className="text-xs font-mono text-white/40">Memuat daftar perangkat...</p>
                ) : (
                  <select
                    id="select-device-id"
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  >
                    {availableDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.mqttDeviceId} — {d.name}{' '}
                        {d.activeAssignment?.chamber ? `(Aktif di ${d.activeAssignment.chamber.code})` : '(Bebas)'}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] font-mono text-white/40 mt-1">
                  Perangkat yang dipilih akan dipasangkan ke chamber baru ini.
                </p>
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end items-center gap-2 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs font-mono font-bold transition-all disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isAdmin}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-mono font-bold flex items-center gap-2 shadow-lg shadow-cyan-950/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Menyimpan...</span>
                </>
              ) : (
                <span>Simpan Chamber</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CreateChamberModal(props: CreateChamberModalProps) {
  if (!props.isOpen) return null;
  return <CreateChamberDialog {...props} />;
}
