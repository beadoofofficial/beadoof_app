"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";

type Props = {
  onDetect: (code: string) => void;
  paused?: boolean;
};

export default function BarcodeScanner({ onDetect, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectRef = useRef(onDetect);
  const pausedRef = useRef(paused);
  const lastEmitRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [insecure, setInsecure] = useState(false);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.isSecureContext) {
      setInsecure(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera API not available in this browser.");
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let scannerControls: IScannerControls | null = null;

    // Defer with a timeout so React StrictMode's mount-unmount-mount cycle
    // in dev fully tears down the first attempt before the second starts.
    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      const reader = new BrowserMultiFormatReader();
      reader
        .decodeFromConstraints(
          {
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          },
          video,
          (result) => {
            if (pausedRef.current || !result) return;
            const code = result.getText();
            const now = Date.now();
            if (
              code &&
              (code !== lastEmitRef.current.code ||
                now - lastEmitRef.current.at > 1500)
            ) {
              lastEmitRef.current = { code, at: now };
              onDetectRef.current(code);
            }
          },
        )
        .then((controls) => {
          // By the time this resolves, zxing's internal `await video.play()`
          // has settled, so calling controls.stop() is now safe and won't
          // abort an in-flight play promise.
          if (cancelled) {
            controls.stop();
            return;
          }
          scannerControls = controls;
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : "Camera unavailable";
          setError(msg);
        });
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      // Trust zxing's stop() to release tracks and clear srcObject.
      // Do NOT manually pause() or null srcObject here — that's what was
      // triggering the AbortError logs by racing with zxing's play() promise.
      scannerControls?.stop();
    };
  }, []);

  const submitManual = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    onDetect(code);
    setManual("");
  };

  return (
    <div className="space-y-3">
      {!insecure && (
        <div className="relative w-full aspect-4/3 bg-black rounded-xl overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 h-0.5 bg-red-400/80 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
          <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wide text-white/80 bg-black/40 px-2 py-0.5 rounded">
            {paused ? "Paused" : "Scanning"}
          </div>
        </div>
      )}

      {insecure && (
        <div className="text-xs text-amber-900 bg-amber-100 rounded-lg p-3 leading-relaxed">
          <strong>Camera blocked: page is not secure.</strong> iOS Safari only
          grants camera access on <code>https://</code> or{" "}
          <code>localhost</code>. Open this site via an HTTPS tunnel (ngrok /
          cloudflared) or deploy it. You can still type a barcode below.
        </div>
      )}

      {error && (
        <div className="text-xs text-red-700 bg-red-50 rounded-lg p-3">
          Camera error: {error}. Check Settings → Safari → Camera, or type a
          barcode below.
        </div>
      )}

      <form onSubmit={submitManual} className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type a barcode"
          inputMode="numeric"
          autoComplete="off"
          className="flex-1 border border-[#e4d3c4] rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-[#5a3a24] text-white text-sm px-4 rounded-lg disabled:opacity-40"
          disabled={!manual.trim()}
        >
          Submit
        </button>
      </form>
    </div>
  );
}
