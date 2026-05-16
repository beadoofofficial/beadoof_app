import { NextResponse } from "next/server";
import { readItems, addOrUpdateItem } from "@/lib/db.server";
import type { Item } from "@/lib/types";

export async function GET() {
  const items = readItems();
  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const body = await req.json();
  const item = body as Item;
  if (!item?.id)
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  addOrUpdateItem(item);
  return NextResponse.json({ ok: true });
}
