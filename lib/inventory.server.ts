import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { InventoryItem, ItemCategory } from "./inventory";

export type InventoryQuery = {
  category?: ItemCategory;
};

export async function getInventory(
  opts: InventoryQuery = {},
): Promise<InventoryItem[]> {
  // cookies() must be called outside the try/catch so the Next.js dynamic-
  // usage sentinel can propagate and correctly mark this route as dynamic.
  const supabase = createClient(await cookies());
  try {
    let query = supabase
      .from("bead_inventory")
      .select("*")
      .order("created_at", { ascending: true });
    if (opts.category) {
      query = query.eq("category", opts.category);
    }
    const { data, error } = await query;
    if (error) {
      console.warn("[inventory] fetch failed:", error.message);
      return [];
    }
    return (data ?? []) as InventoryItem[];
  } catch (e) {
    console.warn("[inventory] fetch threw:", e);
    return [];
  }
}
