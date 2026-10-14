"use client";

import { useState, useEffect, useRef } from 'react';

export interface StreamValues {
  temperatureC: { value: number | null; unit: string; quality: string };
  humidityPercent: { value: number | null; unit: string; quality: string };
  mq137Raw: { value: number | null; unit: string; quality: string };
  mq136Raw: { value: number | null; unit: string; quality: string };
  mq4Raw: { value: number | null; unit: string; quality: string };
}

export interface StreamTick {
  historySequence: string;
  device: { id: string; mqttDeviceId: string; name: string };
  measuredAt: string;
  receivedAt: string;
  measurementTimeQuality: string;
  values: StreamValues;
}

export type StreamStatus = 'connecting' | 'live' | 'offline' | 'unsupported';

/**
 * Langganan SSE /stream satu chamber. Mengembalikan tick terbaru
 * (null bila belum ada) + status koneksi.
 *
 * Polling /latest 0,5 dtk saat SSE mati (fallback), melambat 5 dtk
 * saat SSE live: bila status "offline"/"unsupported", halaman memakai
 * data polling seperti biasa.
 * Saat SSE "live", poller melambat (bukan berhenti) agar status koneksi
 * alat tetap terpantau walau tidak ada tick baru.
 */
export function useChamberStream(chamberCode: string | null) {
  const [tick, setTick] = useState<StreamTick | null>(null);
  const [status, setStatus] = useState<StreamStatus>(() =>
    typeof EventSource === 'undefined' ? 'unsupported' : 'connecting'
  );
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chamberCode || typeof EventSource === 'undefined') {
      return;
    }

    let stopped = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      const params = new URLSearchParams();
      if (cursorRef.current) params.set('cursor', cursorRef.current);
      const query = params.toString();
      source = new EventSource(
        `/api/v1/chambers/${encodeURIComponent(chamberCode)}/stream${query ? `?${query}` : ''}`
      );
      setStatus('connecting');

      source.addEventListener('ready', (e) => {
        if (stopped) return;
        try {
          const body = JSON.parse((e as MessageEvent).data as string) as { cursor?: string };
          if (body.cursor) cursorRef.current = body.cursor;
        } catch {}
        setStatus('live');
      });

      source.addEventListener('tick', (e) => {
        if (stopped) return;
        try {
          const body = JSON.parse((e as MessageEvent).data as string) as StreamTick;
          cursorRef.current = body.historySequence;
          setTick(body);
          setStatus('live');
        } catch {}
      });

      source.onerror = () => {
        if (stopped) return;
        setStatus('offline');
        source?.close();
        // Sambung ulang 2 dtk kemudian dengan cursor terakhir (tanpa replay).
        retryTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [chamberCode]);

  return { tick, status: chamberCode ? status : 'offline' as StreamStatus };
}
