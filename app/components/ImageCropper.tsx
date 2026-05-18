"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

type Props = {
  /** Object URL or data URL of the image to crop. */
  src: string;
  /** Suggested filename (used when emitting the cropped blob). */
  filename?: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
};

export default function ImageCropper({
  src,
  filename = "cropped.jpg",
  onCancel,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape — same UX convention as OrderForm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedPixels(areaPixels);
  }, []);

  const save = async () => {
    if (busy) return;
    if (!croppedPixels) {
      setError("Adjust the crop and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(src, croppedPixels);
      await onConfirm(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not crop image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-3 md:p-6"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 md:px-5 py-3 border-b border-[#f1e4d5] flex items-center justify-between">
          <h2 className="text-base font-bold">Adjust photo</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-2xl leading-none text-[#7a6a60] hover:text-[#3b2b22] px-2 disabled:opacity-40"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Crop surface — square aspect, circular highlight */}
        <div className="relative w-full aspect-square bg-black">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            minZoom={1}
            maxZoom={4}
            zoomSpeed={0.6}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="p-4 md:p-5 space-y-3">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-[#9a8478] mb-1">
              Zoom
            </span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[#5a3a24]"
              aria-label="Zoom"
            />
          </label>

          <p className="text-[11px] text-[#7a6a60]">
            Drag to pan · pinch or scroll to zoom · the visible circle is what
            the home palette will show.
          </p>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 bg-white border border-[#e4d3c4] text-[#5a3a24] py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || !croppedPixels}
              className="flex-1 bg-[#5a3a24] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
              data-filename={filename}
            >
              {busy ? "Saving…" : "Use photo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draw the cropped region from the source image onto a canvas, then encode
// as a JPEG blob. Output dimensions match the cropped pixel area, so high-
// resolution sources still produce a high-resolution thumbnail.

async function getCroppedBlob(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2d context unavailable");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.9,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Could not load image"));
    img.src = src;
  });
}
