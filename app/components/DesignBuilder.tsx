"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { StockStatus } from "@/lib/inventory";
import { IconBox, IconHeart, IconRefresh, IconX, IconZoomIn } from "./icons";
import { useActiveItem } from "./ActiveItemProvider";

export type Bead = {
  color: string;
  stock: StockStatus;
  name?: string;
  assorted?: boolean;
  quantity?: number;
  lowThreshold?: number;
  sizeMm?: number;
};

const MM_PER_INCH = 25.4;
const DEFAULT_BEAD_MM = 8;

function beadLevel(b: Bead): "out" | "low" | "ok" {
  if (b.stock === "out" || b.quantity === 0) return "out";
  if (typeof b.quantity === "number" && b.quantity <= (b.lowThreshold ?? 5))
    return "low";
  return "ok";
}

const STORAGE_KEY = "beadoof:design:bracelet";
const MAX_BEADS = 40;
const RANDOM_FILL_COUNT = 23;
const GHOST_SLOTS = 16;
// Beads needed to close the loop at default density. Below this, beads pack
// adjacent to each other starting from the top; once exceeded the ring
// redistributes evenly so everything still fits.
const RING_CAPACITY = 25;

const ASSORTED_SWIRL =
  "conic-gradient(from 0deg,#ff6b6b,#f7b733,#52c41a,#13c2c2,#1890ff,#9c27b0,#ff6b6b)";

function DonutBead({
  bead,
  fluid = false,
  size = "md",
}: {
  bead: Bead;
  fluid?: boolean;
  size?: "md" | "lg";
}) {
  const dim = fluid
    ? "w-full h-full"
    : size === "lg"
      ? "w-12 h-12"
      : "w-10 h-10";

  if (bead.stock === "out") {
    return (
      <div className={`relative ${dim}`}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "repeating-linear-gradient(45deg, #cfcfcf 0 2px, #ececec 2px 5px)",
            boxShadow:
              "inset 0 -3px 5px rgba(0,0,0,0.08), inset 0 3px 5px rgba(255,255,255,0.4)",
          }}
        />
      </div>
    );
  }

  const glitterOverlay =
    bead.stock === "glitter"
      ? "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 35%), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 25%), "
      : "";

  const baseFill = bead.assorted ? ASSORTED_SWIRL : bead.color;

  return (
    <div className={`relative ${dim}`}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `${glitterOverlay}radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 35%), ${baseFill}`,
          boxShadow:
            "inset 0 -4px 6px rgba(0,0,0,0.18), inset 0 3px 5px rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.08)",
        }}
      />
    </div>
  );
}

function BraceletRing({
  design,
  onRemove,
}: {
  design: Bead[];
  onRemove: (i: number) => void;
}) {
  const count = design.length;
  // Fixed angular step until the ring closes — beads pack adjacent starting
  // from the top. Once we exceed RING_CAPACITY, redistribute evenly so the
  // ring stays a complete circle.
  const ringSize = Math.max(RING_CAPACITY, count + 1);
  const step = 360 / ringSize;
  const angleAt = (i: number) => -90 + i * step;
  const nextAngle = count < MAX_BEADS ? angleAt(count) : null;

  return (
    <div className="relative w-full max-w-70 aspect-square mx-auto">
      {/* Empty-ring ghost: faint dashed circles around the perimeter so the
          shape of the bracelet is visible before anything is placed. */}
      {count === 0 &&
        Array.from({ length: GHOST_SLOTS }).map((_, i) => {
          const angle = (i / GHOST_SLOTS) * 360 - 90;
          return (
            <div
              key={`ghost-${i}`}
              className="absolute w-[12%] aspect-square rounded-full border-2 border-dashed border-[#e4d3c4] opacity-70"
              style={{
                left: `calc(50% + 40% * cos(${angle}deg))`,
                top: `calc(50% + 40% * sin(${angle}deg))`,
                transform: "translate(-50%, -50%)",
              }}
              aria-hidden
            />
          );
        })}

      {/* Placed beads */}
      {design.map((bead, i) => {
        const angle = angleAt(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onRemove(i)}
            aria-label={`Remove ${bead.name ?? "bead"} at position ${i + 1}`}
            title="Tap to remove"
            className="absolute w-[14%] aspect-square group cursor-pointer"
            style={{
              left: `calc(50% + 40% * cos(${angle}deg))`,
              top: `calc(50% + 40% * sin(${angle}deg))`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <DonutBead bead={bead} fluid />
            <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 group-active:bg-black/40 transition-colors flex items-center justify-center text-white opacity-0 group-hover:opacity-100 group-active:opacity-100">
              <IconX className="w-1/2 h-1/2 drop-shadow" />
            </span>
          </button>
        );
      })}

      {/* Silhouette of the next bead slot, so the user sees where the next
          tap will land. Skipped once the bracelet is full. */}
      {nextAngle !== null && (
        <div
          className="absolute w-[14%] aspect-square rounded-full border-2 border-dashed border-[#a07258] bg-[#fbf1ea]/60 flex items-center justify-center text-[#a07258] text-base font-bold animate-pulse"
          style={{
            left: `calc(50% + 40% * cos(${nextAngle}deg))`,
            top: `calc(50% + 40% * sin(${nextAngle}deg))`,
            transform: "translate(-50%, -50%)",
          }}
          aria-hidden
        >
          +
        </div>
      )}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36%] aspect-square rounded-full bg-[#8a5a3b] overflow-hidden shadow-md ring-2 ring-white pointer-events-none">
        <Image
          src="/logo.png"
          alt="beaver bead"
          width={160}
          height={160}
          className="object-cover w-full h-full"
          priority
        />
      </div>
    </div>
  );
}

export default function DesignBuilder({ beads }: { beads: Bead[] }) {
  const { targetLengthIn, activeItemId } = useActiveItem();
  const [design, setDesign] = useState<Bead[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setDesign(
            (parsed as Bead[])
              .filter(
                (b) =>
                  b &&
                  typeof b === "object" &&
                  typeof b.color === "string" &&
                  typeof b.stock === "string",
              )
              .slice(0, MAX_BEADS),
          );
        }
      }
    } catch {
      // ignore stale/malformed data
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
    } catch {
      // storage full or disabled — fall through silently
    }
  }, [design, hydrated]);

  const inStock = useMemo(
    () => beads.filter((b) => beadLevel(b) !== "out"),
    [beads],
  );

  const atMax = design.length >= MAX_BEADS;
  const totalMm = design.reduce(
    (sum, b) => sum + (b.sizeMm ?? DEFAULT_BEAD_MM),
    0,
  );
  const lengthInValue = totalMm / MM_PER_INCH;
  const lengthIn = lengthInValue.toFixed(1);
  const targetMm = targetLengthIn * MM_PER_INCH;
  const percent =
    targetMm > 0
      ? Math.max(0, Math.min(100, (totalMm / targetMm) * 100))
      : 0;
  const overTarget = totalMm > targetMm;
  const nearTarget = !overTarget && percent >= 90;
  const overByIn = overTarget ? (totalMm - targetMm) / MM_PER_INCH : 0;

  const addBead = (b: Bead) => {
    if (beadLevel(b) === "out") return;
    setDesign((d) => (d.length < MAX_BEADS ? [...d, b] : d));
  };

  const removeBead = (i: number) =>
    setDesign((d) => d.filter((_, idx) => idx !== i));

  const clear = () => {
    if (design.length === 0) return;
    if (!window.confirm("Clear your current design?")) return;
    setDesign([]);
  };

  const randomFill = () => {
    if (inStock.length === 0) return;
    if (
      design.length > 0 &&
      !window.confirm("Replace your design with a random one?")
    )
      return;
    const next = Array.from(
      { length: RANDOM_FILL_COUNT },
      () => inStock[Math.floor(Math.random() * inStock.length)],
    );
    setDesign(next);
  };

  return (
    <>
      {/* Your Design card */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base md:text-lg font-bold">Your Design</h2>
            <IconHeart className="w-4 h-4 text-[#9a8478]" />
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={design.length === 0}
            className="inline-flex items-center gap-1.5 text-xs md:text-sm px-3 py-1.5 rounded-full border border-[#e4d3c4] text-[#a07258] hover:bg-[#fbf1ea] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        <BraceletRing design={design} onRemove={removeBead} />

        {design.length === 0 && (
          <div className="text-center text-xs text-[#9a8478] italic mt-3 px-3">
            Tap a bead below to start building your bracelet
          </div>
        )}

        <div className="mt-3 space-y-2 text-[#7a6a60]">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={randomFill}
              disabled={inStock.length === 0}
              aria-label="Random fill"
              title="Random fill"
              className="w-8 h-8 rounded-lg border border-[#e4d3c4] flex items-center justify-center hover:bg-[#fbf1ea] disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
            >
              <IconRefresh className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium tabular-nums text-center flex-1">
              {design.length} bead{design.length === 1 ? "" : "s"} ·{" "}
              <span
                className={
                  overTarget
                    ? "text-red-600"
                    : nearTarget
                      ? "text-amber-700"
                      : ""
                }
              >
                {lengthIn}
              </span>
              <span className="text-[#9a8478]"> / {targetLengthIn.toFixed(1)} in</span>
            </span>
            <button
              type="button"
              aria-label="zoom in"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#fbf1ea] shrink-0"
            >
              <IconZoomIn className="w-5 h-5" />
            </button>
          </div>
          <div
            className="h-2 rounded-full bg-[#f1e4d5] overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Design length, ${lengthIn} of ${targetLengthIn.toFixed(1)} inches`}
          >
            <div
              className={`h-full transition-all ${
                overTarget
                  ? "bg-red-400"
                  : nearTarget
                    ? "bg-amber-400"
                    : "bg-emerald-400"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="text-[11px] text-[#9a8478] text-center capitalize">
            {activeItemId} target · {targetLengthIn.toFixed(1)} in
            {overTarget && (
              <span className="ml-2 text-red-600 font-semibold normal-case">
                Over by {overByIn.toFixed(1)} in
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bead Colors / palette card */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h3 className="text-base md:text-lg font-bold">Bead Colors</h3>
          <div className="flex items-center gap-2 text-xs text-[#5a4438] flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              In stock
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Low
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, #cfcfcf 0 1px, #ececec 1px 3px)",
                }}
              />
              Out
            </span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-x-3 gap-y-3 md:gap-x-4 md:gap-y-4 justify-items-center">
          {beads.map((b, i) => {
            const level = beadLevel(b);
            const disabled = level === "out" || atMax;
            const dotClass =
              level === "out"
                ? "bg-[#cfcfcf]"
                : level === "low"
                  ? "bg-amber-400"
                  : "bg-green-500";
            const qtyLabel =
              typeof b.quantity === "number" ? ` · ${b.quantity} left` : "";
            return (
              <button
                key={i}
                type="button"
                onClick={() => addBead(b)}
                disabled={disabled}
                aria-label={`Add ${b.name ?? b.color} bead${qtyLabel}`}
                title={
                  atMax ? "Design is full" : `${b.name ?? b.color}${qtyLabel}`
                }
                className="flex flex-col items-center gap-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="relative group-hover:scale-110 group-active:scale-95 transition-transform">
                  <DonutBead bead={b} />
                  {typeof b.quantity === "number" && (
                    <span
                      className={`absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center shadow ring-1 ring-black/5 ${
                        level === "out"
                          ? "bg-[#e8e8e8] text-[#7a6a60]"
                          : level === "low"
                            ? "bg-amber-400 text-[#5a3a00]"
                            : "bg-white text-[#5a4438]"
                      }`}
                    >
                      {b.quantity}
                    </span>
                  )}
                </div>
                <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
              </button>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-[#fbf1ea] rounded-xl text-[11px] md:text-xs text-[#7a5a44] flex items-center gap-2">
          <IconBox className="w-5 h-5 text-[#a07258] shrink-0" />
          <span className="flex-1">
            Tap a bead to add it. Tap a bead in your design to remove. Up to{" "}
            {MAX_BEADS} beads.
          </span>
          <div className="relative w-8 h-8 shrink-0">
            <Image
              src="/logo.png"
              alt=""
              fill
              sizes="32px"
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </>
  );
}
