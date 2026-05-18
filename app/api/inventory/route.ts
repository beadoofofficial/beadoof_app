import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { InventoryDraft, InventoryItem } from "@/lib/inventory";

const TABLE = "bead_inventory";

export async function GET() {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as InventoryItem[]);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as InventoryDraft | null;
  if (!body?.barcode?.trim() || !body?.name?.trim()) {
    return NextResponse.json(
      { error: "barcode and name are required" },
      { status: 400 },
    );
  }

  const supabase = createClient(await cookies());
  const isAssorted = body.is_assorted ?? false;
  const row = {
    barcode: body.barcode.trim(),
    name: body.name.trim(),
    category: body.category ?? "bead",
    is_assorted: isAssorted,
    is_lettered: body.is_lettered ?? false,
    variant_colors: Array.isArray(body.variant_colors)
      ? body.variant_colors.filter(
          (c): c is string => typeof c === "string" && c.length > 0,
        )
      : [],
    color_hex: isAssorted ? null : (body.color_hex ?? null),
    stock: body.stock ?? "in",
    quantity: body.quantity ?? 1,
    low_stock_threshold: body.low_stock_threshold ?? 5,
    size_mm: body.size_mm ?? 8,
    max_per_design: body.max_per_design ?? null,
    price_cents: body.price_cents ?? null,
    image_url: body.image_url ?? null,
    notes: body.notes ?? null,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as InventoryItem, { status: 201 });
}
