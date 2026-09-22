import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// Admin settings API — the replacement for the "Shop settings" Sheet tab.

type SettingRow = { key: string; value: string; label: string; help: string };

export async function GET() {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("shop_settings")
    .select("key, value, label, help")
    .order("key", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as SettingRow[]);
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { key: string; value: string }[]
    | null;
  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json(
      { error: "expected [{key, value}, …]" },
      { status: 400 },
    );
  }

  const supabase = createClient(await cookies());
  for (const { key, value } of body) {
    if (!key?.trim()) continue;
    const { error } = await supabase
      .from("shop_settings")
      .update({ value: String(value ?? "") })
      .eq("key", key.trim());
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
