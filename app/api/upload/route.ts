import { NextResponse } from "next/server";
import { saveBase64Image } from "../../../lib/storage.server";

export async function POST(req: Request) {
  const { base64, filename } = await req.json();
  if (!base64 || !filename)
    return NextResponse.json({ error: "missing" }, { status: 400 });
  const path = saveBase64Image(base64, filename);
  return NextResponse.json({ path });
}
