"use client";

// The guided order wizard — a React port of the Apps Script BEADOOF form.
// Views: start → steps (10-step wizard) → review → receipt, plus "check an
// order" tracking. Options, prices and settings come from Supabase via the
// server page; the API re-validates and re-prices everything on submit.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  cleanName,
  colorHexOf,
  dotted,
  findOpt,
  formatMoney,
  isPlainMerch,
  priceOf,
  qrPayload,
  subtotalOf,
  totalOf,
  type Category,
  type ShopBootstrap,
  type ShopOption,
  type WizardSelections,
} from "@/lib/shop";

declare global {
  interface Window {
    QRious?: new (opts: Record<string, unknown>) => unknown;
  }
}

type View = "start" | "steps" | "review" | "receipt" | "track";

type StepType =
  | "single"
  | "color"
  | "design"
  | "bead"
  | "name"
  | "addons"
  | "details"
  | "payment";

type Step = {
  key: keyof WizardSelections | "addons";
  cat?: Category;
  type: StepType;
  cols?: 2 | 3;
  /** Only applies to items that carry a beaded name — drops out for earrings etc. */
  needsName?: boolean;
  title: string;
  hint: string;
};

const STEPS: Step[] = [
  { key: "fulfillment", cat: "FULFILLMENT", type: "single", cols: 2,
    title: "Pick up or pre order?", hint: "Pick up means you collect and can pay cash." },
  { key: "merch", cat: "MERCH", type: "single", cols: 2,
    title: "What are we making?", hint: "Greyed out items are coming soon." },
  { key: "color", cat: "COLOR", type: "color", cols: 3,
    title: "Pick your colour", hint: "" /* set per order below */ },
  { key: "beadName", type: "name", needsName: true,
    title: "Type the name", hint: "Spelling here is exactly how we bead it." },
  { key: "design", cat: "DESIGN", type: "design", cols: 3,
    title: "Main design", hint: "The charm that sits beside the name." },
  { key: "size", cat: "SIZE", type: "single", cols: 2, needsName: true,
    title: "Letter size", hint: "Long names sit better in small letters." },
  { key: "bead", cat: "BEAD", type: "bead", cols: 3, needsName: true,
    title: "Bead style", hint: "The mix used for the rest of the strand." },
  { key: "addons", cat: "ADDON", type: "addons",
    title: "Any add-ons?", hint: "Skip this if you want it plain." },
  { key: "customerName", type: "details",
    title: "Who is this for?", hint: "So we know who to hand it to." },
  { key: "payment", cat: "PAYMENT", type: "payment",
    title: "How will you pay?", hint: "" },
];

type PlacedOrder = {
  code: string;
  total: number;
  subtotal: number;
  discountLabel: string;
  status: string;
  orderedOn: string;
};

type TrackResult = {
  code: string;
  merch: string;
  name: string;
  total: number;
  payment: string;
  status: string;
  orderedOn: string;
};

/* ------------------------------------------------ bead preview ----- */

function RoundBead({ hex }: { hex: string }) {
  return <span className="roundbead" style={{ background: hex }} />;
}

function BeadLine({
  text,
  color,
  charm,
  small,
}: {
  text: string;
  color?: string | null;
  charm?: string;
  small?: boolean;
}) {
  return (
    <div className={`beadline${small ? " beadline-sm" : ""}`}>
      {color && <RoundBead hex={color} />}
      {String(text ?? "")
        .split("")
        .map((ch, i) => {
          if (ch === " ") return <span key={i} className="letterbead gap" />;
          if (ch === "-") return <RoundBead key={i} hex={color || "#C5B8DF"} />;
          return (
            <span
              key={i}
              className="letterbead"
              style={{ transform: `rotate(${((i * 37) % 7) - 3}deg)` }}
            >
              {ch.toUpperCase()}
            </span>
          );
        })}
      {color && <RoundBead hex={color} />}
      {charm && <span className="charmbead">{charm}</span>}
    </div>
  );
}

/** A short strand with the charm in the middle, for items with no name on them. */
function PlainStrand({ color, charm }: { color?: string | null; charm?: string }) {
  const side = Array.from({ length: 4 }, (_, i) => (
    <RoundBead key={i} hex={color || "#C5B8DF"} />
  ));
  return (
    <div className="beadline">
      {side}
      {charm && <span className="charmbead">{charm}</span>}
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
      if (canvasRef.current) canvasRef.current.hidden = !drawn;
      if (fallbackRef.current) fallbackRef.current.hidden = drawn;
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
      <canvas ref={canvasRef} className="qr-img" hidden />
      <p ref={fallbackRef} className="qr-fallback" hidden>
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
}: {
  option: ShopOption | null;
  lead: string;
  /** The order total — put inside a text QR when the shop setting allows it. */
  amount?: number | null;
  qrDynamic: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const qr = option?.qr?.trim();
  if (!qr) return null;

  const isImage = looksLikeImage(qr);
  const built = isImage
    ? { text: qr, carriesAmount: false }
    : qrPayload(qr, amount, qrDynamic);

  return (
    <div className="qrbox">
      {lead && <p className="qr-lead">{lead}</p>}
      <div className="qr-slot">
        {isImage ? (
          broken ? (
            <p className="qr-note">That QR image could not load.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- external QR image with unknown host/size
            <img
              className="qr-img"
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
        <p className="qr-note">
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

function ProofBox({ code, lead }: { code: string; lead: string }) {
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
    <div className="proofbox">
      <p className="proof-lead">{lead}</p>
      <input
        type="file"
        id={inputId}
        className="proof-input"
        accept="image/*,application/pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // so picking the same file again still fires
          if (file) send(file);
        }}
      />
      <label className="btn btn-quiet proof-btn" htmlFor={inputId}>
        {sentOnce ? "Send another" : "Choose a screenshot"}
      </label>
      <p className={`proof-status${status.kind ? ` ${status.kind}` : ""}`}>
        {status.text}
      </p>
    </div>
  );
}

/* ------------------------------------------------ breakdown sidecar - */

export type BreakdownLine = {
  label: string;
  value: string;
  /** null = no price cell (e.g. free with nothing to say); 0 renders "Free". */
  price: number | null;
};

/** The itemized panel beside the wizard on desktop: every choice so far and
    what it adds to the price. Hidden on phones — the tray has the total. */
function Sidecar({
  lines,
  subtotal,
  total,
  discountLabel,
  discountPercent,
  money,
  preview,
}: {
  lines: BreakdownLine[];
  subtotal: number;
  total: number;
  discountLabel: string;
  discountPercent: number;
  money: (n: number) => string;
  preview: React.ReactNode;
}) {
  return (
    <aside className="sidecar" aria-label="Your order so far">
      <div className="sidecar-card">
        <h2 className="sidecar-title">Your piece so far</h2>
        {preview}
        {lines.length === 0 ? (
          <p className="sidecar-empty">
            Nothing picked yet — your choices stack up here as you go.
          </p>
        ) : (
          <ul className="breakdown">
            {lines.map((l, i) => (
              <li key={`${l.label}-${l.value}-${i}`}>
                <span className="bd-what">
                  <span className="bd-label">{l.label}</span>
                  <span className="bd-value">{l.value}</span>
                </span>
                {l.price !== null && (
                  <span className={`bd-price${l.price > 0 ? "" : " free"}`}>
                    {l.price > 0 ? `+${money(l.price)}` : "Free"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="sidecar-totals">
          {discountPercent > 0 && subtotal > 0 && (
            <>
              <div className="bd-subtotal">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="bd-discount">
                <span>{discountLabel || `${discountPercent}% off`}</span>
                <span>−{money(subtotal - total)}</span>
              </div>
            </>
          )}
          <div className="bd-total">
            <span>Total</span>
            <strong>{total > 0 ? money(total) : "—"}</strong>
          </div>
        </div>
        <p className="sidecar-note">Prices update as you pick.</p>
      </div>
    </aside>
  );
}

/* ------------------------------------------------ summary ---------- */

function Summary({ rows }: { rows: [string, string | undefined][] }) {
  return (
    <dl className="summary">
      {rows
        .filter(([, v]) => !!v)
        .map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  );
}

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
  const [sel, setSel] = useState<WizardSelections>({ addons: [] });
  const [wantsAddons, setWantsAddons] = useState<boolean | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
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
  }, [view, stepIndex]);

  const money = (n: number) => formatMoney(settings.currency, n);
  const opts = (cat: Category) => options[cat] ?? [];
  const subtotal = subtotalOf(options, sel, settings.pricePerLetter);
  const total = totalOf(subtotal, settings.discountPercent);
  const charm = findOpt(options, "DESIGN", sel.design)?.style ?? "";
  const colorHex = sel.color ? colorHexOf(options, sel.color) : null;

  // Items ticked "No beaded name" (earrings, charms) skip three steps.
  const plain = isPlainMerch(options, sel.merch);
  const flow = STEPS.filter((s) => !(s.needsName && plain));
  const step = flow[Math.min(stepIndex, flow.length - 1)];

  // Itemized lines for the desktop breakdown panel.
  const breakdown: BreakdownLine[] = [];
  {
    const push = (label: string, cat: Category, value?: string) => {
      if (value) breakdown.push({ label, value, price: priceOf(options, cat, value) });
    };
    push("Collection", "FULFILLMENT", sel.fulfillment);
    push("Item", "MERCH", sel.merch);
    push("Colour", "COLOR", sel.color);
    if (!plain && sel.beadName?.trim()) {
      const letters = sel.beadName.replace(/\s/g, "").length;
      breakdown.push({
        label: "Name",
        value: `“${sel.beadName.trim()}” · ${letters} letter${letters === 1 ? "" : "s"}`,
        price: settings.pricePerLetter > 0 ? letters * settings.pricePerLetter : null,
      });
    }
    push("Design", "DESIGN", sel.design);
    if (!plain) {
      push("Letters", "SIZE", sel.size);
      push("Beads", "BEAD", sel.bead);
    }
    for (const a of sel.addons) push("Add-on", "ADDON", a);
  }

  const sidecarPreview =
    sel.color || sel.beadName || sel.design ? (
      <div className="preview">
        {plain ? (
          <PlainStrand color={colorHex} charm={charm} />
        ) : sel.beadName ? (
          <BeadLine text={sel.beadName} color={colorHex} charm={charm} small />
        ) : (
          <PlainStrand color={colorHex} charm={charm} />
        )}
      </div>
    ) : null;

  const sidecar = (
    <Sidecar
      lines={breakdown}
      subtotal={subtotal}
      total={total}
      discountLabel={settings.discountLabel}
      discountPercent={settings.discountPercent}
      money={money}
      preview={sidecarPreview}
    />
  );

  /* ---------------- navigation ---------------- */

  function stepIsComplete(): boolean {
    if (step.type === "name") return !!sel.beadName?.trim();
    if (step.type === "addons") {
      return (
        wantsAddons === false || (wantsAddons === true && sel.addons.length > 0)
      );
    }
    if (step.type === "details") {
      return (
        String(sel.customerName ?? "").trim().length >= 2 &&
        String(sel.contact ?? "").replace(/\D/g, "").length >= 7
      );
    }
    return !!sel[step.key as keyof WizardSelections];
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
    setSel({ addons: [] });
    setWantsAddons(null);
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
        body: JSON.stringify(sel),
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

  function pick(key: keyof WizardSelections, value: string) {
    setStepError(null);
    setSel((s) => {
      const nextSel = { ...s, [key]: value };
      // Switching to an item with no name on it drops anything already chosen
      // for the three steps that are about to disappear.
      if (key === "merch" && findOpt(options, "MERCH", value)?.plain) {
        nextSel.beadName = "";
        nextSel.size = "";
        nextSel.bead = "";
      }
      // Switching away from pick up while cash is chosen clears the payment.
      if (
        key === "fulfillment" &&
        !/pick/i.test(value) &&
        /^cash$/i.test(s.payment ?? "")
      ) {
        nextSel.payment = "";
      }
      return nextSel;
    });
  }

  // The step bodies below are rendered via plain function calls (NameStep(),
  // …) rather than as <NameStep/> elements: they are redefined on every
  // render, and a fresh JSX type would remount the subtree and drop input
  // focus mid-typing.

  function renderTile(o: ShopOption) {
    const key = step.key as keyof WizardSelections;
    const pressed = sel[key] === o.value;
    return (
      <button
        key={o.value}
        type="button"
        className={`tile${step.type !== "single" ? " center-al" : ""}`}
        aria-pressed={pressed}
        disabled={!o.active}
        onClick={() => pick(key, o.value)}
      >
        {step.type === "color" && (
          <span
            className="swatch"
            style={{ background: colorHexOf(options, o.value) }}
          />
        )}
        {step.type === "bead" && <BeadRing colors={o.style} />}
        {step.type === "design" && (
          <span className="charmbead" style={{ fontSize: 30 }}>
            {o.style || "·"}
          </span>
        )}
        <span className="tile-name">{o.value}</span>
        {!o.active ? (
          <span className="tile-note">coming soon</span>
        ) : (
          <>
            {o.note && <span className="tile-note">{o.note}</span>}
            {o.price > 0 && (
              <span className="tile-price">+{money(o.price)}</span>
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
        <p className="error">
          No choices are set up for this step. Add {step.cat} rows in the shop
          admin.
        </p>
      );
    }
    return (
      <div className={`grid${step.cols === 3 ? " grid-3" : ""}`}>
        {list.map(renderTile)}
      </div>
    );
  }

  function NameStep() {
    const name = sel.beadName ?? "";
    return (
      <>
        <div className="preview">
          {name ? (
            <BeadLine
              text={name}
              color={sel.color ? colorHexOf(options, sel.color) : null}
              charm={charm}
              small={name.length > 8}
            />
          ) : (
            <p className="preview-empty">Your name shows up here as you type</p>
          )}
        </div>
        <label className="field">
          <span className="field-label">Name on the piece</span>
          <input
            type="text"
            maxLength={settings.maxNameLength}
            value={name}
            placeholder="e.g. Skye"
            autoComplete="off"
            autoFocus
            onChange={(e) => {
              setStepError(null);
              setSel((s) => ({ ...s, beadName: cleanName(e.target.value) }));
            }}
          />
        </label>
        <p className="counter">
          {name.trim().length} / {settings.maxNameLength} characters
        </p>
      </>
    );
  }

  function AddonStep() {
    return (
      <>
        <div className="grid">
          {([["Yes", true], ["No", false]] as const).map(([label, yes]) => (
            <button
              key={label}
              type="button"
              className="tile center-al"
              aria-pressed={wantsAddons === yes}
              onClick={() => {
                setStepError(null);
                setWantsAddons(yes);
                if (!yes) setSel((s) => ({ ...s, addons: [] }));
              }}
            >
              <span className="tile-name">{label}</span>
            </button>
          ))}
        </div>
        {wantsAddons === true && (
          <div className="grid" style={{ marginTop: 12 }}>
            {opts("ADDON").map((o) => {
              const picked = sel.addons.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  className="tile"
                  aria-pressed={picked}
                  disabled={!o.active}
                  onClick={() => {
                    setStepError(null);
                    setSel((s) => ({
                      ...s,
                      addons: picked
                        ? s.addons.filter((a) => a !== o.value)
                        : [...s.addons, o.value],
                    }));
                  }}
                >
                  <span className="tile-name">{o.value}</span>
                  {o.note && <span className="tile-note">{o.note}</span>}
                  {o.price > 0 && (
                    <span className="tile-price">+{money(o.price)}</span>
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
        <label className="field">
          <span className="field-label">Your name</span>
          <input
            type="text"
            value={sel.customerName ?? ""}
            placeholder="Who we hand it to"
            onChange={(e) => {
              setStepError(null);
              setSel((s) => ({ ...s, customerName: e.target.value }));
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Mobile number</span>
          <input
            type="tel"
            value={sel.contact ?? ""}
            placeholder="09XX XXX XXXX"
            onChange={(e) => {
              setStepError(null);
              setSel((s) => ({ ...s, contact: e.target.value }));
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">
            Anything else we should know? (optional)
          </span>
          <textarea
            value={sel.notes ?? ""}
            placeholder="Colour of the letters, meet-up time, gift note…"
            onChange={(e) => setSel((s) => ({ ...s, notes: e.target.value }))}
          />
        </label>
      </>
    );
  }

  function PaymentStep() {
    const pickup = /pick/i.test(sel.fulfillment ?? "");
    const paymentOpt = findOpt(options, "PAYMENT", sel.payment);
    return (
      <>
        <div className="grid">
          {opts("PAYMENT").map((o) => {
            const cashOnly = /cash/i.test(o.value) && !/gcash/i.test(o.value);
            const blocked = cashOnly && !pickup;
            return (
              <button
                key={o.value}
                type="button"
                className="tile"
                aria-pressed={sel.payment === o.value}
                disabled={!o.active || blocked}
                onClick={() => pick("payment", o.value)}
              >
                <span className="tile-name">{o.value}</span>
                <span className="tile-note">
                  {blocked ? "Pick up orders only" : o.note}
                </span>
              </button>
            );
          })}
        </div>
        {/gcash/i.test(sel.payment ?? "") && settings.gcashNumber && (
          <p className="receipt-pay" style={{ marginTop: 14 }}>
            Send {money(total)} to {settings.gcashNumber}
            {settings.gcashName ? ` (${settings.gcashName})` : ""} after you
            place the order, then send us the screenshot with your order code.
          </p>
        )}
        {sel.payment && (
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

  /* ---------------- views ---------------- */

  const startLinks = (
    <p className="start-links">
      {signedIn ? (
        <>
          <Link href="/my-orders">My orders</Link>
          <Link href="/profile">Profile</Link>
        </>
      ) : (
        <Link href="/sign-in">Sign in</Link>
      )}
      {isAdmin && <Link href="/admin/shop">Shop admin</Link>}
    </p>
  );

  if (view === "start") {
    return (
      <div className="shell">
      <section className="view">
        <header className="masthead">
          <BeadLine text={settings.businessName || "BEADOOF"} />
          {settings.tagline && <p className="tagline">{settings.tagline}</p>}
        </header>
        <div className="start-card">
          <p className="start-copy">
            Build your piece one choice at a time. At the end you get an order
            code — send it with your payment and we&apos;ll start making it.
          </p>
          <button
            className="btn btn-primary"
            disabled={!open}
            onClick={() => {
              setStepIndex(0);
              setView("steps");
            }}
          >
            Start an order
          </button>
          <button
            className="btn btn-quiet"
            onClick={() => {
              setTrackResult(null);
              setTrackError(null);
              setView("track");
            }}
          >
            Check an order code
          </button>
        </div>
        {!open && <p className="closed">{settings.closedMessage}</p>}
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
      <div className="shell">
      <section className="view">
        <div className="topbar">
          <button
            className="iconbtn"
            aria-label="Go back"
            onClick={() => setView("start")}
          >
            ←
          </button>
          <h2 className="viewtitle">Check an order</h2>
        </div>
        <label className="field">
          <span className="field-label">Order code</span>
          <input
            type="text"
            value={trackCode}
            placeholder="BDF-0918-001"
            autoComplete="off"
            onChange={(e) => setTrackCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") track();
            }}
          />
        </label>
        <button className="btn btn-primary" onClick={track} disabled={trackBusy}>
          {trackBusy ? "Looking…" : "Find my order"}
        </button>
        {(trackResult || trackError) && (
          <div className="trackresult">
            {trackError && <p className="error">{trackError}</p>}
            {trackResult && (
              <>
                <span className={`pill${paid ? " paid" : ""}`}>
                  {trackResult.status}
                </span>
                <Summary
                  rows={[
                    ["Code", trackResult.code],
                    ["Item", trackResult.merch],
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
                  />
                )}
                <ProofBox
                  code={trackResult.code}
                  lead="Need to send your proof of payment?"
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
      <div className="shell">
      <section className="view">
        <div className="topbar">
          <button
            className="iconbtn"
            aria-label="Go back"
            onClick={() => setView("steps")}
          >
            ←
          </button>
          <h2 className="viewtitle">Check your order</h2>
        </div>
        <div className="preview preview-lg">
          {plain ? (
            <PlainStrand color={colorHex} charm={charm} />
          ) : (
            <BeadLine
              text={sel.beadName ?? ""}
              color={colorHex}
              charm={charm}
              small={(sel.beadName ?? "").length > 8}
            />
          )}
        </div>
        <Summary
          rows={[
            ["Item", sel.merch],
            ["Name", sel.beadName],
            ["Colour", sel.color],
            ["Design", sel.design],
            ["Letters", sel.size],
            ["Beads", sel.bead],
            ["Add-ons", sel.addons.join(", ")],
            ["For", sel.customerName],
            ["Mobile", sel.contact],
            ["Collection", sel.fulfillment],
            ["Payment", sel.payment],
            ["Note", sel.notes],
          ]}
        />
        <div className="totalbox">
          {settings.discountPercent > 0 && (
            <div className="discount">
              {settings.discountLabel} — was {money(subtotal)}
            </div>
          )}
          <div className="totalrow">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
        </div>
        {submitError && <p className="error">{submitError}</p>}
        <button className="btn btn-primary" onClick={place} disabled={submitting}>
          {submitting ? "Placing your order…" : "Place order"}
        </button>
        <p className="fineprint">
          {/pick/i.test(sel.fulfillment ?? "")
            ? settings.pickupNote
            : settings.preorderNote}
        </p>
      </section>
      </div>
    );
  }

  if (view === "receipt" && placed) {
    const cashOnPickup =
      /cash/i.test(sel.payment ?? "") && !/gcash/i.test(sel.payment ?? "");
    return (
      <div className="shell">
      <section className="view">
        <div className="receipt">
          <p className="receipt-eyebrow">Order placed</p>
          <BeadLine text={placed.code.split("-").slice(-1)[0]} small />
          <p className="receipt-code">{placed.code}</p>
          <Summary
            rows={[
              ["Item", dotted(sel.merch, sel.size)],
              ["Name", sel.beadName],
              ["Colour", dotted(sel.color, sel.bead)],
              ["Design", sel.design],
              ["Add-ons", sel.addons.join(", ")],
              ["For", sel.customerName],
              ["Collection", sel.fulfillment],
              ["Payment", `${sel.payment} · ${placed.status}`],
              ["Ordered", placed.orderedOn],
            ]}
          />
          <div className="totalrow">
            <span>Total</span>
            <strong>{money(placed.total)}</strong>
          </div>
          <p className="receipt-pay">
            {/gcash/i.test(sel.payment ?? "")
              ? `Send ${money(placed.total)} to ${settings.gcashNumber}` +
                (settings.gcashName ? ` (${settings.gcashName})` : "") +
                `, then message us the screenshot and this code. ${settings.preorderNote}`
              : `Bring ${money(placed.total)} when you collect. ${settings.pickupNote}`}
          </p>
          <QrBox
            option={findOpt(options, "PAYMENT", sel.payment)}
            lead={`Scan to pay ${money(placed.total)}`}
            amount={placed.total}
            qrDynamic={settings.qrDynamic}
          />
          {!cashOnPickup && (
            <ProofBox
              code={placed.code}
              lead="Once you have paid, send us the screenshot and we will start making it."
            />
          )}
        </div>
        <div className="receipt-edge" aria-hidden />
        <button className="btn btn-primary" onClick={copyCode}>
          {copied ? "Copied" : "Copy order code"}
        </button>
        <button className="btn btn-quiet" onClick={reset}>
          Order another one
        </button>
      </section>
      </div>
    );
  }

  /* ---------------- the step wizard ---------------- */

  return (
    <div className="shell duo">
    <section className="view" id="view-steps">
      <div className="topbar">
        <button className="iconbtn" aria-label="Go back" onClick={back}>
          ←
        </button>
        <div
          className="cord"
          role="progressbar"
          aria-valuemin={1}
          aria-valuenow={stepIndex + 1}
          aria-valuemax={STEPS.length}
        >
          {flow.map((_, i) => (
            <i
              key={i}
              className={i < stepIndex ? "done" : i === stepIndex ? "now" : ""}
            />
          ))}
        </div>
        <span className="stepcount">
          {stepIndex + 1} / {flow.length}
        </span>
      </div>

      <div id="step-body">
        <h1 className="steptitle">{step.title}</h1>
        {(() => {
          const hint =
            step.type === "color"
              ? plain
                ? "This is the colour of the beads."
                : "This is the colour of the beads around the name."
              : step.hint;
          return hint ? <p className="stephint">{hint}</p> : null;
        })()}
        {stepError && <p className="error">{stepError}</p>}
        {step.type === "name"
          ? NameStep()
          : step.type === "addons"
            ? AddonStep()
            : step.type === "details"
              ? DetailsStep()
              : step.type === "payment"
                ? PaymentStep()
                : TileStep()}
      </div>

      <div className="tray">
        <div className="tray-price">
          <span className="tray-label">
            {settings.discountPercent > 0 && total > 0
              ? `${settings.discountLabel} applied`
              : "Running total"}
          </span>
          <strong>{total > 0 ? money(total) : "—"}</strong>
        </div>
        <button className="btn btn-primary tray-next" onClick={next}>
          {stepIndex === flow.length - 1 ? "Review order" : "Next"}
        </button>
      </div>
    </section>
    {sidecar}
    </div>
  );
}
