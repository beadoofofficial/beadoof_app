import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { CATEGORIES, type Category, type ShopOption } from "@/lib/shop";

// Admin catalog editor API — the replacement for editing the Sheet tabs.
// Same open prototype posture as /api/inventory; tighten before production.

const TABLE = "shop_options";

export async function GET() {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, category, value, price, active, note, style, qr, plain, sort")
    .order("category", { ascending: true })
    .order("sort", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as ShopOption[]);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<ShopOption> | null;
  const category = body?.category as Category | undefined;
  if (!body?.value?.trim() || !category || !CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: "category and value are required" },
      { status: 400 },
    );
  }

  const row = {
    category,
    value: body.value.trim(),
    price: Math.round(Number(body.price) || 0),
    active: body.active ?? true,
    note: body.note ?? "",
    style: body.style ?? "",
    qr: body.qr?.trim() || null,
    plain: body.plain ?? false,
    sort: Math.round(Number(body.sort) || 0),
  };

  const supabase = createClient(await cookies());
  const query = body.id
    ? supabase.from(TABLE).update(row).eq("id", body.id).select().single()
    : supabase.from(TABLE).insert(row).select().single();

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as ShopOption, { status: body.id ? 200 : 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = createClient(await cookies());
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
