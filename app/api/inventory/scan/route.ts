import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { InventoryItem } from "@/lib/inventory";

const TABLE = "bead_inventory";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { barcode?: string; delta?: number }
    | null;
  const barcode = body?.barcode?.trim();
  const delta = Number.isFinite(body?.delta) ? Number(body!.delta) : 1;

  if (!barcode) {
    return NextResponse.json({ error: "barcode required" }, { status: 400 });
  }

  const supabase = createClient(await cookies());
  const { data: existing, error: lookupErr } = await supabase
    .from(TABLE)
    .select("*")
    .eq("barcode", barcode)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json(
      { found: false, barcode },
      { status: 404 },
    );
  }

  const nextQty = Math.max(0, (existing.quantity ?? 0) + delta);
  const { data: updated, error: updateErr } = await supabase
    .from(TABLE)
    .update({ quantity: nextQty })
    .eq("id", existing.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    found: true,
    item: updated as InventoryItem,
    delta,
  });
}
