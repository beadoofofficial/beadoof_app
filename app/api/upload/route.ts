import { NextResponse } from "next/server";
import { uploadBase64 } from "../../../lib/storage.server";

// Admin photo uploads (inventory bead pictures) — stored in the Supabase
// Storage "uploads" bucket under inventory/, returned as a public URL.

export async function POST(req: Request) {
  const { base64, filename } = await req.json();
  if (!base64 || !filename)
    return NextResponse.json({ error: "missing" }, { status: 400 });

  const safe = String(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  try {
    const path = await uploadBase64(
      "inventory",
      `${Date.now()}-${safe}`,
      String(base64),
    );
    return NextResponse.json({ path });
  } catch (e) {
    console.error("[upload] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "upload failed" },
      { status: 500 },
    );
  }
}
