// Shared shop types + pricing. Used by the client wizard (running total)
// and the order API (authoritative re-pricing), so the two never disagree.

export const CATEGORIES = [
  "FULFILLMENT",
  "MERCH",
  "COLOR",
  "DESIGN",
  "SIZE",
  "BEAD",
  "ADDON",
  "PAYMENT",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type ShopOption = {
  id?: string;
  category: Category;
  value: string;
  price: number;
  active: boolean;
  note: string;
  /** One hex for COLOR, comma-separated hexes for BEAD, an emoji for DESIGN. */
  style: string;
  /** PAYMENT only: an image URL, or the QR's own text (drawn client-side). */
  qr: string | null;
  /** MERCH only: item with no beaded name — skips the name/size/bead steps. */
  plain: boolean;
  sort: number;
};

export type ShopOptions = Record<Category, ShopOption[]>;

export type ShopSettings = {
  businessName: string;
  tagline: string;
  currency: string;
  maxNameLength: number;
  pricePerLetter: number;
  discountLabel: string;
  discountPercent: number;
  gcashName: string;
  gcashNumber: string;
  /** Rebuild text QRs so they carry the order's exact amount. */
  qrDynamic: boolean;
  pickupNote: string;
  preorderNote: string;
  closedMessage: string;
};

export type ShopBootstrap = {
  open: boolean;
  settings: ShopSettings;
  options: ShopOptions;
};

/** One piece of an order — an order can hold several. */
export type PieceSelections = {
  merch?: string;
  color?: string;
  beadName?: string;
  design?: string;
  size?: string;
  bead?: string;
  addons: string[];
};

/** The choices a customer makes in the wizard: the piece currently being
    built plus the order-level fields (who, how, payment). */
export type WizardSelections = PieceSelections & {
  fulfillment?: string;
  customerName?: string;
  contact?: string;
  notes?: string;
  payment?: string;
};

export function findOpt(
  options: ShopOptions,
  cat: Category,
  value: string | undefined,
): ShopOption | null {
  const wanted = String(value ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return (
    (options[cat] ?? []).find((o) => o.value.toLowerCase() === wanted) ?? null
  );
}

export function priceOf(
  options: ShopOptions,
  cat: Category,
  value: string | undefined,
): number {
  return findOpt(options, cat, value)?.price ?? 0;
}

export function cleanName(value: string): string {
  return String(value ?? "")
    .replace(/[^\p{L}\p{N} '&.\-]/gu, "")
    .replace(/\s+/g, " ");
}

/** Items ticked "No beaded name" (earrings, charms) skip three steps. */
export function isPlainMerch(
  options: ShopOptions,
  merch: string | undefined,
): boolean {
  return !!findOpt(options, "MERCH", merch)?.plain;
}

/** What one piece costs on its own (fulfillment is charged once per order). */
export function pieceSubtotalOf(
  options: ShopOptions,
  piece: PieceSelections,
  pricePerLetter: number,
): number {
  const plain = isPlainMerch(options, piece.merch);
  let t = 0;
  t += priceOf(options, "MERCH", piece.merch);
  t += priceOf(options, "COLOR", piece.color);
  t += priceOf(options, "DESIGN", piece.design);
  if (!plain) {
    t += priceOf(options, "SIZE", piece.size);
    t += priceOf(options, "BEAD", piece.bead);
    if (piece.beadName) {
      t += piece.beadName.replace(/\s/g, "").length * (pricePerLetter || 0);
    }
  }
  for (const a of piece.addons ?? []) t += priceOf(options, "ADDON", a);
  return Math.round(t);
}

/** All pieces plus the once-per-order fulfillment charge. */
export function orderSubtotalOf(
  options: ShopOptions,
  fulfillment: string | undefined,
  pieces: PieceSelections[],
  pricePerLetter: number,
): number {
  const t =
    priceOf(options, "FULFILLMENT", fulfillment) +
    pieces.reduce((s, p) => s + pieceSubtotalOf(options, p, pricePerLetter), 0);
  return Math.round(t);
}

/** Joins the parts that exist, so a skipped choice leaves no stray dot. */
export function dotted(...parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------------
 * QR Ph payloads (EMVCo)
 *
 * A QR Ph code is a run of tag + 2-digit length + value, ending with tag 63,
 * a checksum over everything before it. To put an amount in the code we have
 * to rebuild the payload and recalculate that checksum — edit the string any
 * other way and no payment app will accept it.
 * ------------------------------------------------------------------ */

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** CRC16/CCITT-FALSE over UTF-8 bytes, the checksum EMVCo specifies for tag 63. */
export function emvCrc(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

type EmvField = { tag: string; value: string; raw: string };

/** Splits a payload into its top-level tags, or null if it is not a clean one. */
export function emvParse(payload: string): EmvField[] | null {
  // Newlines and tabs come from pasting; spaces are real and stay.
  const s = String(payload ?? "").replace(/[\r\n\t]+/g, "").trim();
  const out: EmvField[] = [];
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.substr(i, 2);
    const lenStr = s.substr(i + 2, 2);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenStr)) return null;
    const len = parseInt(lenStr, 10);
    if (i + 4 + len > s.length) return null;
    out.push({ tag, value: s.substr(i + 4, len), raw: s.substr(i, 4 + len) });
    i += 4 + len;
  }
  return i === s.length && out.length ? out : null;
}

function emvField(tag: string, value: string): string | null {
  const n = utf8Length(value);
  if (n > 99) return null;
  return tag + String(n).padStart(2, "0") + value;
}

/**
 * Returns the payload with this order's amount inside it, or null if the text
 * is not a payload we can safely rebuild — in which case the plain code is used.
 * Tags we do not touch are copied across byte for byte.
 */
export function qrphWithAmount(payload: string, amount: number): string | null {
  const fields = emvParse(payload);
  if (!fields) return null;

  const value = Number(amount);
  if (!isFinite(value) || value <= 0) return null;

  const amountField = emvField("54", value.toFixed(2));
  if (!amountField) return null;

  const out: string[] = [];
  let placed = false;
  for (const f of fields) {
    if (f.tag === "63") continue; // the old checksum goes
    if (f.tag === "54") {
      out.push(amountField);
      placed = true;
      continue;
    }
    if (!placed && Number(f.tag) > 54) {
      out.push(amountField);
      placed = true;
    }
    // tag 01 says whether the code is reusable (11) or one payment (12)
    out.push(f.tag === "01" ? emvField("01", "12")! : f.raw);
  }
  if (!placed) out.push(amountField);

  const body = out.join("") + "6304";
  return body + emvCrc(body);
}

/** The text to draw for a method: with the amount in it where that is possible. */
export function qrPayload(
  text: string,
  amount: number | null | undefined,
  qrDynamic: boolean,
): { text: string; carriesAmount: boolean } {
  if (!qrDynamic || !amount) return { text, carriesAmount: false };
  const withAmount = qrphWithAmount(text, amount);
  return withAmount
    ? { text: withAmount, carriesAmount: true }
    : { text, carriesAmount: false };
}

export function totalOf(subtotal: number, discountPercent: number): number {
  return discountPercent > 0
    ? Math.round((subtotal * (100 - discountPercent)) / 100)
    : subtotal;
}

export function formatMoney(currency: string, n: number): string {
  return currency + Number(n).toLocaleString();
}

export function colorHexOf(
  options: ShopOptions,
  name: string | undefined,
): string {
  const s = (findOpt(options, "COLOR", name)?.style ?? "")
    .split(",")[0]
    .trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "#C5B8DF";
}
