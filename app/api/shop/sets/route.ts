import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// Managed list of pre-made design sets/categories. Designs reference a set
// by id, so renames propagate and deleting a set just ungroups its designs
// (FK is on delete set null). Same open prototype posture as the rest.

const TABLE = "shop_sets";

export async function GET() {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, name, sort")
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    name?: string;
    sort?: number;
  } | null;
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const row = {
    name: body.name.trim(),
    sort: Math.round(Number(body.sort) || 0),
  };

  const supabase = createClient(await cookies());
  const query = body.id
    ? supabase.from(TABLE).update(row).eq("id", body.id).select().single()
    : supabase.from(TABLE).insert(row).select().single();

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
