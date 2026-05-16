import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { InventoryItem } from "./inventory";

export async function getInventory(): Promise<InventoryItem[]> {
  // cookies() must be called outside the try/catch so the Next.js dynamic-
  // usage sentinel can propagate and correctly mark this route as dynamic.
  const supabase = createClient(await cookies());
  try {
    const { data, error } = await supabase
      .from("bead_inventory")
      .select("*")
      .order("created_at", { ascending: true });
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
