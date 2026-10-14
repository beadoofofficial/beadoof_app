import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// Pre-made designs editor API. A design is a saved recipe over the catalog —
// item, optional name-on-piece, charm, letter size, bead mix, add-ons; its
// price is computed from the options, never stored. Same open prototype
// posture as the options editor; tighten before production.

const TABLE = "shop_designs";
const FIELDS =
  "id, name, note, merch, bead_name, charm, letter_size, bead_mix, addons, color, set_id, image_url, active, sort";

type DesignBody = {
  id?: string;
  name?: string;
  note?: string;
  merch?: string;
  bead_name?: string;
  charm?: string;
  letter_size?: string | null;
  bead_mix?: string | null;
  addons?: string[];
  color?: string | null;
  set_id?: string | null;
  image_url?: string | null;
  active?: boolean;
  sort?: number;
};

export async function GET() {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from(TABLE)
    .select(FIELDS)
    .order("sort", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as DesignBody | null;
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.merch?.trim()) {
    return NextResponse.json({ error: "pick an item" }, { status: 400 });
  }

  const row = {
    name: body.name.trim(),
    note: body.note ?? "",
    merch: body.merch.trim(),
    bead_name: body.bead_name?.trim() ?? "",
    charm: body.charm?.trim() ?? "",
    letter_size: body.letter_size?.trim() || null,
    bead_mix: body.bead_mix?.trim() || null,
    addons: Array.isArray(body.addons)
      ? body.addons.filter((a): a is string => typeof a === "string" && !!a)
      : [],
    color: body.color?.trim() || null,
    set_id: body.set_id || null,
    image_url: body.image_url?.trim() || null,
    active: body.active ?? true,
    sort: Math.round(Number(body.sort) || 0),
  };

  const supabase = createClient(await cookies());
  const query = body.id
    ? supabase.from(TABLE).update(row).eq("id", body.id).select(FIELDS).single()
    : supabase.from(TABLE).insert(row).select(FIELDS).single();

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: body.id ? 200 : 201 });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = createClient(await cookies());
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
