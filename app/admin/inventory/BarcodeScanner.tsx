"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onDetect: (code: string) => void;
  paused?: boolean;
};

// ------------ BarcodeDetector type declarations ------------
// Not yet in lib.dom.d.ts. Augmenting Window for feature detection.
type NativeDetectedBarcode = {
  rawValue: string;
  format: string;
};
type NativeBarcodeDetector = {
  detect: (source: CanvasImageSource) => Promise<NativeDetectedBarcode[]>;
};
type NativeBarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};
declare global {
  interface Window {
    BarcodeDetector?: NativeBarcodeDetectorCtor;
  }
}

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "itf",
  "qr_code",
  "data_matrix",
];

type ExtraCaps = {
  torch?: boolean;
  focusMode?: string[];
};
type ExtraConstraints = {
  advanced?: Array<{ torch?: boolean; focusMode?: string }>;
  focusMode?: string;
};

export default function BarcodeScanner({ onDetect, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<NativeBarcodeDetector | null>(null);
  const onDetectRef = useRef(onDetect);
  const pausedRef = useRef(paused);
  const lastEmitRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const attemptsRef = useRef(0);
  const lastErrorRef = useRef<string>("");

  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [insecure, setInsecure] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lastDetectedAt, setLastDetectedAt] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [stats, setStats] = useState({ attempts: 0, lastError: "" });

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const emit = (code: string) => {
    const now = Date.now();
    if (
      code &&
      (code !== lastEmitRef.current.code ||
        now - lastEmitRef.current.at > 1500)
    ) {
      lastEmitRef.current = { code, at: now };
      setLastDetectedAt(now);
      if (typeof navigator.vibrate === "function") navigator.vibrate(60);
      onDetectRef.current(code);
    }
  };

  const bumpStats = (err?: string) => {
    attemptsRef.current += 1;
    if (err) lastErrorRef.current = err;
    if (attemptsRef.current % 15 === 0) {
      setStats({
        attempts: attemptsRef.current,
        lastError: lastErrorRef.current,
      });
    }
  };

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
    if (!window.BarcodeDetector) {
      setUnsupported(true);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    const startTimer = window.setTimeout(async () => {
      if (cancelled) return;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Camera unavailable");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const [track] = stream.getVideoTracks();
      trackRef.current = track;

      const settings = track.getSettings();
      if (settings.width && settings.height) {
        setResolution(`${settings.width}×${settings.height}`);
      }

      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities &
        ExtraCaps;
      if (caps.focusMode?.includes("continuous")) {
        try {
          await track.applyConstraints({
            focusMode: "continuous",
          } as MediaTrackConstraints & ExtraConstraints);
        } catch {
          // ignore
        }
      }
      if (caps.torch === true) {
        setTorchSupported(true);
      }

      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // autoplay should be fine — parent gated this behind a tap
      }

      // Build the detector, intersecting requested formats with supported.
      const NativeCtor = window.BarcodeDetector!;
      let formats = NATIVE_FORMATS;
      if (typeof NativeCtor.getSupportedFormats === "function") {
        try {
          const supported = await NativeCtor.getSupportedFormats();
          formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
        } catch {
          // fall back to requesting all
        }
      }
      try {
        detectorRef.current = new NativeCtor({ formats });
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "BarcodeDetector init failed",
        );
        return;
      }

      const tick = async () => {
        if (cancelled) return;
        const v = videoRef.current;
        if (
          v &&
          !pausedRef.current &&
          v.readyState >= 2 &&
          detectorRef.current
        ) {
          try {
            const codes = await detectorRef.current.detect(v);
            bumpStats();
            if (codes.length > 0) emit(codes[0].rawValue);
          } catch (e) {
            bumpStats((e as Error).name || "DetectError");
          }
        }
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);
    }, 50);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      detectorRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    };
  }, []);

  const snap = async () => {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!video || !detector || snapping) return;
    setSnapping(true);
    setError(null);
    try {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        setError("Camera not ready yet — wait a moment and try again.");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setError("Snapshot failed — canvas unavailable.");
        return;
      }
      ctx.drawImage(video, 0, 0, w, h);
      try {
        const codes = await detector.detect(canvas);
        if (codes.length === 0) {
          setError(
            "No barcode in that frame. Try holding steady, adjusting distance, or turning on the torch.",
          );
          return;
        }
        if (typeof navigator.vibrate === "function") navigator.vibrate(60);
        setLastDetectedAt(Date.now());
        onDetect(codes[0].rawValue);
      } catch (e) {
        setError(`Decode failed: ${(e as Error).name || "Error"}`);
      }
    } finally {
      setSnapping(false);
    }
  };

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as MediaTrackConstraints & ExtraConstraints);
      setTorchOn(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Torch not available");
    }
  };

  const submitManual = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const code = manual.trim();
    if (!code) return;
    onDetect(code);
    setManual("");
  };

  const justDetected = Date.now() - lastDetectedAt < 800;
  const showCamera = !insecure && !unsupported;

  return (
    <div className="space-y-3">
      {showCamera && (
        <div
          className={`relative w-full aspect-4/3 bg-black rounded-xl overflow-hidden transition-shadow ${
            justDetected ? "ring-4 ring-emerald-400" : ""
          }`}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />

          <div className="pointer-events-none absolute inset-[15%] flex items-stretch justify-stretch">
            <Bracket pos="tl" />
            <Bracket pos="tr" />
            <Bracket pos="bl" />
            <Bracket pos="br" />
          </div>

          <div className="absolute top-2 left-2 flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wide text-white/90">
            <span className="bg-black/50 px-2 py-0.5 rounded">
              {paused ? "Paused" : "Scanning"}
            </span>
            <span
              className="bg-emerald-600/80 px-2 py-0.5 rounded"
              title="Using the browser's native BarcodeDetector"
            >
              Native
            </span>
            {resolution && (
              <span className="bg-black/50 px-2 py-0.5 rounded">
                {resolution}
              </span>
            )}
            {stats.attempts > 0 && (
              <span
                className="bg-black/50 px-2 py-0.5 rounded normal-case tracking-normal"
                title="Frames decoded · last error"
              >
                {stats.attempts}f
                {stats.lastError ? ` · ${stats.lastError}` : ""}
              </span>
            )}
          </div>

          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? "Turn torch off" : "Turn torch on"}
              className={`absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                torchOn ? "bg-amber-300 text-amber-900" : "bg-black/50 text-white"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="currentColor"
                aria-hidden
              >
                <path d="M14 2l-1.4 7H17l-7 13 1.4-9H6L14 2z" />
              </svg>
            </button>
          )}

          <div className="absolute bottom-2 inset-x-2 text-center text-[10px] text-white/90 bg-black/40 rounded py-1 px-2">
            Centre the barcode in the brackets · hold steady ~10–20 cm away
          </div>
        </div>
      )}

      {insecure && (
        <div className="text-xs text-amber-900 bg-amber-100 rounded-lg p-3 leading-relaxed">
          <strong>Camera blocked: page is not secure.</strong> iOS Safari only
          grants camera access on <code>https://</code> or <code>localhost</code>
          . Open this site via an HTTPS tunnel (ngrok / cloudflared) or deploy
          it. You can still type a barcode below.
        </div>
      )}

      {unsupported && (
        <div className="text-xs text-amber-900 bg-amber-100 rounded-lg p-3 leading-relaxed">
          <strong>Barcode scanner not supported in this browser.</strong> This
          app uses the native <code>BarcodeDetector</code> API, which works on
          Chrome / Edge / Samsung Internet on Android, and Safari on iOS 17.2+.
          On other browsers, type the barcode below.
        </div>
      )}

      {error && (
        <div className="text-xs text-red-700 bg-red-50 rounded-lg p-3">
          Camera error: {error}. Check Settings → Safari → Camera, or type a
          barcode below.
        </div>
      )}

      {showCamera && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={snap}
            disabled={snapping}
            className="flex-1 bg-[#5a3a24] text-white text-sm py-2 rounded-lg font-semibold disabled:opacity-50"
          >
            {snapping ? "Decoding…" : "📸 Snap & decode"}
          </button>
        </div>
      )}

      {showCamera && (
        <p className="text-[11px] text-[#7a6a60] leading-snug">
          <strong>Not scanning?</strong> You're using your phone's native
          barcode decoder. If a code still won't read, the bars are too blurry
          or too small in frame. Try the torch, move further away if your camera
          is fixed-focus, or tap <strong>Snap &amp; decode</strong> to capture
          and decode a single still frame.
        </p>
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

function Bracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "absolute w-6 h-6 border-emerald-300/90 [border-style:solid]";
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t-3 border-l-3 rounded-tl-md",
    tr: "top-0 right-0 border-t-3 border-r-3 rounded-tr-md",
    bl: "bottom-0 left-0 border-b-3 border-l-3 rounded-bl-md",
    br: "bottom-0 right-0 border-b-3 border-r-3 rounded-br-md",
  };
  return <span className={`${base} ${map[pos]}`} aria-hidden />;
}
