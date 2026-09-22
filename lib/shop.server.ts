import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  CATEGORIES,
  type Category,
  type ShopBootstrap,
  type ShopOption,
  type ShopOptions,
} from "./shop";

type OptionRow = {
  id: string;
  category: Category;
  value: string;
  price: number;
  active: boolean;
  note: string;
  style: string;
  qr: string | null;
  plain: boolean;
  sort: number;
};

type SettingRow = { key: string; value: string };

function isOn(value: string | undefined): boolean {
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "") return false;
  return !["FALSE", "NO", "N", "0", "OFF", "CLOSED"].includes(s);
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function groupOptions(rows: OptionRow[]): ShopOptions {
  const out = Object.fromEntries(
    CATEGORIES.map((c) => [c, [] as ShopOption[]]),
  ) as ShopOptions;
  for (const r of rows) {
    if (!out[r.category]) continue;
    out[r.category].push({
      id: r.id,
      category: r.category,
      value: r.value,
      price: Number(r.price) || 0,
      active: !!r.active,
      note: r.note ?? "",
      style: r.style ?? "",
      qr: r.qr || null,
      plain: !!r.plain,
      sort: r.sort ?? 0,
    });
  }
  return out;
}

/** Raw settings map (keyed like the old Sheet: BUSINESS_NAME, …). */
export async function getRawSettings(): Promise<Record<string, string>> {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase.from("shop_settings").select("key, value");
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as SettingRow[]) out[r.key] = r.value;
  return out;
}

/** Everything the wizard needs to boot: open flag, settings, active options. */
export async function getShopBootstrap(): Promise<ShopBootstrap> {
  const supabase = createClient(await cookies());
  const [settingsRes, optionsRes] = await Promise.all([
    supabase.from("shop_settings").select("key, value"),
    supabase
      .from("shop_options")
      .select("id, category, value, price, active, note, style, qr, plain, sort")
      .order("sort", { ascending: true }),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (optionsRes.error) throw new Error(optionsRes.error.message);

  const s: Record<string, string> = {};
  for (const r of (settingsRes.data ?? []) as SettingRow[]) s[r.key] = r.value;

  return {
    open: isOn(s.ACCEPT_ORDERS),
    settings: {
      businessName: s.BUSINESS_NAME || "BEADOOF",
      tagline: s.TAGLINE || "",
      currency: s.CURRENCY || "PHP ",
      maxNameLength: num(s.MAX_NAME_LENGTH, 14),
      pricePerLetter: num(s.PRICE_PER_LETTER, 0),
      discountLabel: s.DISCOUNT_LABEL || "",
      discountPercent: num(s.DISCOUNT_PERCENT, 0),
      gcashName: s.GCASH_NAME || "",
      gcashNumber: s.GCASH_NUMBER || "",
      qrDynamic: isOn(s.QR_DYNAMIC_AMOUNT),
      pickupNote: s.PICKUP_NOTE || "",
      preorderNote: s.PREORDER_NOTE || "",
      closedMessage:
        s.CLOSED_MESSAGE || "Orders are closed right now. Check back soon.",
    },
    options: groupOptions((optionsRes.data ?? []) as OptionRow[]),
  };
}
