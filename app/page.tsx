"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/auth/AuthProvider';
import CreateChamberModal from '../components/chambers/CreateChamberModal';

/**
 * Root landing page.
 *
 * Behaviour:
 * - While loading auth: show spinner.
 * - Unauthenticated (no user): redirect to /login.
 * - Authenticated: fetch first active chamber sorted by code ASC.
 *   - Chamber found  → redirect to /chamber/<code>.
 *   - No chamber     → show informative empty-state with retry button.
 *   - Fetch error    → show error with retry button.
 */
export default function RootPage() {
  const router = useRouter();
  const { user, isLoading, apiFetch } = useAuth();

  const [fetchState, setFetchState] = useState<'pending' | 'no-chamber' | 'error'>('pending');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    // Wait for auth to initialise
    if (isLoading) return;

    // Not authenticated → go to login
    if (!user) {
      router.replace('/login');
      return;
    }

    // Authenticated: fetch first active chamber (sorted deterministically by code)
    let cancelled = false;

    const fetchFirstChamber = async () => {
      try {
        const res = await apiFetch('/api/v1/chambers?active=true&limit=1&sort=code_asc');

        if (res.status === 401) {
          router.replace('/login');
          return;
        }

        if (!res.ok) {
          if (!cancelled) {
            setErrorMsg(`Server error (HTTP ${res.status})`);
            setFetchState('error');
          }
          return;
        }

        const json = await res.json();
        const first = Array.isArray(json.data) ? json.data[0] : null;

        if (cancelled) return;

        if (first?.code) {
          router.replace(`/chamber/${encodeURIComponent(first.code)}`);
        } else {
          setFetchState('no-chamber');
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Gagal memuat daftar chamber.');
          setFetchState('error');
        }
      }
    };

    void fetchFirstChamber();

    return () => {
      cancelled = true;
    };
  }, [isLoading, user, router, apiFetch]);

  // Auth still initialising
  if (isLoading || (user && fetchState === 'pending')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
        <p className="text-white/60 font-mono text-sm">Memuat…</p>
      </div>
    );
  }

  // No active chambers configured
  if (fetchState === 'no-chamber') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <div>
          <p className="text-white font-mono font-bold text-lg">Belum ada chamber aktif</p>
          <p className="text-white/50 font-mono text-sm mt-1">
            {user?.role === 'ADMIN'
              ? 'Tambahkan chamber baru untuk memulai pemantauan sensor telemetri.'
              : 'Hubungi administrator untuk mengonfigurasi chamber pemantauan.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => { setFetchState('pending'); setErrorMsg(null); }}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 hover:text-white font-mono text-sm font-semibold transition-all"
          >
            Coba lagi
          </button>
          {user?.role === 'ADMIN' && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-mono text-sm font-semibold transition-all shadow-lg shadow-cyan-950/40"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Tambah Chamber Pertama</span>
            </button>
          )}
        </div>

        <CreateChamberModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onChamberCreated={() => {
            setFetchState('pending');
          }}
        />
      </div>
    );
  }

  // Fetch error
  if (fetchState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
          <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <p className="text-white font-mono font-bold text-lg">Gagal memuat chamber</p>
          <p className="text-white/50 font-mono text-sm mt-1">{errorMsg}</p>
        </div>
        <button
          onClick={() => { setFetchState('pending'); setErrorMsg(null); }}
          className="px-5 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-mono text-sm font-semibold transition-all"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  // Redirect in progress (pending while authenticated)
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
      <div className="w-8 h-8 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      <p className="text-white/60 font-mono text-sm">Mengarahkan ke chamber…</p>
    </div>
  );
}
