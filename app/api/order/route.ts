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
  subtotalOf,
  totalOf,
  type ShopOptions,
  type WizardSelections,
} from "@/lib/shop";

// Port of the Apps Script submitOrder(): every choice is re-validated against
// the live options catalog and re-priced server-side, so the client's running
// total is never trusted.

type OrderBody = WizardSelections;

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
    throw new Error(`That ${label} isn't available any more. Pick another one.`);
  }
  return o;
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
    const fulfillment = requireOption(options, "FULFILLMENT", body.fulfillment, "delivery method");
    const merch = requireOption(options, "MERCH", body.merch, "item");
    const color = requireOption(options, "COLOR", body.color, "colour");
    const design = requireOption(options, "DESIGN", body.design, "design");
    const payment = requireOption(options, "PAYMENT", body.payment, "payment method");

    // Items ticked "No beaded name" skip the name, letter size and bead mix steps.
    const plain = !!merch.plain;
    const size = plain ? null : requireOption(options, "SIZE", body.size, "letter size");
    const bead = plain ? null : requireOption(options, "BEAD", body.bead, "bead style");

    const beadName = plain ? "" : cleanName(body.beadName ?? "").trim();
    if (!plain) {
      if (!beadName) throw new Error("Type the name we should bead.");
      if (beadName.length > settings.maxNameLength) {
        throw new Error(`Names can be up to ${settings.maxNameLength} characters.`);
      }
    }

    const customerName = String(body.customerName ?? "").trim().replace(/\s+/g, " ");
    if (customerName.length < 2) {
      throw new Error("Add the name we should look for when you collect.");
    }

    const contact = String(body.contact ?? "").trim();
    if (contact.replace(/\D/g, "").length < 7) {
      throw new Error("Add a mobile number we can reach you on.");
    }

    const addons = (Array.isArray(body.addons) ? body.addons : []).map(
      (a) => requireOption(options, "ADDON", a, "add-on").value,
    );

    const isCash = /cash/i.test(payment.value) && !/gcash/i.test(payment.value);
    if (isCash && !/pick/i.test(fulfillment.value)) {
      throw new Error("Cash works for pick up only. Choose GCash, or switch to pick up.");
    }

    const sel: WizardSelections = {
      fulfillment: fulfillment.value,
      merch: merch.value,
      color: color.value,
      beadName,
      design: design.value,
      size: size?.value,
      bead: bead?.value,
      addons,
      customerName,
      contact,
      notes: String(body.notes ?? "").trim().slice(0, 300),
      payment: payment.value,
    };

    const subtotal = subtotalOf(options, sel, settings.pricePerLetter);
    const total = totalOf(subtotal, settings.discountPercent);
    const discountLabel =
      settings.discountPercent > 0
        ? settings.discountLabel || `${settings.discountPercent}% off`
        : "";

    const supabase = createClient(await cookies());
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const rawSettings = await supabase
      .from("shop_settings")
      .select("value")
      .eq("key", "ORDER_CODE_PREFIX")
      .maybeSingle();
    const prefix = rawSettings.data?.value || "BDF";

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
        merch: merch.value,
        color: color.value,
        bead_name: beadName || null,
        charm: design.value,
        letter_size: size?.value ?? null,
        bead_mix: bead?.value ?? null,
        addons,
        payment: payment.value,
        notes: sel.notes || null,
        design: sel, // full selections snapshot
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
        `Item: ${dotted(merch.value, size?.value)}`,
        beadName ? `Name: ${beadName}` : "",
        `Colour: ${dotted(color.value, bead?.value)}`,
        `Design: ${design.value}`,
        `Add-ons: ${addons.join(", ") || "none"}`,
        `For: ${customerName} (${contact})`,
        `Collection: ${fulfillment.value}`,
        `Payment: ${payment.value}`,
        `Total: ${formatMoney(settings.currency, total)}` +
          (discountLabel ? ` (${discountLabel}, was ${formatMoney(settings.currency, subtotal)})` : ""),
        sel.notes ? `Notes: ${sel.notes}` : "",
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
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "That did not save. Try again.");
  }
}
