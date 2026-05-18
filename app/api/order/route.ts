import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";
import { createClient } from "@/utils/supabase/server";

type DeliveryType = "pickup" | "courier";

type OrderBead = {
  color: string;
  stock: string;
  name?: string;
  assorted?: boolean;
  lettered?: boolean;
  letter?: string;
  sizeMm?: number;
  imageUrl?: string | null;
  variantColors?: string[];
};

const DEFAULT_ASSORTED_COLORS = [
  "#ff6b6b",
  "#f7b733",
  "#52c41a",
  "#13c2c2",
  "#1890ff",
  "#9c27b0",
];

function assortedColorsFor(b: OrderBead): string[] {
  return b.variantColors && b.variantColors.length > 0
    ? b.variantColors
    : DEFAULT_ASSORTED_COLORS;
}

type OrderBody = {
  customerName: string;
  deliveryType: DeliveryType;
  deliveryAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
  design: OrderBead[];
};

const ASSORTED_SWIRL =
  "conic-gradient(from 0deg,#ff6b6b,#f7b733,#52c41a,#13c2c2,#1890ff,#9c27b0,#ff6b6b)";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Fetch a remote image once, base64-encode it, and return a data URI suitable
// for inlining into an SVG <image href> or HTML <img src>. Returns null if
// the fetch fails so callers can fall back to whatever placeholder they want.
async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

/**
 * Walks the design, collects unique imageUrls, fetches each one in parallel,
 * and returns a Map from original URL to inlined data URI. Callers can use
 * `map.get(originalUrl) ?? originalUrl` to substitute on render — that way a
 * failed fetch falls back gracefully to the external URL (which some email
 * clients will still try to load).
 */
async function inlineDesignImages(
  design: OrderBead[],
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(
      design
        .map((b) => b.imageUrl)
        .filter((u): u is string => typeof u === "string" && u.length > 0),
    ),
  );
  const entries = await Promise.all(
    unique.map(async (u) => [u, await fetchImageAsDataUri(u)] as const),
  );
  const map = new Map<string, string>();
  for (const [url, dataUri] of entries) {
    if (dataUri) map.set(url, dataUri);
  }
  return map;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function beadSwatchStyle(b: OrderBead): string {
  if (b.stock === "out") {
    return "background:repeating-linear-gradient(45deg,#cfcfcf 0 2px,#ececec 2px 5px)";
  }
  if (b.assorted) {
    const v = b.variantColors;
    if (v && v.length > 0) {
      const stops = v.length === 1 ? v[0] : [...v, v[0]].join(",");
      return `background:conic-gradient(from 0deg,${stops})`;
    }
    return `background:${ASSORTED_SWIRL}`;
  }
  return `background:${b.color}`;
}

// ---------- SVG ring rendering ----------
// Mirrors the layout in app/components/DesignBuilder.tsx so the email preview
// matches what the customer saw on screen.

const SVG_SIZE = 400;
const SVG_CENTER = SVG_SIZE / 2;
const SVG_RING_RADIUS = 140;
const SVG_BEAD_RADIUS = 22;
const RING_CAPACITY = 25; // must match DesignBuilder

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function svgPieSlice(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  fill: string,
): string {
  const a = polar(cx, cy, r, endDeg);
  const b = polar(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `<path d="M ${cx} ${cy} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z" fill="${fill}"/>`;
}

function svgBead(
  b: OrderBead,
  x: number,
  y: number,
  r: number,
  index: number,
): string {
  const xs = x.toFixed(2);
  const ys = y.toFixed(2);

  // 1. Base body — colored circle / assorted pie slices / out hatched.
  //    Kept as a fallback behind any photo overlay so the bead still reads
  //    as something if the email client blocks remote images.
  let body = "";
  if (b.stock === "out") {
    body = `<circle cx="${xs}" cy="${ys}" r="${r}" fill="url(#hatch)" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`;
  } else if (b.assorted) {
    const colors = assortedColorsFor(b);
    const n = colors.length;
    body = colors
      .map((c, i) => {
        const a1 = (i / n) * 360 - 90;
        const a2 = ((i + 1) / n) * 360 - 90;
        return svgPieSlice(x, y, r, a1, a2, c);
      })
      .join("");
  } else {
    body = `<circle cx="${xs}" cy="${ys}" r="${r}" fill="${b.color}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>`;
  }

  // 2. Image overlay — clipped to a circle so the photo fills the bead
  //    shape. Email clients that block remote images will show the body
  //    underneath instead. Clip-path id is unique per bead position.
  let image = "";
  if (b.imageUrl) {
    const clipId = `bead-clip-${index}`;
    const imgX = (x - r).toFixed(2);
    const imgY = (y - r).toFixed(2);
    const imgD = (r * 2).toFixed(2);
    image = `<clipPath id="${clipId}"><circle cx="${xs}" cy="${ys}" r="${r}"/></clipPath>` +
      `<image href="${escapeHtml(b.imageUrl)}" x="${imgX}" y="${imgY}" width="${imgD}" height="${imgD}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`;
  }

  // 3. Variant indicator chip — when an image is hiding the body fill,
  //    add a small dot so the shop still sees the assortment / picked
  //    variant. For assorted beads this renders the swirl of variant
  //    colors; for a variant-picked bead it renders the solid color.
  let assortedChip = "";
  if (b.imageUrl && b.assorted) {
    const cx = (x - r * 0.65).toFixed(2);
    const cy = (y - r * 0.65).toFixed(2);
    const cr = (r * 0.3).toFixed(2);
    const colors = assortedColorsFor(b);
    const n = colors.length;
    const cxN = x - r * 0.65;
    const cyN = y - r * 0.65;
    const crN = r * 0.3;
    assortedChip =
      `<circle cx="${cx}" cy="${cy}" r="${cr}" fill="white" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>` +
      colors
        .map((c, i) => {
          const a1 = (i / n) * 360 - 90;
          const a2 = ((i + 1) / n) * 360 - 90;
          return svgPieSlice(cxN, cyN, crN * 0.85, a1, a2, c);
        })
        .join("");
  } else if (
    b.imageUrl &&
    !b.assorted &&
    b.variantColors &&
    b.variantColors.length > 0 &&
    b.variantColors.includes(b.color)
  ) {
    const cx = (x - r * 0.65).toFixed(2);
    const cy = (y - r * 0.65).toFixed(2);
    const cr = (r * 0.3).toFixed(2);
    assortedChip =
      `<circle cx="${cx}" cy="${cy}" r="${cr}" fill="white" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${(r * 0.3 * 0.85).toFixed(2)}" fill="${b.color}"/>`;
  }

  // 4. Specular highlight (skip on out-of-stock and on image — the photo
  //    has its own lighting and an extra ellipse just looks like a smudge).
  let highlight = "";
  if (b.stock !== "out" && !b.imageUrl) {
    const hx = (x - r * 0.3).toFixed(2);
    const hy = (y - r * 0.4).toFixed(2);
    const hrx = (r * 0.4).toFixed(2);
    const hry = (r * 0.25).toFixed(2);
    highlight = `<ellipse cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}" fill="rgba(255,255,255,0.55)"/>`;
  }

  // 5. Letter overlay — on top of everything so lettered beads still read.
  let letter = "";
  if (b.letter) {
    const ly = (y + r * 0.36).toFixed(2);
    letter = `<text x="${xs}" y="${ly}" font-family="Arial, sans-serif" font-size="${(r * 1.05).toFixed(2)}" font-weight="bold" fill="#ffffff" text-anchor="middle" paint-order="stroke" stroke="rgba(0,0,0,0.5)" stroke-width="1.4">${escapeHtml(b.letter)}</text>`;
  }

  return body + image + assortedChip + highlight + letter;
}

function buildDesignSvg(design: OrderBead[]): string {
  const count = design.length;
  const ringSize = Math.max(RING_CAPACITY, count + 1);
  const step = 360 / ringSize;
  let beads = "";
  for (let i = 0; i < count; i++) {
    const angle = -90 - (count - i) * step;
    const pos = polar(SVG_CENTER, SVG_CENTER, SVG_RING_RADIUS, angle);
    beads += svgBead(design[i], pos.x, pos.y, SVG_BEAD_RADIUS, i);
  }
  const summary = `${count} bead${count === 1 ? "" : "s"}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}" width="${SVG_SIZE}" height="${SVG_SIZE}">
  <defs>
    <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="#ececec"/>
      <line x1="0" y1="0" x2="0" y2="6" stroke="#cfcfcf" stroke-width="2"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="${SVG_SIZE}" height="${SVG_SIZE}" rx="24" fill="#faf3ea"/>
  <circle cx="${SVG_CENTER}" cy="${SVG_CENTER}" r="${SVG_RING_RADIUS}" fill="none" stroke="rgba(196,166,138,0.25)" stroke-width="1" stroke-dasharray="4 4"/>
  ${beads}
  <text x="${SVG_CENTER}" y="${SVG_SIZE - 18}" font-family="Arial, sans-serif" font-size="14" fill="#7a6a60" text-anchor="middle">${escapeHtml(summary)}</text>
</svg>`;
}

type BomRow = {
  key: string;
  name: string;
  swatch: string;
  imageUrl: string | null;
  variantDotColor: string | null;
  count: number;
  letters: string[];
  sizeMm: number;
};

function variantDotColorFor(b: OrderBead): string | null {
  if (
    b.imageUrl &&
    !b.assorted &&
    b.variantColors &&
    b.variantColors.length > 0 &&
    b.variantColors.includes(b.color)
  ) {
    return b.color;
  }
  return null;
}

function buildBom(design: OrderBead[]): BomRow[] {
  const map = new Map<string, BomRow>();
  for (const b of design) {
    const key = `${b.name ?? b.color}|${b.color}|${b.assorted ? "A" : ""}|${b.lettered ? "L" : ""}|${b.sizeMm ?? 8}|${b.imageUrl ?? ""}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name: b.name ?? b.color,
        swatch: beadSwatchStyle(b),
        imageUrl: b.imageUrl ?? null,
        variantDotColor: variantDotColorFor(b),
        count: 0,
        letters: [],
        sizeMm: b.sizeMm ?? 8,
      };
      map.set(key, row);
    }
    row.count += 1;
    if (b.letter) row.letters.push(b.letter);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

// Linear-row fallback used inside the email body in case the inlined SVG
// attachment doesn't render in a given client. Kept compact so it still reads.
function buildRingHtmlFallback(design: OrderBead[]): string {
  return design
    .map((b) => {
      // If the bead has an image, render an <img> thumbnail so the fallback
      // matches what the user designed. Otherwise use the colored/assorted
      // CSS swatch.
      let core: string;
      if (b.imageUrl) {
        const dot = variantDotColorFor(b);
        const wrapper = `display:inline-block;position:relative;width:18px;height:18px;margin:1px;vertical-align:middle;`;
        const img = `<img src="${escapeHtml(b.imageUrl)}" alt="" style="display:block;width:18px;height:18px;border-radius:50%;object-fit:cover;border:1px solid rgba(0,0,0,0.06)"/>`;
        const dotSpan = dot
          ? `<span style="position:absolute;top:-2px;left:-2px;width:7px;height:7px;border-radius:50%;background:${dot};border:1px solid #fff;box-shadow:0 0 0 0.5px rgba(0,0,0,0.1);"></span>`
          : "";
        core = `<span style="${wrapper}">${img}${dotSpan}</span>`;
      } else {
        const style =
          `display:inline-block;width:18px;height:18px;border-radius:50%;margin:1px;` +
          `box-shadow:inset 0 -2px 3px rgba(0,0,0,0.18),inset 0 2px 3px rgba(255,255,255,0.25);` +
          `vertical-align:middle;` +
          beadSwatchStyle(b);
        core = `<span style="${style}"></span>`;
      }
      const letter = b.letter
        ? `<span style="display:inline-block;width:18px;text-align:center;font-size:10px;font-weight:bold;color:#fff;margin-left:-19px;line-height:18px;vertical-align:middle;text-shadow:0 1px 1px rgba(0,0,0,0.5)">${escapeHtml(b.letter)}</span>`
        : "";
      return `${core}${letter}`;
    })
    .join("");
}

function buildEmailHtml(body: OrderBody): string {
  const { customerName, deliveryType, design } = body;
  const totalBeads = design.length;
  const totalMm = design.reduce((s, b) => s + (b.sizeMm ?? 8), 0);
  const totalIn = (totalMm / 25.4).toFixed(1);
  const bom = buildBom(design);
  const isCourier = deliveryType === "courier";

  const customerRows = [
    `<tr><td><strong>Name</strong></td><td>${escapeHtml(customerName)}</td></tr>`,
    `<tr><td><strong>Delivery</strong></td><td>${escapeHtml(deliveryType)}</td></tr>`,
  ];
  if (body.customerEmail)
    customerRows.push(
      `<tr><td><strong>Email</strong></td><td>${escapeHtml(body.customerEmail)}</td></tr>`,
    );
  if (isCourier) {
    if (body.deliveryAddress)
      customerRows.push(
        `<tr><td><strong>Address</strong></td><td>${escapeHtml(body.deliveryAddress)}</td></tr>`,
      );
    if (body.customerPhone)
      customerRows.push(
        `<tr><td><strong>Phone</strong></td><td>${escapeHtml(body.customerPhone)}</td></tr>`,
      );
  }

  const bomRows = bom
    .map((r) => {
      let swatch: string;
      if (r.imageUrl) {
        const img = `<img src="${escapeHtml(r.imageUrl)}" alt="" style="display:block;width:14px;height:14px;border-radius:50%;object-fit:cover;border:1px solid rgba(0,0,0,0.06)"/>`;
        const dot = r.variantDotColor
          ? `<span style="position:absolute;top:-2px;left:-2px;width:6px;height:6px;border-radius:50%;background:${r.variantDotColor};border:1px solid #fff;box-shadow:0 0 0 0.5px rgba(0,0,0,0.1);"></span>`
          : "";
        swatch = `<span style="display:inline-block;position:relative;width:14px;height:14px;vertical-align:middle;margin-right:6px;">${img}${dot}</span>`;
      } else {
        swatch = `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;${r.swatch};vertical-align:middle;margin-right:6px;border:1px solid rgba(0,0,0,0.06)"></span>`;
      }
      const variantNote = r.variantDotColor
        ? ` &middot; <span style="color:#7a6a60;">color ${escapeHtml(r.variantDotColor)}</span>`
        : "";
      return `
        <tr>
          <td style="padding:6px 4px;">
            ${swatch}
            ${escapeHtml(r.name)} (${r.sizeMm}mm)${variantNote}${r.letters.length > 0 ? ` &mdash; letters: ${r.letters.map(escapeHtml).join(", ")}` : ""}
          </td>
          <td style="padding:6px 4px;text-align:right;font-variant-numeric:tabular-nums;"><strong>${r.count}</strong></td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;padding:24px;color:#3b2b22;background:#faf3ea;">
  <h1 style="margin:0 0 8px;color:#5a3a24;">New Beadoof order</h1>
  <p style="color:#7a6a60;margin:0 0 20px;">Placed ${escapeHtml(new Date().toISOString())}</p>

  <h2 style="border-bottom:1px solid #e4d3c4;padding-bottom:4px;">Customer</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    ${customerRows.join("")}
  </table>

  <h2 style="border-bottom:1px solid #e4d3c4;padding-bottom:4px;">Design</h2>
  <p style="margin:8px 0;"><strong>${totalBeads}</strong> beads &middot; <strong>${totalIn} in</strong> total length</p>
  <div style="background:#fff;border:1px solid #e4d3c4;border-radius:12px;padding:12px;text-align:center;">
    <img src="cid:design-preview" alt="Bracelet design" style="max-width:400px;width:100%;height:auto;display:block;margin:0 auto;border:0;" />
    <div style="margin-top:8px;font-size:11px;color:#9a8478;">If the design isn't visible above, open the attached <code>design.svg</code> file.</div>
    <div style="margin-top:10px;line-height:22px;">
      ${buildRingHtmlFallback(design)}
    </div>
  </div>

  <h2 style="border-bottom:1px solid #e4d3c4;padding-bottom:4px;margin-top:24px;">Bill of materials</h2>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#fbf1ea;">
        <th align="left" style="padding:6px 4px;">Item</th>
        <th align="right" style="padding:6px 4px;">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${bomRows}
    </tbody>
    <tfoot>
      <tr style="border-top:2px solid #e4d3c4;">
        <td style="padding:6px 4px;"><strong>Total</strong></td>
        <td style="padding:6px 4px;text-align:right;"><strong>${totalBeads}</strong></td>
      </tr>
    </tfoot>
  </table>

  <p style="color:#9a8478;font-size:12px;margin-top:32px;">
    Generated by Beadoof.
  </p>
</body>
</html>`;
}

function buildEmailText(body: OrderBody): string {
  const { customerName, deliveryType, design } = body;
  const totalBeads = design.length;
  const totalMm = design.reduce((s, b) => s + (b.sizeMm ?? 8), 0);
  const totalIn = (totalMm / 25.4).toFixed(1);
  const bom = buildBom(design);

  const lines: string[] = [];
  lines.push("New Beadoof order");
  lines.push(`Placed: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("CUSTOMER");
  lines.push(`  Name: ${customerName}`);
  lines.push(`  Delivery: ${deliveryType}`);
  if (body.customerEmail) lines.push(`  Email: ${body.customerEmail}`);
  if (deliveryType === "courier") {
    if (body.deliveryAddress) lines.push(`  Address: ${body.deliveryAddress}`);
    if (body.customerPhone) lines.push(`  Phone: ${body.customerPhone}`);
  }
  lines.push("");
  lines.push("DESIGN");
  lines.push(`  ${totalBeads} beads · ${totalIn} in`);
  lines.push("");
  lines.push("BILL OF MATERIALS");
  for (const r of bom) {
    const letters =
      r.letters.length > 0 ? ` — letters: ${r.letters.join(", ")}` : "";
    const variant = r.variantDotColor ? ` — color ${r.variantDotColor}` : "";
    lines.push(`  ${r.name} (${r.sizeMm}mm)${variant}${letters} × ${r.count}`);
  }
  lines.push("");
  lines.push(`Total beads: ${totalBeads}`);
  return lines.join("\n");
}

type Attachment = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
  cid?: string;
};

async function sendEmail(opts: {
  to: string;
  cc?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
}): Promise<{ sent: boolean; mode: "smtp" | "log"; info?: string }> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !user || !pass || !from) {
    // Stub mode: SMTP not configured, just log the receipt to the server.
    console.log("[order] SMTP not configured — logging instead of sending");
    console.log("------ EMAIL (would be sent) ------");
    console.log(`To: ${opts.to}${opts.cc ? ` cc: ${opts.cc}` : ""}`);
    console.log(`Subject: ${opts.subject}`);
    console.log(opts.text);
    if (opts.attachments?.length) {
      console.log(
        `Attachments: ${opts.attachments.map((a) => a.filename).join(", ")}`,
      );
    }
    console.log("-----------------------------------");
    return { sent: true, mode: "log" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to: opts.to,
    cc: opts.cc,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
  });

  return { sent: true, mode: "smtp", info: info.messageId };
}

export async function POST(req: Request) {
  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body?.customerName?.trim()) {
    return NextResponse.json(
      { error: "customerName required" },
      { status: 400 },
    );
  }
  if (body.deliveryType !== "pickup" && body.deliveryType !== "courier") {
    return NextResponse.json(
      { error: "deliveryType must be pickup or courier" },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.design) || body.design.length === 0) {
    return NextResponse.json(
      { error: "design must be a non-empty array" },
      { status: 400 },
    );
  }

  // Customer email is required for every order so the receipt can be sent
  // to them directly. Courier orders additionally need address + phone.
  if (!body.customerEmail?.trim() || !isValidEmail(body.customerEmail)) {
    return NextResponse.json(
      { error: "valid customerEmail required" },
      { status: 400 },
    );
  }
  if (body.deliveryType === "courier") {
    if (!body.deliveryAddress?.trim()) {
      return NextResponse.json(
        { error: "deliveryAddress required for courier" },
        { status: 400 },
      );
    }
    if (!body.customerPhone?.trim()) {
      return NextResponse.json(
        { error: "customerPhone required for courier" },
        { status: 400 },
      );
    }
  }

  const shopEmail = process.env.ORDER_TO_EMAIL;
  if (!shopEmail) {
    return NextResponse.json(
      { error: "ORDER_TO_EMAIL env var not set" },
      { status: 500 },
    );
  }

  // Fetch every unique image referenced by the design and inline them as
  // base64 data URIs. SVG <image href=...> with remote URLs is blocked by
  // most email-client renderers when the SVG is treated as an offline
  // attachment; data URIs eliminate the network dependency so the photos
  // actually render. Falls back to the original URL on fetch failure.
  const imageMap = await inlineDesignImages(body.design);
  const renderDesign: OrderBead[] = body.design.map((b) => ({
    ...b,
    imageUrl: b.imageUrl ? (imageMap.get(b.imageUrl) ?? b.imageUrl) : null,
  }));
  const renderBody: OrderBody = { ...body, design: renderDesign };

  const html = buildEmailHtml(renderBody);
  const text = buildEmailText(renderBody);
  const subject = `Your Beadoof order — ${body.customerName}`;
  // Customer is the primary recipient; the shop is CC'd so they always
  // get a copy of the receipt.
  const to = body.customerEmail.trim();
  const cc = shopEmail;

  const designSvg = buildDesignSvg(renderDesign);
  const attachments: Attachment[] = [
    {
      filename: "design.svg",
      content: designSvg,
      contentType: "image/svg+xml",
      cid: "design-preview",
    },
  ];

  // Persist the order in Supabase. user_id is linked when signed in, null
  // for guests. If the DB insert fails we still try to send the email so
  // the shop doesn't lose the order — and we surface the warning.
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const totalBeads = body.design.length;
  const totalLengthMm = body.design.reduce((s, b) => s + (b.sizeMm ?? 8), 0);
  const bom = buildBom(body.design).map((r) => ({
    name: r.name,
    count: r.count,
    sizeMm: r.sizeMm,
    letters: r.letters,
  }));

  let orderId: string | null = null;
  let dbError: string | null = null;
  {
    const { data, error } = await supabase
      .from("orders")
      .insert({
        user_id: user?.id ?? null,
        customer_name: body.customerName.trim(),
        delivery_type: body.deliveryType,
        delivery_address: body.deliveryAddress?.trim() ?? null,
        customer_phone: body.customerPhone?.trim() ?? null,
        customer_email: body.customerEmail.trim(),
        design: body.design,
        bom,
        total_beads: totalBeads,
        total_length_mm: totalLengthMm,
      })
      .select("id")
      .single();
    if (error) {
      dbError = error.message;
      console.error("[order] DB insert failed:", error.message);
    } else {
      orderId = data?.id ?? null;
    }
  }

  try {
    const result = await sendEmail({
      to,
      cc,
      subject,
      html,
      text,
      attachments,
    });
    return NextResponse.json({ ok: true, orderId, dbError, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown send error";
    console.error("[order] send failed:", msg);
    return NextResponse.json({ error: msg, orderId, dbError }, { status: 500 });
  }
}
