import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import nodemailer from "nodemailer";
import { createClient } from "@/utils/supabase/server";
import { getShopBootstrap } from "@/lib/shop.server";
import {
  cleanName,
  dotted,
  findOpt,
  formatMoney,
  pieceSubtotalOf,
  totalOf,
  type PieceSelections,
  type ShopOptions,
  type ShopSettings,
} from "@/lib/shop";

// Port of the Apps Script submitOrder(), extended so one order can hold
// several pieces (same customer, one code). Every choice is re-validated
// against the live catalog and re-priced server-side.

const MAX_PIECES = 100;

type OrderBody = {
  fulfillment?: string;
  customerName?: string;
  contact?: string;
  notes?: string;
  payment?: string;
  pieces?: PieceSelections[];
};

/** A piece after validation: canonical option values + its own price. */
type ValidatedPiece = {
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

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function requireOption(
  options: ShopOptions,
  cat: Parameters<typeof findOpt>[1],
  value: string | undefined,
  label: string,
) {
  const o = findOpt(options, cat, value);
  if (!o || !o.active) {
    throw new Error(
      `That ${label} isn't available any more. Pick another one.`,
    );
  }
  return o;
}

function validatePiece(
  options: ShopOptions,
  settings: ShopSettings,
  p: PieceSelections,
  which: string,
): ValidatedPiece {
  const merch = requireOption(options, "MERCH", p.merch, `item${which}`);
  const color = requireOption(options, "COLOR", p.color, `colour${which}`);
  const design = requireOption(options, "DESIGN", p.design, `design${which}`);

  // Items ticked "No beaded name" skip the name, letter size and bead mix.
  const plain = !!merch.plain;
  const size = plain
    ? null
    : requireOption(options, "SIZE", p.size, `letter size${which}`);
  const bead = plain
    ? null
    : requireOption(options, "BEAD", p.bead, `bead style${which}`);

  const beadName = plain ? "" : cleanName(p.beadName ?? "").trim();
  if (!plain) {
    if (!beadName) throw new Error(`Type the name we should bead${which}.`);
    if (beadName.length > settings.maxNameLength) {
      throw new Error(
        `Names can be up to ${settings.maxNameLength} characters.`,
      );
    }
  }

  const addons = (Array.isArray(p.addons) ? p.addons : []).map(
    (a) => requireOption(options, "ADDON", a, `add-on${which}`).value,
  );

  const piece: PieceSelections = {
    merch: merch.value,
    color: color.value,
    beadName,
    design: design.value,
    size: size?.value,
    bead: bead?.value,
    addons,
  };
  return {
    merch: merch.value,
    color: color.value,
    beadName,
    design: design.value,
    size: size?.value ?? null,
    bead: bead?.value ?? null,
    addons,
    plain,
    subtotal: pieceSubtotalOf(options, piece, settings.pricePerLetter),
  };
}

/** Best-effort notification to the shop. Never blocks the order. */
async function notifyShop(subject: string, text: string) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;
  const to = process.env.ORDER_TO_EMAIL;
  if (!host || !user || !pass || !from || !to) {
    console.log(`[order] ${subject}\n${text}`);
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to, subject, text });
  } catch (e) {
    console.error("[order] shop notification failed:", e);
  }
}

export async function POST(req: Request) {
  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return fail("invalid json");
  }

  let boot;
  try {
    boot = await getShopBootstrap();
  } catch (e) {
    console.error("[order] bootstrap failed:", e);
    return fail("The shop could not be reached. Try again in a moment.", 500);
  }
  const { settings, options } = boot;
  if (!boot.open) return fail(settings.closedMessage);

  try {
    const fulfillment = requireOption(
      options,
      "FULFILLMENT",
      body.fulfillment,
      "delivery method",
    );
    const payment = requireOption(
      options,
      "PAYMENT",
      body.payment,
      "payment method",
    );

    const rawPieces = Array.isArray(body.pieces) ? body.pieces : [];
    if (rawPieces.length === 0)
      throw new Error("Add at least one piece first.");
    if (rawPieces.length > MAX_PIECES) {
      throw new Error(
        `Up to ${MAX_PIECES} pieces per order — message us for bigger batches.`,
      );
    }
    const pieces = rawPieces.map((p, i) =>
      validatePiece(
        options,
        settings,
        p,
        rawPieces.length > 1 ? ` on piece ${i + 1}` : "",
      ),
    );

    const customerName = String(body.customerName ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (customerName.length < 2) {
      throw new Error("Add the name we should look for when you collect.");
    }

    const contact = String(body.contact ?? "").trim();
    if (contact.replace(/\D/g, "").length < 7) {
      throw new Error("Add a mobile number we can reach you on.");
    }

    const isCash = /cash/i.test(payment.value) && !/gcash/i.test(payment.value);
    if (isCash && !/pick/i.test(fulfillment.value)) {
      throw new Error(
        "Cash works for pick up only. Choose GCash, or switch to pick up.",
      );
    }

    const notes = String(body.notes ?? "")
      .trim()
      .slice(0, 300);

    const subtotal = Math.round(
      fulfillment.price + pieces.reduce((s, p) => s + p.subtotal, 0),
    );
    const total = totalOf(subtotal, settings.discountPercent);
    const discountLabel =
      settings.discountPercent > 0
        ? settings.discountLabel || `${settings.discountPercent}% off`
        : "";

    const supabase = createClient(await cookies());
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const prefixRow = await supabase
      .from("shop_settings")
      .select("value")
      .eq("key", "ORDER_CODE_PREFIX")
      .maybeSingle();
    const prefix = prefixRow.data?.value || "BDF";

    const first = pieces[0];

    // Generate a code and insert; retry on a rare same-moment collision.
    let code = "";
    let inserted = false;
    let lastError = "";
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const { data: nextCode, error: codeError } = await supabase.rpc(
        "shop_next_code",
        { p_prefix: prefix },
      );
      if (codeError || !nextCode) {
        lastError = codeError?.message ?? "code generation failed";
        break;
      }
      code = nextCode as string;

      const { error } = await supabase.from("orders").insert({
        user_id: user?.id ?? null,
        code,
        customer_name: customerName,
        customer_email: user?.email ?? null,
        contact,
        fulfillment: fulfillment.value,
        // legacy single-piece columns carry the first piece for list views
        merch: first.merch,
        color: first.color,
        bead_name: first.beadName || null,
        charm: first.design,
        letter_size: first.size,
        bead_mix: first.bead,
        addons: first.addons,
        pieces,
        piece_count: pieces.length,
        payment: payment.value,
        notes: notes || null,
        design: { ...body, pieces }, // full submission snapshot
        subtotal,
        discount_label: discountLabel || null,
        total,
        payment_status: "Unpaid",
      });
      if (!error) {
        inserted = true;
      } else if (error.code === "23505") {
        // unique_violation on code — someone ordered in the same instant
        lastError = error.message;
      } else {
        lastError = error.message;
        break;
      }
    }
    if (!inserted) {
      console.error("[order] insert failed:", lastError);
      return fail("That did not save. Try again.", 500);
    }

    const orderedOn = new Date().toLocaleDateString("en-PH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    void notifyShop(
      `New ${settings.businessName} order — ${code}`,
      [
        `Code: ${code}`,
        `Pieces: ${pieces.length}`,
        ...pieces.map(
          (p, i) =>
            `  ${i + 1}. ${dotted(p.merch, p.beadName && `"${p.beadName}"`, p.color, p.size ?? undefined, p.bead ?? undefined)}` +
            (p.addons.length ? ` + ${p.addons.join(", ")}` : "") +
            ` — ${formatMoney(settings.currency, p.subtotal)}`,
        ),
        `For: ${customerName} (${contact})`,
        `Collection: ${fulfillment.value}`,
        `Payment: ${payment.value}`,
        `Total: ${formatMoney(settings.currency, total)}` +
          (discountLabel
            ? ` (${discountLabel}, was ${formatMoney(settings.currency, subtotal)})`
            : ""),
        notes ? `Notes: ${notes}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

    return NextResponse.json({
      ok: true,
      code,
      total,
      subtotal,
      discountLabel,
      status: "Unpaid",
      orderedOn,
      pieces,
    });
  } catch (e) {
    return fail(
      e instanceof Error ? e.message : "That did not save. Try again.",
    );
  }
}
