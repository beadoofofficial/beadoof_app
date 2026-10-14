import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  CATEGORIES,
  type Category,
  type PremadeDesign,
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
  const [settingsRes, optionsRes, designsRes] = await Promise.all([
    supabase.from("shop_settings").select("key, value"),
    supabase
      .from("shop_options")
      .select("id, category, value, price, active, note, style, qr, plain, sort")
      .order("sort", { ascending: true }),
    supabase
      .from("shop_designs")
      .select(
        "id, name, note, merch, bead_name, charm, letter_size, bead_mix, addons, color, image_url, active, sort, set:shop_sets(name, sort)",
      )
      .eq("active", true)
      .order("sort", { ascending: true }),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (optionsRes.error) throw new Error(optionsRes.error.message);
  // a missing shop_designs table (migration not run yet) just means no catalogue
  const designs: PremadeDesign[] = (designsRes.data ?? [])
    .map((d) => ({
      id: d.id as string,
      name: (d.name as string) ?? "",
      note: (d.note as string) ?? "",
      merch: (d.merch as string) || undefined,
      beadName: (d.bead_name as string) || undefined,
      design: (d.charm as string) || undefined,
      size: (d.letter_size as string) || undefined,
      bead: (d.bead_mix as string) || undefined,
      addons: Array.isArray(d.addons) ? (d.addons as string[]) : [],
      color: (d.color as string) || undefined,
      // the joined set comes back as an object (to-one FK), but the client
      // types it loosely — accept either shape
      ...(() => {
        const rel = (Array.isArray(d.set) ? d.set[0] : d.set) as
          | { name?: string; sort?: number }
          | null
          | undefined;
        return {
          setName: rel?.name ?? "",
          setSort: Number(rel?.sort) || 0,
        };
      })(),
      imageUrl: (d.image_url as string) || null,
      active: !!d.active,
      sort: Number(d.sort) || 0,
    }))
    // a design without an item has no recipe to price — hide it
    .filter((d) => !!d.merch);

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
    designs,
  };
}
