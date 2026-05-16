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
};

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

function svgBead(b: OrderBead, x: number, y: number, r: number): string {
  const xs = x.toFixed(2);
  const ys = y.toFixed(2);
  let body = "";
  if (b.stock === "out") {
    body = `<circle cx="${xs}" cy="${ys}" r="${r}" fill="url(#hatch)" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`;
  } else if (b.assorted) {
    const colors = [
      "#ff6b6b",
      "#f7b733",
      "#52c41a",
      "#13c2c2",
      "#1890ff",
      "#9c27b0",
    ];
    body = colors
      .map((c, i) => {
        const a1 = (i / 6) * 360 - 90;
        const a2 = ((i + 1) / 6) * 360 - 90;
        return svgPieSlice(x, y, r, a1, a2, c);
      })
      .join("");
  } else {
    body = `<circle cx="${xs}" cy="${ys}" r="${r}" fill="${b.color}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>`;
  }

  let highlight = "";
  if (b.stock !== "out") {
    const hx = (x - r * 0.3).toFixed(2);
    const hy = (y - r * 0.4).toFixed(2);
    const hrx = (r * 0.4).toFixed(2);
    const hry = (r * 0.25).toFixed(2);
    highlight = `<ellipse cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}" fill="rgba(255,255,255,0.55)"/>`;
  }

  let letter = "";
  if (b.letter) {
    const ly = (y + r * 0.36).toFixed(2);
    letter = `<text x="${xs}" y="${ly}" font-family="Arial, sans-serif" font-size="${(r * 1.05).toFixed(2)}" font-weight="bold" fill="#ffffff" text-anchor="middle" paint-order="stroke" stroke="rgba(0,0,0,0.5)" stroke-width="1.4">${escapeHtml(b.letter)}</text>`;
  }

  return body + highlight + letter;
}

function buildDesignSvg(design: OrderBead[]): string {
  const count = design.length;
  const ringSize = Math.max(RING_CAPACITY, count + 1);
  const step = 360 / ringSize;
  let beads = "";
  for (let i = 0; i < count; i++) {
    const angle = -90 - (count - i) * step;
    const pos = polar(SVG_CENTER, SVG_CENTER, SVG_RING_RADIUS, angle);
    beads += svgBead(design[i], pos.x, pos.y, SVG_BEAD_RADIUS);
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
  count: number;
  letters: string[];
  sizeMm: number;
};

function buildBom(design: OrderBead[]): BomRow[] {
  const map = new Map<string, BomRow>();
  for (const b of design) {
    const key = `${b.name ?? b.color}|${b.color}|${b.assorted ? "A" : ""}|${b.lettered ? "L" : ""}|${b.sizeMm ?? 8}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        name: b.name ?? b.color,
        swatch: beadSwatchStyle(b),
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
      const style =
        `display:inline-block;width:18px;height:18px;border-radius:50%;margin:1px;` +
        `box-shadow:inset 0 -2px 3px rgba(0,0,0,0.18),inset 0 2px 3px rgba(255,255,255,0.25);` +
        `vertical-align:middle;` +
        beadSwatchStyle(b);
      const letter = b.letter
        ? `<span style="display:inline-block;width:18px;text-align:center;font-size:10px;font-weight:bold;color:#fff;margin-left:-19px;line-height:18px;vertical-align:middle;text-shadow:0 1px 1px rgba(0,0,0,0.5)">${escapeHtml(b.letter)}</span>`
        : "";
      return `<span style="${style}"></span>${letter}`;
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
    .map(
      (r) => `
        <tr>
          <td style="padding:6px 4px;">
            <span style="display:inline-block;width:14px;height:14px;border-radius:50%;${r.swatch};vertical-align:middle;margin-right:6px;border:1px solid rgba(0,0,0,0.06)"></span>
            ${escapeHtml(r.name)} (${r.sizeMm}mm)${r.letters.length > 0 ? ` &mdash; letters: ${r.letters.map(escapeHtml).join(", ")}` : ""}
          </td>
          <td style="padding:6px 4px;text-align:right;font-variant-numeric:tabular-nums;"><strong>${r.count}</strong></td>
        </tr>`,
    )
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
    lines.push(`  ${r.name} (${r.sizeMm}mm)${letters} × ${r.count}`);
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

  const html = buildEmailHtml(body);
  const text = buildEmailText(body);
  const subject = `Your Beadoof order — ${body.customerName}`;
  // Customer is the primary recipient; the shop is CC'd so they always
  // get a copy of the receipt.
  const to = body.customerEmail.trim();
  const cc = shopEmail;

  const designSvg = buildDesignSvg(body.design);
  const attachments: Attachment[] = [
    {
      filename: "design.svg",
      content: designSvg,
      contentType: "image/svg+xml",
      cid: "design-preview",
    },
  ];

  // Persist the order in Supabase first. user_id is linked when signed in,
  // null for guests. If the DB insert fails we still try to send the email
  // (so the shop doesn't lose the order) — but we surface the warning.
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
