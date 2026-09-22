"use client";

// The guided order wizard — a React port of the Apps Script BEADOOF form,
// styled with Tailwind (theme tokens live in globals.css @theme).
// Views: start → steps → review → receipt, plus "check an order" tracking.
//
// One order can hold several pieces: a "How many pieces?" step sets the
// count, and a piece carousel between the progress cord and the step body
// switches which piece is being built. Order-level choices (fulfillment,
// details, payment) are shared; everything checks out under one code.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  cleanName,
  colorHexOf,
  dotted,
  findOpt,
  formatMoney,
  isPlainMerch,
  orderSubtotalOf,
  pieceSubtotalOf,
  priceOf,
  qrPayload,
  totalOf,
  type Category,
  type PieceSelections,
  type ShopBootstrap,
  type ShopOption,
} from "@/lib/shop";

declare global {
  interface Window {
    QRious?: new (opts: Record<string, unknown>) => unknown;
  }
}

/* ------------------------------------------------ class recipes ----- */

const shellCls = "mx-auto min-h-screen max-w-[460px] px-[18px] pt-5 pb-7";
const duoCls = `${shellCls} lg:grid lg:max-w-[828px] lg:grid-cols-[minmax(0,460px)_320px] lg:items-start lg:gap-x-[30px]`;
const viewCls = "animate-rise motion-reduce:animate-none";

const focusRing =
  "focus-visible:outline-3 focus-visible:outline-aqua focus-visible:outline-offset-2";

const btnBase = `w-full cursor-pointer rounded-full border-none px-5 py-[15px] font-display text-[17px] font-medium ${focusRing}`;
const btnPrimary = `${btnBase} bg-shop-pink text-white shadow-[0_4px_0_#c93a74] active:translate-y-[3px] active:shadow-[0_1px_0_#c93a74] disabled:cursor-not-allowed disabled:bg-[#d9d1e6] disabled:shadow-[0_4px_0_#c4bad6]`;
const btnQuiet = `${btnBase} mt-2 bg-transparent text-shop-muted underline`;
const iconBtn = `h-[38px] w-[38px] flex-none cursor-pointer rounded-full border-none bg-white text-lg text-ink ${focusRing}`;

const inputCls =
  "w-full rounded-[14px] border-2 border-transparent bg-white px-4 py-3.5 text-[17px] text-ink focus:border-aqua focus:outline-none";
const fieldCls = "mb-3.5 block";
const fieldLabelCls = "mb-1.5 block text-sm text-shop-muted";
const errorCls =
  "mb-3 rounded-xl bg-[#ffe3ec] px-3.5 py-3 text-[14.5px] text-[#a31346]";

const tileBase =
  "relative flex min-h-[84px] cursor-pointer flex-col justify-center gap-1.5 rounded-2xl border-2 border-transparent bg-white px-3 py-3.5 text-left text-ink " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[pressed=true]:border-shop-pink aria-[pressed=true]:bg-[#fff1f6] " +
  "aria-[pressed=true]:after:absolute aria-[pressed=true]:after:top-[9px] aria-[pressed=true]:after:right-[9px] " +
  "aria-[pressed=true]:after:h-[13px] aria-[pressed=true]:after:w-[13px] aria-[pressed=true]:after:rounded-full " +
  "aria-[pressed=true]:after:bg-shop-pink aria-[pressed=true]:after:shadow-[inset_-2px_-2px_0_rgba(0,0,0,.18)] " +
  "aria-[pressed=true]:after:content-[''] " +
  focusRing;
const tileCenter = `${tileBase} items-center text-center`;
const tileNameCls = "font-display text-[17px] font-medium leading-tight";
const tileNoteCls = "text-[12.5px] leading-snug text-shop-muted";
const tilePriceCls = "text-[12.5px] font-bold text-shop-pink";

const gridCls = "grid grid-cols-2 gap-2.5";
const grid3Cls = "grid grid-cols-3 gap-2.5";

const stepTitleCls = "mb-1 font-display text-[27px] font-medium leading-[1.15]";
const stepHintCls = "mb-[18px] text-[15px] text-shop-muted";
const viewTitleCls = "m-0 font-display text-[22px] font-medium";
const topbarCls = "flex items-center gap-3 pt-1.5 pb-[18px]";

const previewCls =
  "mb-4 grid min-h-[74px] place-items-center rounded-[18px] bg-white px-2 py-2.5";
const summaryRowCls =
  "flex justify-between gap-3.5 border-b border-dashed border-cord/90 px-0.5 py-2.5 text-[15px]";
const qrImgCls = "mx-auto block h-auto w-full max-w-[260px] rounded-xl bg-white";
const qrNoteCls = "m-0 text-sm text-shop-muted";
const receiptPayCls =
  "mt-4 rounded-xl bg-[#effbfc] px-3.5 py-3 text-left text-[14.5px]";

/* ------------------------------------------------ bead preview ----- */

function RoundBead({ hex }: { hex: string }) {
  return (
    <span
      className="relative z-[1] h-[22px] w-[22px] self-center rounded-full shadow-[inset_-3px_-3px_0_rgba(0,0,0,.14),inset_3px_3px_0_rgba(255,255,255,.5)]"
      style={{ background: hex }}
    />
  );
}

function Charm({ text, size }: { text: string; size?: number }) {
  return (
    <span
      className="relative z-[1] text-2xl leading-[34px] drop-shadow-[0_2px_2px_rgba(0,0,0,.12)]"
      style={size ? { fontSize: size } : undefined}
    >
      {text}
    </span>
  );
}

function BeadLine({
  text,
  color,
  charm,
  small,
  fit,
}: {
  text: string;
  color?: string | null;
  charm?: string;
  small?: boolean;
  /** Scale the beads down with the screen so the whole line fits one strand
      (used for the shop name in the masthead). */
  fit?: boolean;
}) {
  const chars = String(text ?? "").split("");
  const spaces = chars.filter((c) => c === " ").length;
  const letters = Math.max(chars.length - spaces, 1);
  // available width = shell (≤460px) minus its 18px side paddings; subtract
  // the 5px gaps and 14px space-beads, split the rest across the letters.
  const fitStyle = fit
    ? ({
        "--bead": `clamp(16px, calc((min(100vw, 460px) - 36px - ${
          (chars.length - 1) * 5 + spaces * 14
        }px) / ${letters}), 34px)`,
      } as React.CSSProperties)
    : undefined;
  const letterCls = fit
    ? "h-(--bead) w-(--bead) rounded-[calc(var(--bead)*0.26)] text-[length:calc(var(--bead)*0.56)]"
    : small
      ? "h-[26px] w-[26px] rounded-[7px] text-[15px]"
      : "h-[34px] w-[34px] rounded-[9px] text-[19px]";
  return (
    <div
      className="relative flex flex-wrap justify-center gap-[5px] py-3 before:absolute before:top-1/2 before:left-[6%] before:right-[6%] before:z-0 before:h-[3px] before:rounded-[3px] before:bg-cord before:content-['']"
      style={fitStyle}
    >
      {color && <RoundBead hex={color} />}
      {String(text ?? "")
        .split("")
        .map((ch, i) => {
          if (ch === " ")
            return (
              <span
                key={i}
                className="z-[1] w-3.5 border-none bg-transparent shadow-none"
              />
            );
          if (ch === "-") return <RoundBead key={i} hex={color || "#C5B8DF"} />;
          return (
            <span
              key={i}
              className={`relative z-[1] grid place-items-center border border-ivory-edge bg-ivory font-display font-semibold leading-none shadow-[inset_0_-3px_0_rgba(0,0,0,.06)] ${letterCls}`}
              style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }}
            >
              {ch.toUpperCase()}
            </span>
          );
        })}
      {color && <RoundBead hex={color} />}
      {charm && <Charm text={charm} />}
    </div>
  );
}

/** A short strand with the charm in the middle, for items with no name on them. */
function PlainStrand({ color, charm }: { color?: string | null; charm?: string }) {
  return (
    <div className="relative flex flex-wrap justify-center gap-[5px] py-3 before:absolute before:top-1/2 before:left-[6%] before:right-[6%] before:z-0 before:h-[3px] before:rounded-[3px] before:bg-cord before:content-['']">
      {Array.from({ length: 4 }, (_, i) => (
        <RoundBead key={`a${i}`} hex={color || "#C5B8DF"} />
      ))}
      {charm && <Charm text={charm} />}
      {Array.from({ length: 4 }, (_, i) => (
        <RoundBead key={`b${i}`} hex={color || "#C5B8DF"} />
      ))}
    </div>
  );
}

function BeadRing({ colors }: { colors: string }) {
  const list = colors.split(",").map((c) => c.trim()).filter(Boolean);
  const palette = list.length ? list : ["#C5B8DF"];
  const dots = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return (
      <circle
        key={i}
        cx={(30 + Math.cos(a) * 22).toFixed(1)}
        cy={(30 + Math.sin(a) * 22).toFixed(1)}
        r="5"
        fill={palette[i % palette.length]}
        stroke="rgba(0,0,0,.08)"
      />
    );
  });
  return (
    <svg viewBox="0 0 60 60" width="54" height="54" aria-hidden>
      {dots}
    </svg>
  );
}

/* ------------------------------------------------ payment QR ------- */

function looksLikeImage(qr: string): boolean {
  return /^https?:\/\//i.test(qr) || qr.startsWith("data:") || qr.startsWith("/");
}

/** Draws a QR from its text via QRious (loaded from CDN by the page).
    Falls back to showing the raw text if the drawer is unavailable. The
    canvas/fallback swap is done on the DOM directly — the effect only
    synchronizes with the external QRious library, no state involved. */
function QrText({ text }: { text: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    let tries = 0;

    const show = (drawn: boolean) => {
      if (canvasRef.current)
        canvasRef.current.style.display = drawn ? "block" : "none";
      if (fallbackRef.current)
        fallbackRef.current.style.display = drawn ? "none" : "block";
    };

    // The CDN script loads in parallel with the page; retry briefly in case
    // the customer reaches a QR before it has arrived.
    const attempt = () => {
      if (cancelled || !canvasRef.current) return;
      if (window.QRious) {
        try {
          new window.QRious({
            element: canvasRef.current,
            value: text,
            size: 520,
            level: "M",
            background: "#ffffff",
            foreground: "#241C33",
            padding: 12,
          });
          show(true);
          return;
        } catch {
          show(false);
          return;
        }
      }
      if (++tries < 20) setTimeout(attempt, 250);
      else show(false);
    };
    attempt();

    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <>
      <canvas ref={canvasRef} className={qrImgCls} style={{ display: "none" }} />
      <p
        ref={fallbackRef}
        className="m-0 rounded-[10px] bg-paper p-3 text-left font-mono text-xs break-all"
        style={{ display: "none" }}
      >
        {text}
      </p>
    </>
  );
}

function QrBox({
  option,
  lead,
  amount,
  qrDynamic,
  onPaper,
}: {
  option: ShopOption | null;
  lead: string;
  /** The order total — put inside a text QR when the shop setting allows it. */
  amount?: number | null;
  qrDynamic: boolean;
  /** true when the box sits on a white card (receipt) and needs the paper bg. */
  onPaper?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const qr = option?.qr?.trim();
  if (!qr) return null;

  const isImage = looksLikeImage(qr);
  const built = isImage
    ? { text: qr, carriesAmount: false }
    : qrPayload(qr, amount, qrDynamic);

  return (
    <div
      className={`mt-4 rounded-[18px] p-4 text-center ${onPaper ? "bg-paper" : "bg-white"}`}
    >
      {lead && <p className="mb-3 text-[14.5px] text-shop-muted">{lead}</p>}
      <div className="grid min-h-[120px] place-items-center">
        {isImage ? (
          broken ? (
            <p className={qrNoteCls}>That QR image could not load.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- external QR image with unknown host/size
            <img
              className={qrImgCls}
              alt="Payment QR code"
              src={qr}
              onError={() => setBroken(true)}
            />
          )
        ) : (
          <QrText text={built.text} />
        )}
      </div>
      {built.carriesAmount && (
        <p className={`${qrNoteCls} mt-2`}>
          The amount is already in this code — check it matches before you
          confirm.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------ proof upload ----- */

/** Shrinks photos before sending, so a 4 MB camera shot turns into a few
    hundred kilobytes. PDFs and anything the browser cannot draw are sent
    as they are. */
function prepareProof(
  file: File,
  done: (err: string | null, dataUri?: string) => void,
) {
  if (file.size > 20 * 1024 * 1024) {
    done("That file is very big. Send a screenshot of the payment instead.");
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => done("That file could not be read. Try another one.");

  reader.onload = () => {
    const asIs = () => {
      if (file.size > 6 * 1024 * 1024) {
        done("That file is too big. A screenshot is plenty.");
        return;
      }
      done(null, reader.result as string);
    };

    if (!String(file.type || "").startsWith("image/")) {
      if (file.type === "application/pdf") return asIs();
      done("Send a photo, a screenshot or a PDF.");
      return;
    }

    const img = new Image();
    img.onerror = asIs; // e.g. iPhone HEIC, which we pass straight through
    img.onload = () => {
      try {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        done(null, canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        asIs();
      }
    };
    img.src = reader.result as string;
  };

  reader.readAsDataURL(file);
}

function ProofBox({
  code,
  lead,
  onPaper,
}: {
  code: string;
  lead: string;
  onPaper?: boolean;
}) {
  const inputId = `proof-file-${code.replace(/[^A-Za-z0-9]/g, "")}`;
  const [status, setStatus] = useState<{
    kind: "" | "good" | "bad";
    text: string;
  }>({ kind: "", text: "" });
  const [sentOnce, setSentOnce] = useState(false);

  const send = (file: File) => {
    setStatus({ kind: "", text: "Getting your file ready…" });
    prepareProof(file, async (err, dataUri) => {
      if (err) return setStatus({ kind: "bad", text: err });
      setStatus({ kind: "", text: "Sending…" });
      try {
        const res = await fetch("/api/order/proof", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, dataUri }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          setStatus({
            kind: "bad",
            text: data.error || "That did not send. Try again.",
          });
          return;
        }
        setStatus({ kind: "good", text: data.message || "Got it — thanks!" });
        setSentOnce(true);
      } catch {
        setStatus({ kind: "bad", text: "That did not send. Try again." });
      }
    });
  };

  return (
    <div
      className={`mt-4 rounded-[18px] p-4 text-center ${onPaper ? "bg-paper" : "bg-white"}`}
    >
      <p className="mb-3 text-[14.5px] text-shop-muted">{lead}</p>
      <input
        type="file"
        id={inputId}
        className="peer sr-only"
        accept="image/*,application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // so picking the same file again still fires
          if (file) send(file);
        }}
      />
      <label
        className={`${btnBase} m-0 block bg-aqua text-[#08343a] no-underline shadow-[0_4px_0_#1fa2ae] active:translate-y-[3px] active:shadow-[0_1px_0_#1fa2ae] peer-focus-visible:outline-3 peer-focus-visible:outline-shop-pink peer-focus-visible:outline-offset-2`}
        htmlFor={inputId}
      >
        {sentOnce ? "Send another" : "Choose a screenshot"}
      </label>
      <p
        className={`mt-2.5 min-h-5 text-sm ${
          status.kind === "good"
            ? "font-bold text-[#1b7a46]"
            : status.kind === "bad"
              ? "font-bold text-[#a31346]"
              : "text-shop-muted"
        }`}
      >
        {status.text}
      </p>
    </div>
  );
}

/* ------------------------------------------------ summary ---------- */

function Summary({ rows }: { rows: [string, string | undefined][] }) {
  return (
    <dl className="mb-4">
      {rows
        .filter(([, v]) => !!v)
        .map(([k, v]) => (
          <div key={k} className={summaryRowCls}>
            <dt className="flex-none text-shop-muted">{k}</dt>
            <dd className="m-0 text-right font-medium">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

/* ------------------------------------------------ breakdown sidecar - */

export type BreakdownLine = {
  label: string;
  value: string;
  /** null = no price cell (e.g. free with nothing to say); 0 renders "Free". */
  price: number | null;
};

/** One piece's simple breakdown; title/price are null for order-level lines. */
export type BreakdownGroup = {
  title: string | null;
  price: number | null;
  active: boolean;
  /** Full line-by-line breakdown — rendered only while the piece is active. */
  lines: BreakdownLine[];
  /** One-line description shown while the piece is collapsed. */
  summary?: string;
  /** Which piece to switch to when a collapsed group is clicked. */
  pieceIndex?: number;
};

function BreakdownList({
  lines,
  money,
}: {
  lines: BreakdownLine[];
  money: (n: number) => string;
}) {
  return (
    <ul className="m-0 list-none p-0">
      {lines.map((l, i) => (
        <li
          key={`${l.label}-${l.value}-${i}`}
          className="flex items-baseline justify-between gap-3 border-b border-dashed border-cord/90 py-[7px]"
        >
          <span className="min-w-0">
            <span className="block text-[11px] tracking-[0.05em] text-shop-muted uppercase">
              {l.label}
            </span>
            <span className="block text-sm font-medium break-words">
              {l.value}
            </span>
          </span>
          {l.price !== null && (
            <span
              className={`flex-none text-[13px] tabular-nums ${
                l.price > 0
                  ? "font-bold text-shop-pink"
                  : "font-medium text-shop-muted"
              }`}
            >
              {l.price > 0 ? `+${money(l.price)}` : "Free"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The panel beside the wizard on desktop: a simple breakdown per piece —
    every choice and what it adds — with the piece being edited highlighted.
    Hidden on phones; the tray has the total there. */
function Sidecar({
  groups,
  subtotal,
  total,
  discountLabel,
  discountPercent,
  money,
  preview,
  onSelectPiece,
}: {
  groups: BreakdownGroup[];
  subtotal: number;
  total: number;
  discountLabel: string;
  discountPercent: number;
  money: (n: number) => string;
  preview: React.ReactNode;
  onSelectPiece?: (index: number) => void;
}) {
  const empty = groups.every((g) => g.lines.length === 0 && !g.summary);
  return (
    <aside
      className="hidden lg:sticky lg:top-5 lg:block"
      aria-label="Your order so far"
    >
      <div className="rounded-[18px] bg-white p-[18px] shadow-[0_10px_0_-4px_rgba(197,184,223,.55)]">
        <h2 className="mb-3 font-display text-[19px] font-medium">
          Your order so far
        </h2>
        {preview}
        {empty ? (
          <p className="mb-1 text-[13.5px] text-shop-muted">
            Nothing picked yet — your choices stack up here as you go.
          </p>
        ) : (
          groups.map((g, gi) => {
            if (g.title === null) {
              return <BreakdownList key={`g-${gi}`} lines={g.lines} money={money} />;
            }
            const header = (
              <div className="flex items-baseline justify-between pt-2 pb-0.5">
                <span className="font-display text-[14px] font-medium">
                  {g.title}
                  {g.active && (
                    <span className="ml-1.5 text-[10.5px] font-bold tracking-[0.05em] text-shop-pink uppercase">
                      editing
                    </span>
                  )}
                </span>
                {g.price !== null && (
                  <span className="text-[13px] font-bold text-shop-pink tabular-nums">
                    {money(g.price)}
                  </span>
                )}
              </div>
            );
            // the piece being edited is the only one expanded
            if (g.active) {
              return (
                <div
                  key={`g-${gi}`}
                  className="mt-2.5 rounded-xl border-2 border-shop-pink/60 bg-[#fff8fb] px-2.5 pb-1"
                >
                  {header}
                  {g.lines.length ? (
                    <BreakdownList lines={g.lines} money={money} />
                  ) : (
                    <p className="mt-0.5 mb-1.5 text-[12.5px] text-shop-muted">
                      Not started yet.
                    </p>
                  )}
                </div>
              );
            }
            // everything else collapses to one line; click to switch to it
            return (
              <button
                key={`g-${gi}`}
                type="button"
                className={`mt-2 block w-full cursor-pointer rounded-xl border-2 border-transparent bg-paper/60 px-2.5 pb-2 text-left hover:border-cord ${focusRing}`}
                onClick={() =>
                  g.pieceIndex !== undefined && onSelectPiece?.(g.pieceIndex)
                }
                title="Edit this piece"
              >
                {header}
                <span className="block truncate text-[12.5px] text-shop-muted">
                  {g.summary || "Not started yet."}
                </span>
              </button>
            );
          })
        )}
        <div className="mt-2.5">
          {discountPercent > 0 && subtotal > 0 && (
            <>
              <div className="flex justify-between gap-3 py-0.5 text-[13.5px] text-shop-muted">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-3 py-0.5 text-[13.5px] font-bold text-[#8a6d00]">
                <span>{discountLabel || `${discountPercent}% off`}</span>
                <span>−{money(subtotal - total)}</span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between gap-3 pt-1.5">
            <span>Total</span>
            <strong className="font-display text-[22px] font-semibold">
              {total > 0 ? money(total) : "—"}
            </strong>
          </div>
        </div>
        <p className="mt-2.5 text-center text-xs text-shop-muted">
          Prices update as you pick.
        </p>
      </div>
    </aside>
  );
}

/* ------------------------------------------------ types ------------ */

type View = "start" | "steps" | "review" | "receipt" | "track";

type StepType =
  | "single"
  | "color"
  | "design"
  | "bead"
  | "name"
  | "count"
  | "addons"
  | "details"
  | "payment";

type OrderFields = {
  fulfillment?: string;
  customerName?: string;
  contact?: string;
  notes?: string;
  payment?: string;
};

/** A piece being built, plus the transient yes/no answer of the add-ons step. */
type PieceDraft = PieceSelections & { wantsAddons: boolean | null };

type StepKey = keyof PieceSelections | keyof OrderFields | "pieceCount";

type Step = {
  key: StepKey;
  cat?: Category;
  type: StepType;
  cols?: 2 | 3;
  /** Belongs to one piece (the carousel shows on these steps). */
  perPiece?: boolean;
  /** Only applies to items that carry a beaded name — drops out for earrings etc. */
  needsName?: boolean;
  title: string;
  hint: string;
};

const STEPS: Step[] = [
  { key: "fulfillment", cat: "FULFILLMENT", type: "single", cols: 2,
    title: "Pick up or pre order?", hint: "Pick up means you collect and can pay cash." },
  { key: "pieceCount", type: "count",
    title: "How many pieces?", hint: "Each piece gets its own name, colour and design." },
  { key: "merch", cat: "MERCH", type: "single", cols: 2, perPiece: true,
    title: "What are we making?", hint: "Greyed out items are coming soon." },
  { key: "color", cat: "COLOR", type: "color", cols: 3, perPiece: true,
    title: "Pick your colour", hint: "" /* set per order below */ },
  { key: "beadName", type: "name", perPiece: true, needsName: true,
    title: "Type the name", hint: "Spelling here is exactly how we bead it." },
  { key: "design", cat: "DESIGN", type: "design", cols: 3, perPiece: true,
    title: "Main design", hint: "The charm that sits beside the name." },
  { key: "size", cat: "SIZE", type: "single", cols: 2, perPiece: true, needsName: true,
    title: "Letter size", hint: "Long names sit better in small letters." },
  { key: "bead", cat: "BEAD", type: "bead", cols: 3, perPiece: true, needsName: true,
    title: "Bead style", hint: "The mix used for the rest of the strand." },
  { key: "addons", cat: "ADDON", type: "addons", perPiece: true,
    title: "Any add-ons?", hint: "Skip this if you want it plain." },
  { key: "customerName", type: "details",
    title: "Who is this for?", hint: "So we know who to hand it to." },
  { key: "payment", cat: "PAYMENT", type: "payment",
    title: "How will you pay?", hint: "" },
];

/** Index of the first per-piece step (merch) — same in every flow variant. */
const FIRST_PIECE_STEP = 2;

const MAX_PIECES = 10;

/** A piece as the server echoes it back on the receipt. */
type ReceiptPiece = {
  merch: string;
  color: string;
  beadName: string;
  design: string;
  size: string | null;
  bead: string | null;
  addons: string[];
  plain: boolean;
  subtotal: number;
};

type PlacedOrder = {
  code: string;
  total: number;
  subtotal: number;
  discountLabel: string;
  status: string;
  orderedOn: string;
  pieces: ReceiptPiece[];
};

type TrackResult = {
  code: string;
  merch: string;
  name: string;
  total: number;
  payment: string;
  status: string;
  pieceCount?: number;
  orderedOn: string;
};

const emptyPiece = (): PieceDraft => ({ addons: [], wantsAddons: null });

/* ------------------------------------------------ the wizard ------- */

export default function OrderWizard({
  boot,
  signedIn,
  isAdmin,
}: {
  boot: ShopBootstrap;
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const { settings, options, open } = boot;

  const [view, setView] = useState<View>("start");
  const [stepIndex, setStepIndex] = useState(0);
  const [order, setOrder] = useState<OrderFields>({});
  const [pieceList, setPieceList] = useState<PieceDraft[]>([emptyPiece()]);
  const [active, setActive] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  /** What's typed in the piece-count box while editing; null = showing the
      real count. Committed on blur/Enter so typing "10" never passes through
      "1" and wipes pieces 2+. */
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [copied, setCopied] = useState(false);

  const [trackCode, setTrackCode] = useState("");
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackResult, setTrackResult] = useState<TrackResult | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, stepIndex, active]);

  // keep the active chip visible in the piece carousel's scroll strip
  const chipStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chipStripRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active, view, stepIndex]);

  // which side of the chip strip has more chips hidden off-screen
  const [chipOverflow, setChipOverflow] = useState({ left: false, right: false });
  const chipNudged = useRef(false);
  const updateChipOverflow = useCallback(() => {
    const el = chipStripRef.current;
    const left = !!el && el.scrollLeft > 2;
    const right = !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setChipOverflow((s) => (s.left === left && s.right === right ? s : { left, right }));
  }, []);
  useEffect(() => {
    // measured in a frame callback (never synchronously in the effect body)
    const raf = requestAnimationFrame(() => {
      updateChipOverflow();
      // first time the strip overflows: nudge it so the customer sees it move
      const el = chipStripRef.current;
      if (el && !chipNudged.current && el.scrollWidth > el.clientWidth + 2) {
        chipNudged.current = true;
        setTimeout(() => el.scrollBy({ left: 56, behavior: "smooth" }), 400);
        setTimeout(() => el.scrollBy({ left: -56, behavior: "smooth" }), 1000);
      }
    });
    window.addEventListener("resize", updateChipOverflow);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateChipOverflow);
    };
  }, [pieceList.length, view, stepIndex, updateChipOverflow]);

  const money = (n: number) => formatMoney(settings.currency, n);
  const opts = (cat: Category) => options[cat] ?? [];

  const piece = pieceList[Math.min(active, pieceList.length - 1)];
  const charm = findOpt(options, "DESIGN", piece.design)?.style ?? "";
  const colorHex = piece.color ? colorHexOf(options, piece.color) : null;

  // Items ticked "No beaded name" (earrings, charms) skip three steps.
  const plain = isPlainMerch(options, piece.merch);
  const flow = STEPS.filter((s) => !(s.needsName && plain));
  const step = flow[Math.min(stepIndex, flow.length - 1)];

  /* ---------------- pieces ---------------- */

  function patchPiece(index: number, patch: Partial<PieceDraft>) {
    setPieceList((ps) => ps.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  /** All choices made, add-ons question answered. */
  function pieceReady(p: PieceDraft): boolean {
    if (!p.merch || !p.color || !p.design) return false;
    if (!isPlainMerch(options, p.merch)) {
      if (!p.beadName?.trim() || !p.size || !p.bead) return false;
    }
    return p.wantsAddons === false || (p.wantsAddons === true && p.addons.length > 0);
  }

  /** Where to drop the customer when switching to this piece. */
  function firstIncompleteStep(p: PieceDraft): number {
    const pFlow = STEPS.filter(
      (s) => !(s.needsName && isPlainMerch(options, p.merch)),
    );
    for (let i = FIRST_PIECE_STEP; i < pFlow.length; i++) {
      const s = pFlow[i];
      if (!s.perPiece) break;
      if (s.type === "name" && !p.beadName?.trim()) return i;
      if (s.type === "addons") {
        if (p.wantsAddons === null || (p.wantsAddons && p.addons.length === 0))
          return i;
        continue;
      }
      if (s.type !== "name" && !p[s.key as keyof PieceSelections]) return i;
    }
    return FIRST_PIECE_STEP;
  }

  function switchPiece(index: number) {
    if (index === active || index < 0 || index >= pieceList.length) return;
    const target = pieceList[index];
    setActive(index);
    setStepError(null);
    if (!pieceReady(target)) {
      setStepIndex(firstIncompleteStep(target));
    } else {
      // stay on the same step so flipping between finished pieces compares them
      setStepIndex((i) => Math.min(i, flowOf(target).length - 1));
    }
  }

  function flowOf(p: PieceDraft): Step[] {
    return STEPS.filter((s) => !(s.needsName && isPlainMerch(options, p.merch)));
  }

  function setPieceCount(n: number) {
    const count = Math.max(1, Math.min(MAX_PIECES, n));
    setPieceList((ps) => {
      if (count === ps.length) return ps;
      if (count > ps.length) {
        return [...ps, ...Array.from({ length: count - ps.length }, emptyPiece)];
      }
      return ps.slice(0, count); // lowering the count drops the last pieces
    });
    setActive((a) => Math.min(a, count - 1));
  }

  function removePiece(index: number) {
    if (pieceList.length <= 1) return;
    setPieceList((ps) => ps.filter((_, i) => i !== index));
    setActive((a) => Math.min(a >= index ? Math.max(a - 1, 0) : a, pieceList.length - 2));
  }

  const allReady = pieceList.every(pieceReady);
  const subtotal = orderSubtotalOf(
    options,
    order.fulfillment,
    pieceList,
    settings.pricePerLetter,
  );
  const total = totalOf(subtotal, settings.discountPercent);

  /* ---------------- navigation ---------------- */

  function stepIsComplete(): boolean {
    if (step.type === "count") return true;
    if (step.type === "name") return !!piece.beadName?.trim();
    if (step.type === "addons") {
      return (
        piece.wantsAddons === false ||
        (piece.wantsAddons === true && piece.addons.length > 0)
      );
    }
    if (step.type === "details") {
      return (
        String(order.customerName ?? "").trim().length >= 2 &&
        String(order.contact ?? "").replace(/\D/g, "").length >= 7
      );
    }
    if (step.key === "fulfillment" || step.key === "payment") {
      return !!order[step.key as keyof OrderFields];
    }
    return !!piece[step.key as keyof PieceSelections];
  }

  function nudge(): string {
    if (step.type === "name") return "Type the name first.";
    if (step.type === "details") return "Add your name and a mobile number.";
    if (step.type === "addons") return "Choose yes and pick one, or choose no.";
    return "Pick one to keep going.";
  }

  function next() {
    if (!stepIsComplete()) {
      setStepError(nudge());
      return;
    }
    setStepError(null);

    // Finished this piece's add-ons? Carry the customer to the next piece
    // that still needs work before moving on to the shared steps.
    if (step.type === "addons") {
      for (let d = 1; d < pieceList.length; d++) {
        const i = (active + d) % pieceList.length;
        if (!pieceReady(pieceList[i])) {
          setActive(i);
          setStepIndex(firstIncompleteStep(pieceList[i]));
          return;
        }
      }
    }

    if (stepIndex === flow.length - 1) {
      setSubmitError(null);
      setView("review");
      return;
    }
    setStepIndex(stepIndex + 1);
  }

  function back() {
    setStepError(null);
    if (stepIndex === 0) {
      setView("start");
      return;
    }
    setStepIndex(stepIndex - 1);
  }

  function reset() {
    setOrder({});
    setPieceList([emptyPiece()]);
    setActive(0);
    setCountDraft(null);
    setStepIndex(0);
    setStepError(null);
    setSubmitError(null);
    setPlaced(null);
    setCopied(false);
    setView("start");
  }

  /* ---------------- placing the order ---------------- */

  async function place() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fulfillment: order.fulfillment,
          customerName: order.customerName,
          contact: order.contact,
          notes: order.notes,
          payment: order.payment,
          // strip the transient wantsAddons answer before submitting
          pieces: pieceList.map((p) => ({
            merch: p.merch,
            color: p.color,
            beadName: p.beadName,
            design: p.design,
            size: p.size,
            bead: p.bead,
            addons: p.addons,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSubmitError(data.error || "That did not save. Try again.");
        return;
      }
      setPlaced(data as PlacedOrder);
      setView("receipt");
    } catch {
      setSubmitError("That did not save. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- tracking ---------------- */

  async function track() {
    const code = trackCode.trim();
    if (!code || trackBusy) return;
    setTrackBusy(true);
    setTrackResult(null);
    setTrackError(null);
    try {
      const res = await fetch(
        `/api/order/track?code=${encodeURIComponent(code)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!data.ok) {
        setTrackError(data.error || "Not found.");
        return;
      }
      setTrackResult(data as TrackResult);
    } catch {
      setTrackError("That did not work. Try again in a moment.");
    } finally {
      setTrackBusy(false);
    }
  }

  function copyCode() {
    if (!placed) return;
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(placed.code).then(done, done);
    } else {
      done();
    }
  }

  /* ---------------- step bodies ---------------- */

  function pickOrder(key: keyof OrderFields, value: string) {
    setStepError(null);
    setOrder((o) => {
      const nextOrder = { ...o, [key]: value };
      // Switching away from pick up while cash is chosen clears the payment.
      if (
        key === "fulfillment" &&
        !/pick/i.test(value) &&
        /^cash$/i.test(o.payment ?? "")
      ) {
        nextOrder.payment = "";
      }
      return nextOrder;
    });
  }

  function pickPiece(key: keyof PieceSelections, value: string) {
    setStepError(null);
    const patch: Partial<PieceDraft> = { [key]: value };
    // Switching to an item with no name on it drops anything already chosen
    // for the three steps that are about to disappear.
    if (key === "merch" && findOpt(options, "MERCH", value)?.plain) {
      patch.beadName = "";
      patch.size = undefined;
      patch.bead = undefined;
    }
    patchPiece(active, patch);
  }

  // The step bodies below are rendered via plain function calls (NameStep(),
  // …) rather than as <NameStep/> elements: they are redefined on every
  // render, and a fresh JSX type would remount the subtree and drop input
  // focus mid-typing.

  function renderTile(o: ShopOption) {
    const isOrderStep = step.key === "fulfillment" || step.key === "payment";
    const current = isOrderStep
      ? order[step.key as keyof OrderFields]
      : piece[step.key as keyof PieceSelections];
    return (
      <button
        key={o.value}
        type="button"
        className={step.type !== "single" ? tileCenter : tileBase}
        aria-pressed={current === o.value}
        disabled={!o.active}
        onClick={() =>
          isOrderStep
            ? pickOrder(step.key as keyof OrderFields, o.value)
            : pickPiece(step.key as keyof PieceSelections, o.value)
        }
      >
        {step.type === "color" && (
          <span
            className="relative h-[42px] w-[42px] self-center rounded-full shadow-[inset_-5px_-5px_0_rgba(0,0,0,.15),inset_5px_5px_0_rgba(255,255,255,.45)] after:absolute after:inset-[42%] after:rounded-full after:bg-paper after:content-['']"
            style={{ background: colorHexOf(options, o.value) }}
          />
        )}
        {step.type === "bead" && <BeadRing colors={o.style} />}
        {step.type === "design" && <Charm text={o.style || "·"} size={30} />}
        <span className={tileNameCls}>{o.value}</span>
        {!o.active ? (
          <span className={tileNoteCls}>coming soon</span>
        ) : (
          <>
            {o.note && <span className={tileNoteCls}>{o.note}</span>}
            {o.price > 0 && (
              <span className={tilePriceCls}>+{money(o.price)}</span>
            )}
          </>
        )}
      </button>
    );
  }

  function TileStep() {
    const list = opts(step.cat!);
    if (!list.length) {
      return (
        <p className={errorCls}>
          No choices are set up for this step. Add {step.cat} rows in the shop
          admin.
        </p>
      );
    }
    return (
      <div className={step.cols === 3 ? grid3Cls : gridCls}>
        {list.map(renderTile)}
      </div>
    );
  }

  function CountStep() {
    const n = pieceList.length;
    // the number the steppers work from: whatever is typed, else the real count
    const base = (() => {
      const parsed = parseInt(countDraft ?? "", 10);
      return Number.isFinite(parsed) && parsed >= 1
        ? Math.min(parsed, MAX_PIECES)
        : n;
    })();

    const commit = () => {
      const parsed = parseInt(countDraft ?? "", 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        setPieceCount(parsed);
      }
      setCountDraft(null); // empty or junk just falls back to the real count
    };

    const bump = (delta: number) => {
      setPieceCount(base + delta);
      setCountDraft(null);
    };

    return (
      <div className="rounded-[18px] bg-white px-5 py-6">
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            aria-label="One piece fewer"
            className={`${iconBtn} bg-paper text-2xl disabled:cursor-not-allowed disabled:opacity-40`}
            disabled={base <= 1}
            onClick={() => bump(-1)}
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Number of pieces"
            className="w-24 border-b-2 border-cord bg-transparent text-center font-display text-5xl font-semibold tabular-nums focus:border-aqua focus:outline-none"
            value={countDraft ?? String(n)}
            onFocus={(e) => e.target.select()}
            onChange={(e) =>
              setCountDraft(e.target.value.replace(/\D/g, "").slice(0, 2))
            }
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commit();
                e.currentTarget.blur();
              }
            }}
          />
          <button
            type="button"
            aria-label="One piece more"
            className={`${iconBtn} bg-paper text-2xl disabled:cursor-not-allowed disabled:opacity-40`}
            disabled={base >= MAX_PIECES}
            onClick={() => bump(1)}
          >
            +
          </button>
        </div>
        <p className="mt-3 mb-0 text-center text-[13.5px] text-shop-muted">
          {n === 1
            ? "Just the one — you can add more later on the review screen."
            : `${n} pieces, one order code, one payment.`}
        </p>
        {n > 1 && (
          <p className="mt-1 mb-0 text-center text-xs text-shop-muted">
            Lowering the number removes the last pieces.
          </p>
        )}
      </div>
    );
  }

  function NameStep() {
    const name = piece.beadName ?? "";
    return (
      <>
        <div className={previewCls}>
          {name ? (
            <BeadLine
              text={name}
              color={colorHex}
              charm={charm}
              small={name.length > 8}
            />
          ) : (
            <p className="text-sm text-shop-muted">
              Your name shows up here as you type
            </p>
          )}
        </div>
        <label className={fieldCls}>
          <span className={fieldLabelCls}>Name on the piece</span>
          <input
            type="text"
            className={inputCls}
            maxLength={settings.maxNameLength}
            value={name}
            placeholder="e.g. Skye"
            autoComplete="off"
            autoFocus
            onChange={(e) => {
              setStepError(null);
              patchPiece(active, { beadName: cleanName(e.target.value) });
            }}
          />
        </label>
        <p className="mx-0.5 mt-1.5 text-right text-[12.5px] text-shop-muted">
          {name.trim().length} / {settings.maxNameLength} characters
        </p>
      </>
    );
  }

  function AddonStep() {
    return (
      <>
        <div className={gridCls}>
          {([["Yes", true], ["No", false]] as const).map(([label, yes]) => (
            <button
              key={label}
              type="button"
              className={tileCenter}
              aria-pressed={piece.wantsAddons === yes}
              onClick={() => {
                setStepError(null);
                patchPiece(active, {
                  wantsAddons: yes,
                  ...(yes ? {} : { addons: [] }),
                });
              }}
            >
              <span className={tileNameCls}>{label}</span>
            </button>
          ))}
        </div>
        {piece.wantsAddons === true && (
          <div className={`${gridCls} mt-3`}>
            {opts("ADDON").map((o) => {
              const picked = piece.addons.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  className={tileBase}
                  aria-pressed={picked}
                  disabled={!o.active}
                  onClick={() => {
                    setStepError(null);
                    patchPiece(active, {
                      addons: picked
                        ? piece.addons.filter((a) => a !== o.value)
                        : [...piece.addons, o.value],
                    });
                  }}
                >
                  <span className={tileNameCls}>{o.value}</span>
                  {o.note && <span className={tileNoteCls}>{o.note}</span>}
                  {o.price > 0 && (
                    <span className={tilePriceCls}>+{money(o.price)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  }

  function DetailsStep() {
    return (
      <>
        <label className={fieldCls}>
          <span className={fieldLabelCls}>Your name</span>
          <input
            type="text"
            className={inputCls}
            value={order.customerName ?? ""}
            placeholder="Who we hand it to"
            onChange={(e) => {
              setStepError(null);
              setOrder((o) => ({ ...o, customerName: e.target.value }));
            }}
          />
        </label>
        <label className={fieldCls}>
          <span className={fieldLabelCls}>Mobile number</span>
          <input
            type="tel"
            className={inputCls}
            value={order.contact ?? ""}
            placeholder="09XX XXX XXXX"
            onChange={(e) => {
              setStepError(null);
              setOrder((o) => ({ ...o, contact: e.target.value }));
            }}
          />
        </label>
        <label className={fieldCls}>
          <span className={fieldLabelCls}>
            Anything else we should know? (optional)
          </span>
          <textarea
            className={`${inputCls} min-h-[78px] resize-y`}
            value={order.notes ?? ""}
            placeholder="Colour of the letters, meet-up time, gift note…"
            onChange={(e) => setOrder((o) => ({ ...o, notes: e.target.value }))}
          />
        </label>
      </>
    );
  }

  function PaymentStep() {
    const pickup = /pick/i.test(order.fulfillment ?? "");
    const paymentOpt = findOpt(options, "PAYMENT", order.payment);
    return (
      <>
        <div className={gridCls}>
          {opts("PAYMENT").map((o) => {
            const cashOnly = /cash/i.test(o.value) && !/gcash/i.test(o.value);
            const blocked = cashOnly && !pickup;
            return (
              <button
                key={o.value}
                type="button"
                className={tileBase}
                aria-pressed={order.payment === o.value}
                disabled={!o.active || blocked}
                onClick={() => pickOrder("payment", o.value)}
              >
                <span className={tileNameCls}>{o.value}</span>
                <span className={tileNoteCls}>
                  {blocked ? "Pick up orders only" : o.note}
                </span>
              </button>
            );
          })}
        </div>
        {/gcash/i.test(order.payment ?? "") && settings.gcashNumber && (
          <p className={`${receiptPayCls} mt-3.5`}>
            Send {money(total)} to {settings.gcashNumber}
            {settings.gcashName ? ` (${settings.gcashName})` : ""} after you
            place the order, then send us the screenshot with your order code.
          </p>
        )}
        {order.payment && (
          <QrBox
            option={paymentOpt}
            lead={`Scan this to pay ${money(total)}.`}
            amount={total}
            qrDynamic={settings.qrDynamic}
          />
        )}
      </>
    );
  }

  /* ---------------- piece carousel ---------------- */

  function PieceCarousel() {
    if (pieceList.length <= 1 || !step.perPiece) return null;
    return (
      <div className="mb-4 flex items-center gap-2">
        {/* arrows are desktop-only; on phones the strip swipes */}
        <button
          type="button"
          aria-label="Previous piece"
          className={`${iconBtn} hidden h-8 w-8 text-sm disabled:cursor-not-allowed disabled:opacity-40 md:block`}
          disabled={active === 0}
          onClick={() => switchPiece(active - 1)}
        >
          ‹
        </button>
        <div className="relative min-w-0 flex-1">
          {/* inner w-max track: centers while it fits, scrolls from the start
              once it overflows — a centered flex container would clip the left
              chips beyond reach */}
          <div
            ref={chipStripRef}
            className="overflow-x-auto py-0.5"
            onScroll={updateChipOverflow}
          >
            <div className="mx-auto flex w-max items-center gap-1.5 px-0.5">
            {pieceList.map((p, i) => {
              const ready = pieceReady(p);
              const isActive = i === active;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Piece ${i + 1}${ready ? ", finished" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`shrink-0 cursor-pointer rounded-full border-2 px-3 py-1 text-[12.5px] font-bold ${focusRing} ${
                    isActive
                      ? "border-shop-pink bg-shop-pink text-white"
                      : ready
                        ? "border-aqua bg-white text-[#0e6d76]"
                        : "border-cord bg-white text-shop-muted"
                  }`}
                  onClick={() => switchPiece(i)}
                >
                  {i + 1}
                  {ready && !isActive ? " ✓" : ""}
                </button>
              );
            })}
            </div>
          </div>
          {/* swipe affordance: a pink chevron floats over whichever edge has
              chips hidden past it; tapping pages the strip along */}
          {chipOverflow.left && (
            <button
              type="button"
              aria-label="Earlier pieces"
              className="absolute inset-y-0 left-0 z-10 flex w-8 cursor-pointer items-center justify-start bg-gradient-to-r from-paper via-paper/80 to-transparent md:hidden"
              onClick={() =>
                chipStripRef.current?.scrollBy({
                  left: -chipStripRef.current.clientWidth * 0.6,
                  behavior: "smooth",
                })
              }
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-shop-pink text-[11px] font-bold text-white shadow">
                ‹
              </span>
            </button>
          )}
          {chipOverflow.right && (
            <button
              type="button"
              aria-label="More pieces"
              className="absolute inset-y-0 right-0 z-10 flex w-8 cursor-pointer items-center justify-end bg-gradient-to-l from-paper via-paper/80 to-transparent md:hidden"
              onClick={() =>
                chipStripRef.current?.scrollBy({
                  left: chipStripRef.current.clientWidth * 0.6,
                  behavior: "smooth",
                })
              }
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-shop-pink text-[11px] font-bold text-white shadow">
                ›
              </span>
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Next piece"
          className={`${iconBtn} hidden h-8 w-8 text-sm disabled:cursor-not-allowed disabled:opacity-40 md:block`}
          disabled={active === pieceList.length - 1}
          onClick={() => switchPiece(active + 1)}
        >
          ›
        </button>
      </div>
    );
  }

  /* ---------------- breakdown sidecar data ---------------- */

  const groups: BreakdownGroup[] = [];
  {
    // order-level lines first, headerless
    const orderLines: BreakdownLine[] = [];
    if (order.fulfillment) {
      orderLines.push({
        label: "Collection",
        value: order.fulfillment,
        price: priceOf(options, "FULFILLMENT", order.fulfillment),
      });
    }
    groups.push({ title: null, price: null, active: false, lines: orderLines });

    // then a breakdown per piece — itemized for the active one, a one-line
    // summary for the rest so a five-piece order stays scannable
    pieceList.forEach((p, i) => {
      const pPlain = isPlainMerch(options, p.merch);
      const expanded = pieceList.length === 1 || i === active;
      const lines: BreakdownLine[] = [];
      if (expanded) {
        const push = (label: string, cat: Category, value?: string) => {
          if (value)
            lines.push({ label, value, price: priceOf(options, cat, value) });
        };
        push("Item", "MERCH", p.merch);
        push("Colour", "COLOR", p.color);
        if (!pPlain && p.beadName?.trim()) {
          const letters = p.beadName.replace(/\s/g, "").length;
          lines.push({
            label: "Name",
            value: `“${p.beadName.trim()}” · ${letters} letter${letters === 1 ? "" : "s"}`,
            price:
              settings.pricePerLetter > 0
                ? letters * settings.pricePerLetter
                : null,
          });
        }
        push("Design", "DESIGN", p.design);
        if (!pPlain) {
          push("Letters", "SIZE", p.size);
          push("Beads", "BEAD", p.bead);
        }
        for (const a of p.addons) push("Add-on", "ADDON", a);
      }

      groups.push({
        // a lone piece needs no header box — it reads like the classic list
        title: pieceList.length > 1 ? `Piece ${i + 1}` : null,
        price:
          pieceList.length > 1 && p.merch
            ? pieceSubtotalOf(options, p, settings.pricePerLetter)
            : null,
        active: pieceList.length > 1 && i === active,
        lines,
        summary: dotted(
          p.merch,
          p.beadName?.trim() && `“${p.beadName.trim()}”`,
          p.color,
          p.size,
          p.bead,
          p.addons.length ? `+ ${p.addons.join(", ")}` : undefined,
        ),
        pieceIndex: i,
      });
    });
  }

  const sidecarPreview =
    piece.color || piece.beadName || piece.design ? (
      <div className={`${previewCls} mb-3 min-h-[58px] bg-paper`}>
        {plain || !piece.beadName ? (
          <PlainStrand color={colorHex} charm={charm} />
        ) : (
          <BeadLine text={piece.beadName} color={colorHex} charm={charm} small />
        )}
      </div>
    ) : null;

  const sidecar = (
    <Sidecar
      groups={groups}
      subtotal={subtotal}
      total={total}
      discountLabel={settings.discountLabel}
      discountPercent={settings.discountPercent}
      money={money}
      preview={sidecarPreview}
      onSelectPiece={switchPiece}
    />
  );

  /* ---------------- views ---------------- */

  const startLinks = (
    <p className="mt-[18px] flex justify-center gap-[18px] text-[13.5px] [&_a]:text-shop-muted [&_a]:underline">
      {signedIn ? (
        <>
          <Link href="/my-orders">My orders</Link>
          <Link href="/profile">Profile</Link>
        </>
      ) : (
        <Link href="/sign-in">Sign in</Link>
      )}
      {isAdmin && <Link href="/admin">Shop admin</Link>}
    </p>
  );

  if (view === "start") {
    return (
      <div className={shellCls}>
        <section className={viewCls}>
          <header className="pt-[34px] pb-5 text-center">
            <BeadLine text={settings.businessName || "BEADOOF"} fit />
            {settings.tagline && (
              <p className="mt-1 text-[15px] text-shop-muted">
                {settings.tagline}
              </p>
            )}
          </header>
          <div className="rounded-[18px] bg-white px-5 py-[22px] shadow-[0_10px_0_-4px_rgba(197,184,223,.55)]">
            <p className="mb-[18px] text-base">
              Build your piece one choice at a time. At the end you get an
              order code — send it with your payment and we&apos;ll start
              making it.
            </p>
            <button
              className={btnPrimary}
              disabled={!open}
              onClick={() => {
                setStepIndex(0);
                setView("steps");
              }}
            >
              Start an order
            </button>
            <button
              className={btnQuiet}
              onClick={() => {
                setTrackResult(null);
                setTrackError(null);
                setView("track");
              }}
            >
              Check an order code
            </button>
          </div>
          {!open && (
            <p className="mt-[18px] rounded-[14px] bg-lemon px-4 py-3.5 font-bold">
              {settings.closedMessage}
            </p>
          )}
          {startLinks}
        </section>
      </div>
    );
  }

  if (view === "track") {
    const paid =
      trackResult &&
      /paid/i.test(trackResult.status) &&
      !/unpaid/i.test(trackResult.status);
    return (
      <div className={shellCls}>
        <section className={viewCls}>
          <div className={topbarCls}>
            <button
              className={iconBtn}
              aria-label="Go back"
              onClick={() => setView("start")}
            >
              ←
            </button>
            <h2 className={viewTitleCls}>Check an order</h2>
          </div>
          <label className={fieldCls}>
            <span className={fieldLabelCls}>Order code</span>
            <input
              type="text"
              className={inputCls}
              value={trackCode}
              placeholder="BDF-0918-001"
              autoComplete="off"
              onChange={(e) => setTrackCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") track();
              }}
            />
          </label>
          <button className={btnPrimary} onClick={track} disabled={trackBusy}>
            {trackBusy ? "Looking…" : "Find my order"}
          </button>
          {(trackResult || trackError) && (
            <div className="mt-4 rounded-[18px] bg-white px-[18px] py-4">
              {trackError && <p className={errorCls}>{trackError}</p>}
              {trackResult && (
                <>
                  <span
                    className={`inline-block rounded-full px-3 py-[3px] text-[13px] font-bold ${
                      paid ? "bg-[#bff0d2]" : "bg-lemon"
                    }`}
                  >
                    {trackResult.status}
                  </span>
                  <Summary
                    rows={[
                      ["Code", trackResult.code],
                      [
                        "Item",
                        (trackResult.pieceCount ?? 1) > 1
                          ? `${trackResult.merch} +${(trackResult.pieceCount ?? 1) - 1} more`
                          : trackResult.merch,
                      ],
                      ["Name", trackResult.name],
                      ["Total", money(trackResult.total)],
                      ["Ordered", trackResult.orderedOn],
                    ]}
                  />
                  {/* still unpaid? show the same code they would have had on their receipt */}
                  {!paid && trackResult.payment && (
                    <QrBox
                      option={findOpt(options, "PAYMENT", trackResult.payment)}
                      lead={`Scan to pay ${money(trackResult.total)}`}
                      amount={trackResult.total}
                      qrDynamic={settings.qrDynamic}
                      onPaper
                    />
                  )}
                  <ProofBox
                    code={trackResult.code}
                    lead="Need to send your proof of payment?"
                    onPaper
                  />
                </>
              )}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (view === "review") {
    return (
      <div className={shellCls}>
        <section className={viewCls}>
          <div className={topbarCls}>
            <button
              className={iconBtn}
              aria-label="Go back"
              onClick={() => setView("steps")}
            >
              ←
            </button>
            <h2 className={viewTitleCls}>Check your order</h2>
          </div>

          {pieceList.map((p, i) => {
            const pPlain = isPlainMerch(options, p.merch);
            const pCharm = findOpt(options, "DESIGN", p.design)?.style ?? "";
            const pHex = p.color ? colorHexOf(options, p.color) : null;
            const price = pieceSubtotalOf(options, p, settings.pricePerLetter);
            return (
              <div
                key={`piece-${i}`}
                className="mb-3 rounded-[18px] bg-white p-3.5"
              >
                {pieceList.length > 1 && (
                  <div className="flex items-baseline justify-between px-0.5 pb-1">
                    <span className="font-display text-[15px] font-medium">
                      Piece {i + 1}
                    </span>
                    <span className="text-[13px] font-bold text-shop-pink">
                      {money(price)}
                    </span>
                  </div>
                )}
                <div className="grid place-items-center rounded-[14px] bg-paper px-2 py-1.5">
                  {pPlain || !p.beadName ? (
                    <PlainStrand color={pHex} charm={pCharm} />
                  ) : (
                    <BeadLine
                      text={p.beadName}
                      color={pHex}
                      charm={pCharm}
                      small
                    />
                  )}
                </div>
                <p className="mt-2 mb-0 px-0.5 text-center text-[13.5px] text-shop-muted">
                  {dotted(
                    p.merch,
                    p.beadName?.trim() && `“${p.beadName.trim()}”`,
                    p.color,
                    p.size,
                    p.bead,
                    p.addons.length ? `+ ${p.addons.join(", ")}` : undefined,
                  )}
                </p>
                {pieceList.length > 1 && (
                  <button
                    className="mx-auto mt-1 block cursor-pointer border-none bg-transparent text-[12.5px] text-[#a31346] underline"
                    onClick={() => removePiece(i)}
                  >
                    Remove this piece
                  </button>
                )}
              </div>
            );
          })}

          {pieceList.length < MAX_PIECES && (
            <button
              className={`${btnQuiet} mt-0 mb-3`}
              onClick={() => {
                setPieceList((ps) => [...ps, emptyPiece()]);
                setActive(pieceList.length);
                setStepIndex(FIRST_PIECE_STEP);
                setStepError(null);
                setView("steps");
              }}
            >
              + Add another piece to this order
            </button>
          )}

          <Summary
            rows={[
              ["For", order.customerName],
              ["Mobile", order.contact],
              ["Collection", order.fulfillment],
              ["Payment", order.payment],
              ["Note", order.notes],
            ]}
          />
          <div className="mb-4 rounded-[18px] bg-white px-4 py-3.5">
            {settings.discountPercent > 0 && subtotal > 0 && (
              <div className="mb-2.5 inline-block rounded-[10px] bg-lemon px-2.5 py-1.5 text-[13.5px] font-bold">
                {settings.discountLabel} — was {money(subtotal)}
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span>
                Total
                {pieceList.length > 1 ? ` · ${pieceList.length} pieces` : ""}
              </span>
              <strong className="font-display text-[25px] font-semibold">
                {money(total)}
              </strong>
            </div>
          </div>
          {submitError && <p className={errorCls}>{submitError}</p>}
          <button
            className={btnPrimary}
            onClick={place}
            disabled={submitting || !allReady}
          >
            {submitting ? "Placing your order…" : "Place order"}
          </button>
          <p className="mt-3 text-center text-[13.5px] text-shop-muted">
            {/pick/i.test(order.fulfillment ?? "")
              ? settings.pickupNote
              : settings.preorderNote}
          </p>
        </section>
      </div>
    );
  }

  if (view === "receipt" && placed) {
    const cashOnPickup =
      /cash/i.test(order.payment ?? "") && !/gcash/i.test(order.payment ?? "");
    const many = placed.pieces.length > 1;
    return (
      <div className={shellCls}>
        <section className={viewCls}>
          <div className="mt-3 rounded-t-[18px] bg-white px-5 pt-6 pb-[18px] text-center">
            <p className="m-0 text-sm text-shop-muted">Order placed</p>
            <BeadLine text={placed.code.split("-").slice(-1)[0]} small />
            <p className="mt-0.5 mb-[18px] font-display text-2xl font-semibold tracking-[0.04em]">
              {placed.code}
            </p>
            {placed.pieces.map((p, i) => (
              <div key={`rp-${i}`} className="text-left">
                {many && (
                  <p className="mt-2 mb-0 font-display text-[15px] font-medium">
                    Piece {i + 1} ·{" "}
                    <span className="text-shop-pink">{money(p.subtotal)}</span>
                  </p>
                )}
                <Summary
                  rows={[
                    ["Item", dotted(p.merch, p.size ?? undefined)],
                    ["Name", p.beadName],
                    ["Colour", dotted(p.color, p.bead ?? undefined)],
                    ["Design", p.design],
                    ["Add-ons", p.addons.join(", ")],
                  ]}
                />
              </div>
            ))}
            <div className="text-left">
              <Summary
                rows={[
                  ["For", order.customerName],
                  ["Collection", order.fulfillment],
                  ["Payment", `${order.payment} · ${placed.status}`],
                  ["Ordered", placed.orderedOn],
                ]}
              />
            </div>
            <div className="flex items-baseline justify-between">
              <span>Total</span>
              <strong className="font-display text-[25px] font-semibold">
                {money(placed.total)}
              </strong>
            </div>
            <p className={receiptPayCls}>
              {/gcash/i.test(order.payment ?? "")
                ? `Send ${money(placed.total)} to ${settings.gcashNumber}` +
                  (settings.gcashName ? ` (${settings.gcashName})` : "") +
                  `, then message us the screenshot and this code. ${settings.preorderNote}`
                : `Bring ${money(placed.total)} when you collect. ${settings.pickupNote}`}
            </p>
            <QrBox
              option={findOpt(options, "PAYMENT", order.payment)}
              lead={`Scan to pay ${money(placed.total)}`}
              amount={placed.total}
              qrDynamic={settings.qrDynamic}
              onPaper
            />
            {!cashOnPickup && (
              <ProofBox
                code={placed.code}
                lead="Once you have paid, send us the screenshot and we will start making it."
                onPaper
              />
            )}
          </div>
          <div
            aria-hidden
            className="mb-5 h-3 bg-[radial-gradient(circle_at_6px_0,transparent_6px,#ffffff_6.5px)] bg-[length:12px_12px] bg-repeat-x"
          />
          <button className={btnPrimary} onClick={copyCode}>
            {copied ? "Copied" : "Copy order code"}
          </button>
          <button className={btnQuiet} onClick={reset}>
            Order another one
          </button>
        </section>
      </div>
    );
  }

  /* ---------------- the step wizard ---------------- */

  return (
    <div className={duoCls}>
      <section
        className={`${viewCls} flex min-h-[calc(100vh-48px)] flex-col`}
        id="view-steps"
      >
        <div className={topbarCls}>
          <button className={iconBtn} aria-label="Go back" onClick={back}>
            ←
          </button>
          <div
            className="relative flex flex-1 items-center gap-1 before:absolute before:inset-x-0 before:top-1/2 before:h-0.5 before:bg-cord before:content-['']"
            role="progressbar"
            aria-valuemin={1}
            aria-valuenow={stepIndex + 1}
            aria-valuemax={flow.length}
          >
            {flow.map((_, i) => (
              <i
                key={i}
                className={`relative h-2.5 w-2.5 max-w-3 flex-auto rounded-full border-2 ${
                  i < stepIndex
                    ? "border-aqua bg-aqua"
                    : i === stepIndex
                      ? "scale-135 border-shop-pink bg-shop-pink"
                      : "border-cord bg-white"
                }`}
              />
            ))}
          </div>
          <span className="text-[13px] text-shop-muted tabular-nums">
            {stepIndex + 1} / {flow.length}
          </span>
        </div>

        {PieceCarousel()}

        <div className="flex-[1_0_auto]">
          <h1 className={stepTitleCls}>
            {step.title}
            {step.perPiece && pieceList.length > 1 && (
              <span className="ml-2 align-middle text-[15px] font-normal text-shop-muted">
                piece {active + 1} of {pieceList.length}
              </span>
            )}
          </h1>
          {(() => {
            const hint =
              step.type === "color"
                ? plain
                  ? "This is the colour of the beads."
                  : "This is the colour of the beads around the name."
                : step.hint;
            return hint ? <p className={stepHintCls}>{hint}</p> : null;
          })()}
          {stepError && <p className={errorCls}>{stepError}</p>}
          {step.type === "count"
            ? CountStep()
            : step.type === "name"
              ? NameStep()
              : step.type === "addons"
                ? AddonStep()
                : step.type === "details"
                  ? DetailsStep()
                  : step.type === "payment"
                    ? PaymentStep()
                    : TileStep()}
        </div>

        <div className="sticky bottom-0 z-[5] -mx-[18px] mt-[22px] border-t border-cord/80 bg-paper px-[18px] pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-2 flex max-w-[424px] items-baseline justify-between">
            <span className="text-[13.5px] text-shop-muted">
              {dotted(
                pieceList.length > 1 ? `${pieceList.length} pieces` : undefined,
                settings.discountPercent > 0 && total > 0
                  ? `${settings.discountLabel} applied`
                  : "Running total",
              )}
            </span>
            <strong className="font-display text-[21px] font-semibold">
              {total > 0 ? money(total) : "—"}
            </strong>
          </div>
          <button
            className={`${btnPrimary} mx-auto block max-w-[424px]`}
            onClick={next}
          >
            {stepIndex === flow.length - 1 ? "Review order" : "Next"}
          </button>
        </div>
      </section>
      {sidecar}
    </div>
  );
}
