import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { InventoryItem } from "@/lib/inventory";

const TABLE = "bead_inventory";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data as InventoryItem);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const allowed = [
    "name",
    "color_hex",
    "is_assorted",
    "stock",
    "quantity",
    "low_stock_threshold",
    "size_mm",
    "price_cents",
    "image_url",
    "notes",
    "barcode",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  // If marking as assorted, clear color_hex for consistency.
  if (patch.is_assorted === true) patch.color_hex = null;
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });

  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as InventoryItem);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = createClient(await cookies());
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
