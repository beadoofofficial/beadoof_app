"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { StockStatus } from "@/lib/inventory";
import { IconBox, IconHeart, IconRefresh, IconX, IconZoomIn } from "./icons";
import { useActiveItem } from "./ActiveItemProvider";
import OrderForm from "./OrderForm";

export type Bead = {
  color: string;
  stock: StockStatus;
  /** Inventory row id; used to count usages against the maxPerDesign cap. */
  id?: string;
  name?: string;
  assorted?: boolean;
  lettered?: boolean;
  letter?: string;
  quantity?: number;
  lowThreshold?: number;
  sizeMm?: number;
  imageUrl?: string | null;
  /** When set, customers can only use this bead up to N times in one design. */
  maxPerDesign?: number | null;
  /** Specific colors that make up an assorted pack. Replaces the rainbow. */
  variantColors?: string[];
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

  // Image takes precedence over color when present. Wrap in a circle and
  // keep the highlight + letter overlay so it still reads as a bead.
  if (bead.imageUrl) {
    const showVariantDot =
      !bead.assorted &&
      bead.variantColors &&
      bead.variantColors.length > 0 &&
      bead.variantColors.includes(bead.color);
    return (
      <div className={`relative ${dim}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bead.imageUrl}
          alt={bead.name ?? ""}
          className="absolute inset-0 w-full h-full rounded-full object-cover shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
          draggable={false}
        />
        {bead.stock === "out" && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "repeating-linear-gradient(45deg, rgba(207,207,207,0.85) 0 2px, rgba(236,236,236,0.85) 2px 5px)",
            }}
          />
        )}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 35%)",
            boxShadow:
              "inset 0 -3px 5px rgba(0,0,0,0.12), inset 0 2px 4px rgba(255,255,255,0.15)",
          }}
        />
        {showVariantDot && (
          <span
            className="absolute -top-0.5 -left-0.5 rounded-full shadow ring-1 ring-white/80 pointer-events-none"
            style={{
              width: fluid ? "30%" : size === "lg" ? "1.125rem" : "0.875rem",
              height: fluid ? "30%" : size === "lg" ? "1.125rem" : "0.875rem",
              background: bead.color,
            }}
            aria-hidden
          />
        )}
        {bead.letter && (
          <span
            className="absolute inset-0 flex items-center justify-center font-extrabold text-white select-none pointer-events-none uppercase"
            style={{
              fontSize: fluid ? "55%" : size === "lg" ? "1.25rem" : "1rem",
              textShadow:
                "0 1px 1px rgba(0,0,0,0.6), 0 0 3px rgba(0,0,0,0.45)",
            }}
          >
            {bead.letter}
          </span>
        )}
      </div>
    );
  }

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

  // Assorted with explicit variant colors → build the swirl from them.
  // Otherwise fall back to the default rainbow.
  const assortedSwirl = (() => {
    const v = bead.variantColors;
    if (!v || v.length === 0) return ASSORTED_SWIRL;
    if (v.length === 1) return v[0];
    return `conic-gradient(from 0deg,${[...v, v[0]].join(",")})`;
  })();

  const baseFill = bead.assorted ? assortedSwirl : bead.color;

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
      {bead.letter && (
        <span
          className="absolute inset-0 flex items-center justify-center font-extrabold text-white select-none pointer-events-none uppercase"
          style={{
            fontSize: fluid ? "55%" : size === "lg" ? "1.25rem" : "1rem",
            textShadow: "0 1px 1px rgba(0,0,0,0.45), 0 0 2px rgba(0,0,0,0.35)",
          }}
        >
          {bead.letter}
        </span>
      )}
    </div>
  );
}

function BraceletRing({
  design,
  selectedIndex,
  onSelect,
}: {
  design: Bead[];
  selectedIndex: number | null;
  onSelect: (i: number | null) => void;
}) {
  const count = design.length;
  // Fixed angular step until the ring closes — beads pack adjacent starting
  // from the top. Once we exceed RING_CAPACITY, redistribute evenly so the
  // ring stays a complete circle.
  const ringSize = Math.max(RING_CAPACITY, count + 1);
  const step = 360 / ringSize;
  // Bead diameter scales with the ring's chord length so adjacent beads
  // never overlap. Chord between slots = 2 * R * sin(step / 2) where R is
  // 40% of the container width. We use 90% of the chord for a small visible
  // gap and clamp to a sensible min/max so super-low counts don't render
  // giant beads and super-high counts don't disappear.
  const RING_RADIUS_PCT = 40;
  const chordPct =
    2 * RING_RADIUS_PCT * Math.sin(((step / 2) * Math.PI) / 180);
  const beadSizePct = Math.max(7, Math.min(13, chordPct * 0.9));
  // Beads grow counter-clockwise from the top: the newest bead sits just to
  // the left of the silhouette, with older beads further around the ring.
  // design[count - 1] = newest, design[0] = oldest. The silhouette itself
  // stays anchored at the top.
  const angleAt = (i: number) => -90 - (count - i) * step;
  const nextAngle = count < MAX_BEADS ? -90 : null;

  return (
    <div
      className="relative w-full max-w-70 aspect-square mx-auto"
      onClick={() => onSelect(null)}
    >
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
        const isSelected = i === selectedIndex;
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(isSelected ? null : i);
            }}
            aria-label={`Select ${bead.name ?? "bead"} at position ${i + 1}`}
            aria-pressed={isSelected}
            title="Tap to select"
            className={`absolute aspect-square rounded-full transition-[left,top,transform,width] duration-200 ease-out cursor-pointer ${
              isSelected
                ? "ring-3 ring-[#5a3a24] ring-offset-2 ring-offset-white z-20 scale-110"
                : "hover:scale-105 active:scale-95 z-0"
            }`}
            style={{
              width: `${beadSizePct}%`,
              left: `calc(50% + ${RING_RADIUS_PCT}% * cos(${angle}deg))`,
              top: `calc(50% + ${RING_RADIUS_PCT}% * sin(${angle}deg))`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <DonutBead bead={bead} fluid />
          </button>
        );
      })}

      {/* Silhouette of the next bead slot, so the user sees where the next
          tap will land. Skipped once the bracelet is full. */}
      {nextAngle !== null && (
        <div
          className="absolute aspect-square rounded-full border-2 border-dashed border-[#a07258] bg-[#fbf1ea]/60 flex items-center justify-center text-[#a07258] text-base font-bold animate-pulse"
          style={{
            width: `${beadSizePct}%`,
            left: `calc(50% + ${RING_RADIUS_PCT}% * cos(${nextAngle}deg))`,
            top: `calc(50% + ${RING_RADIUS_PCT}% * sin(${nextAngle}deg))`,
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

      {/* Horizontal "flip line": beads above use the default ←/→ mapping,
          beads below use the swapped mapping. */}
      <div
        className="absolute left-[3%] right-[3%] top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1"
        aria-hidden
      >
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#b58f6a] bg-white/70 px-1 rounded">
          ⇄
        </span>
        <div className="flex-1 border-t border-dashed border-[#c2a48a]/60" />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#b58f6a] bg-white/70 px-1 rounded">
          ⇄
        </span>
      </div>
    </div>
  );
}

export default function DesignBuilder({ beads }: { beads: Bead[] }) {
  const { targetLengthIn, activeItemId } = useActiveItem();
  const [design, setDesign] = useState<Bead[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [letterPackIdx, setLetterPackIdx] = useState(0);
  const [letterText, setLetterText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [variantPickerFor, setVariantPickerFor] = useState<Bead | null>(null);

  const letterPacks = useMemo(() => beads.filter((b) => b.lettered), [beads]);
  const paletteBeads = useMemo(() => beads.filter((b) => !b.lettered), [beads]);
  const selectedPack: Bead | undefined = letterPacks[letterPackIdx];

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

  // How many of this bead are already placed in the design. Matched by
  // inventory id so two beads from the same pack share a count, including
  // every letter from a lettered pack.
  const usageOf = (b: Bead) =>
    b.id ? design.filter((d) => d.id === b.id).length : 0;

  /** True when this bead has a maxPerDesign cap and we've reached it. */
  const atItemLimit = (b: Bead) =>
    typeof b.maxPerDesign === "number" &&
    b.maxPerDesign > 0 &&
    usageOf(b) >= b.maxPerDesign;

  const totalMm = design.reduce(
    (sum, b) => sum + (b.sizeMm ?? DEFAULT_BEAD_MM),
    0,
  );
  const lengthInValue = totalMm / MM_PER_INCH;
  const lengthIn = lengthInValue.toFixed(1);
  const targetMm = targetLengthIn * MM_PER_INCH;
  const percent =
    targetMm > 0 ? Math.max(0, Math.min(100, (totalMm / targetMm) * 100)) : 0;
  const overTarget = totalMm > targetMm;
  const nearTarget = !overTarget && percent >= 90;
  const overByIn = overTarget ? (totalMm - targetMm) / MM_PER_INCH : 0;

  const addBead = (b: Bead) => {
    if (beadLevel(b) === "out") return;
    if (atItemLimit(b)) return;
    setDesign((d) => (d.length < MAX_BEADS ? [...d, b] : d));
  };

  const addLetters = () => {
    if (!selectedPack) return;
    if (beadLevel(selectedPack) === "out") return;
    const chars = letterText
      .toUpperCase()
      .split("")
      .filter((c) => /[A-Z0-9]/.test(c));
    if (chars.length === 0) return;
    setDesign((d) => {
      let room = MAX_BEADS - d.length;
      // If the lettered pack has a maxPerDesign cap, only let the user
      // type up to the remaining quota for that pack.
      if (
        typeof selectedPack.maxPerDesign === "number" &&
        selectedPack.maxPerDesign > 0 &&
        selectedPack.id
      ) {
        const used = d.filter((b) => b.id === selectedPack.id).length;
        const packRoom = selectedPack.maxPerDesign - used;
        room = Math.min(room, Math.max(0, packRoom));
      }
      const toAdd = chars.slice(0, Math.max(0, room));
      return [...d, ...toAdd.map((letter) => ({ ...selectedPack, letter }))];
    });
    setLetterText("");
  };

  const removeBeadAt = (i: number) => {
    setDesign((d) => d.filter((_, idx) => idx !== i));
    setSelectedIndex(null);
  };

  const moveBead = (from: number, direction: -1 | 1) => {
    const to = from + direction;
    setDesign((d) => {
      if (to < 0 || to >= d.length) return d;
      const next = [...d];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    setSelectedIndex((cur) => {
      if (cur !== from) return cur;
      if (to < 0 || to >= design.length) return cur;
      return to;
    });
  };

  const clear = () => {
    if (design.length === 0) return;
    if (!window.confirm("Clear your current design?")) return;
    setDesign([]);
    setSelectedIndex(null);
  };

  const randomFill = () => {
    if (inStock.length === 0) return;
    if (
      design.length > 0 &&
      !window.confirm("Replace your design with a random one?")
    )
      return;
    // Greedy fill: track counts so beads with maxPerDesign don't exceed
    // their cap. If every in-stock bead is capped out, we stop early.
    const next: Bead[] = [];
    const counts = new Map<string, number>();
    while (next.length < RANDOM_FILL_COUNT) {
      const candidates = inStock.filter((b) => {
        if (typeof b.maxPerDesign !== "number" || !b.id) return true;
        return (counts.get(b.id) ?? 0) < b.maxPerDesign;
      });
      if (candidates.length === 0) break;
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      next.push(picked);
      if (picked.id) {
        counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1);
      }
    }
    setDesign(next);
  };

  return (
    <>
      {/* Your Design card */}
      <div className="bg-white rounded-2xl shadow-sm p-3 md:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-sm md:text-lg font-bold whitespace-nowrap">
              Your Design
            </h2>
            <IconHeart className="w-4 h-4 text-[#9a8478] shrink-0" />
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={design.length === 0}
            className="inline-flex items-center gap-1.5 text-xs md:text-sm px-2.5 md:px-3 py-1 md:py-1.5 rounded-full border border-[#e4d3c4] text-[#a07258] hover:bg-[#fbf1ea] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <IconRefresh className="hidden md:inline-block w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        <BraceletRing
          design={design}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />

        {design.length === 0 && (
          <div className="text-center text-xs text-[#9a8478] italic mt-3 px-3">
            Tap a bead below to start building your bracelet
          </div>
        )}

        {selectedIndex !== null &&
          design[selectedIndex] &&
          (() => {
            // Map the ← / → buttons to whichever array direction actually
            // moves the bead leftward / rightward in screen space. CCW (array
            // -1) moves the bead with screen-x velocity proportional to
            // sin(θ): positive sin = CCW visually moves RIGHT (bead is in the
            // lower half), so the buttons need to swap.
            const ringSize = Math.max(RING_CAPACITY, design.length + 1);
            const step = 360 / ringSize;
            const angle = -90 - (design.length - selectedIndex) * step;
            const sinTheta = Math.sin((angle * Math.PI) / 180);
            const leftDir: -1 | 1 = sinTheta > 0 ? 1 : -1;
            const rightDir: -1 | 1 = (-leftDir) as -1 | 1;
            const leftTarget = selectedIndex + leftDir;
            const rightTarget = selectedIndex + rightDir;
            const leftDisabled =
              leftTarget < 0 || leftTarget >= design.length;
            const rightDisabled =
              rightTarget < 0 || rightTarget >= design.length;
            const swapped = sinTheta > 0;
            return (
              <div
                className="mt-3 space-y-1"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[10px] text-[#a07258] text-center italic px-1">
                  {swapped
                    ? "Below the ⇄ line — ← / → flipped"
                    : "Above the ⇄ line — ← left, → right"}
                </div>
                <div className="flex items-center gap-1.5 md:gap-2 p-1.5 md:p-2 rounded-xl border border-[#e4d3c4] bg-[#fbf6ef]">
                  <button
                    type="button"
                    onClick={() => moveBead(selectedIndex, leftDir)}
                    disabled={leftDisabled}
                    aria-label="Move bead left"
                    title="Move left"
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] md:text-sm font-semibold px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-white border border-[#e4d3c4] text-[#5a3a24] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span aria-hidden className="text-sm md:text-base">←</span>
                    <span className="hidden xs:inline md:inline">Move</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBeadAt(selectedIndex)}
                    aria-label="Remove selected bead"
                    title="Remove bead"
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] md:text-sm font-semibold px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200"
                  >
                    <IconX className="w-3 h-3" /> Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => moveBead(selectedIndex, rightDir)}
                    disabled={rightDisabled}
                    aria-label="Move bead right"
                    title="Move right"
                    className="flex-1 flex items-center justify-center gap-1 text-[11px] md:text-sm font-semibold px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-white border border-[#e4d3c4] text-[#5a3a24] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="hidden xs:inline md:inline">Move</span>
                    <span aria-hidden className="text-sm md:text-base">→</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIndex(null)}
                    aria-label="Deselect bead"
                    title="Done"
                    className="shrink-0 w-7 h-7 md:w-auto md:h-auto md:px-2 flex items-center justify-center rounded-lg text-[#7a6a60] hover:text-[#5a3a24] hover:bg-white"
                  >
                    <IconX className="w-4 h-4 md:hidden" />
                    <span className="hidden md:inline text-xs underline">
                      Done
                    </span>
                  </button>
                </div>
              </div>
            );
          })()}

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
              <span className="text-[#9a8478]">
                {" "}
                / {targetLengthIn.toFixed(1)} in
              </span>
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

          <button
            type="button"
            onClick={() => setOrderOpen(true)}
            disabled={design.length === 0}
            className="mt-2 w-full bg-[#5a3a24] text-white py-2.5 rounded-xl font-semibold shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#3e2a18] transition-colors"
          >
            Send order
          </button>
        </div>
      </div>

      {orderOpen && (
        <OrderForm
          design={design}
          onClose={() => setOrderOpen(false)}
          onSent={() => {
            setDesign([]);
            setSelectedIndex(null);
          }}
        />
      )}

      {variantPickerFor && (
        <VariantPicker
          bead={variantPickerFor}
          onClose={() => setVariantPickerFor(null)}
          onPick={(color) => {
            const base = variantPickerFor;
            if (color === null) {
              addBead(base);
            } else {
              addBead({
                ...base,
                color,
                assorted: false,
              });
            }
            setVariantPickerFor(null);
          }}
        />
      )}

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
          {paletteBeads.map((b, i) => {
            const level = beadLevel(b);
            const itemLimited = atItemLimit(b);
            const disabled = level === "out" || atMax || itemLimited;
            const dotClass =
              level === "out"
                ? "bg-[#cfcfcf]"
                : level === "low"
                  ? "bg-amber-400"
                  : "bg-green-500";
            const qtyLabel =
              typeof b.quantity === "number" ? ` · ${b.quantity} left` : "";
            const assortedLabel = b.assorted ? " · assorted" : "";
            const used = usageOf(b);
            const limitLabel =
              typeof b.maxPerDesign === "number"
                ? ` · ${used}/${b.maxPerDesign} used in design`
                : "";
            const titleText = atMax
              ? "Design is full"
              : itemLimited
                ? `${b.name ?? b.color} — max ${b.maxPerDesign} per design reached`
                : `${b.name ?? b.color}${assortedLabel}${qtyLabel}${limitLabel}`;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (b.variantColors && b.variantColors.length > 0) {
                    setVariantPickerFor(b);
                  } else {
                    addBead(b);
                  }
                }}
                disabled={disabled}
                aria-label={`Add ${b.name ?? b.color} bead${assortedLabel}${qtyLabel}${limitLabel}`}
                title={titleText}
                className="flex flex-col items-center gap-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="relative group-hover:scale-110 group-active:scale-95 transition-transform">
                  <DonutBead bead={b} />
                  {/* Assorted indicator — only when an image hides the
                      rainbow swirl that would otherwise mark this bead as
                      a mixed pack. Mirrors the quantity badge in the
                      opposite corner. */}
                  {b.assorted && b.imageUrl && (
                    <span
                      className="absolute -top-1 -left-1 w-4.5 h-4.5 rounded-full shadow ring-1 ring-white/80"
                      style={{
                        background:
                          b.variantColors && b.variantColors.length > 0
                            ? b.variantColors.length === 1
                              ? b.variantColors[0]
                              : `conic-gradient(from 0deg,${[
                                  ...b.variantColors,
                                  b.variantColors[0],
                                ].join(",")})`
                            : ASSORTED_SWIRL,
                      }}
                      title={
                        b.variantColors && b.variantColors.length > 0
                          ? `Assorted pack — ${b.variantColors.length} colors`
                          : "Assorted pack"
                      }
                      aria-label="Assorted pack"
                    />
                  )}
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
                <div className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${dotClass}`}
                  />
                  {typeof b.maxPerDesign === "number" && (
                    <span
                      className={`text-[9px] tabular-nums font-semibold leading-none ${
                        itemLimited ? "text-red-600" : "text-[#9a8478]"
                      }`}
                    >
                      {used}/{b.maxPerDesign}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {letterPacks.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[#f1e4d5]">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h4 className="text-base md:text-lg font-bold flex items-center gap-2">
                <span
                  className="inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-extrabold text-white shadow-[inset_0_-2px_3px_rgba(0,0,0,0.2)]"
                  style={{
                    background: selectedPack
                      ? selectedPack.assorted
                        ? ASSORTED_SWIRL
                        : selectedPack.color
                      : "#5a3a24",
                    textShadow: "0 1px 1px rgba(0,0,0,0.45)",
                  }}
                  aria-hidden
                >
                  A
                </span>
                Letter beads
              </h4>
              <select
                value={letterPackIdx}
                onChange={(e) => setLetterPackIdx(Number(e.target.value))}
                aria-label="Letter pack"
                className="flex-1 min-w-0 max-w-[60%] text-xs bg-white border border-[#e4d3c4] rounded-lg px-2 py-1.5 truncate"
              >
                {letterPacks.map((p, idx) => (
                  <option key={idx} value={idx}>
                    {p.name ?? `Pack ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={letterText}
                onChange={(e) =>
                  setLetterText(e.target.value.slice(0, MAX_BEADS))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLetters();
                  }
                }}
                placeholder="Type letters (e.g. MAYA)"
                maxLength={MAX_BEADS}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="flex-1 min-w-0 text-sm font-semibold border border-[#e4d3c4] rounded-lg px-3 py-2 uppercase tracking-wider"
              />
              <button
                type="button"
                onClick={addLetters}
                disabled={
                  !selectedPack ||
                  beadLevel(selectedPack) === "out" ||
                  letterText.trim().length === 0 ||
                  atMax
                }
                className="text-sm font-semibold px-4 rounded-lg bg-[#5a3a24] text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
            {selectedPack && beadLevel(selectedPack) === "out" && (
              <div className="mt-2 text-[11px] text-red-600">
                Selected pack is out of stock.
              </div>
            )}
          </div>
        )}

        <div className="mt-4 p-3 bg-[#fbf1ea] rounded-xl text-[11px] md:text-xs text-[#7a5a44] flex items-center gap-2">
          <IconBox className="w-5 h-5 text-[#a07258] shrink-0" />
          <span className="flex-1">
            Tap a bead below to add it. Tap a bead in your design to select —
            then move it left/right or remove it. Up to {MAX_BEADS} beads.
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

function VariantPicker({
  bead,
  onClose,
  onPick,
}: {
  bead: Bead;
  onClose: () => void;
  onPick: (color: string | null) => void;
}) {
  const variants = bead.variantColors ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#f1e4d5] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">
              {bead.name ?? "Pick a color"}
            </h2>
            <p className="text-[11px] text-[#7a6a60]">
              Choose a specific color or use the assorted mix.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-[#7a6a60] hover:text-foreground px-2 shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-4 gap-3 justify-items-center">
            {variants.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onPick(c)}
                className="flex flex-col items-center gap-1.5 group"
                aria-label={`Use color ${c}`}
              >
                <div className="relative group-hover:scale-110 group-active:scale-95 transition-transform">
                  <DonutBead bead={{ ...bead, color: c, assorted: false }} />
                </div>
                <span className="text-[10px] tabular-nums text-[#7a6a60] uppercase">
                  {c}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onPick(null)}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#e4d3c4] bg-[#fbf1ea] text-[#5a3a24] text-sm font-semibold hover:bg-[#f3e2d2] transition-colors"
          >
            <span
              className="inline-block w-5 h-5 rounded-full"
              style={{
                background:
                  variants.length === 0
                    ? ASSORTED_SWIRL
                    : variants.length === 1
                      ? variants[0]
                      : `conic-gradient(from 0deg,${[...variants, variants[0]].join(",")})`,
              }}
              aria-hidden
            />
            Any color (assorted)
          </button>
        </div>
      </div>
    </div>
  );
}
