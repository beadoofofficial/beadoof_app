import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { publicUploadUrl, uploadToBucket } from "@/lib/storage.server";

// Port of the Apps Script submitProof(): a customer attaches their payment
// screenshot to an order by its code. The file lands in the Supabase Storage
// "uploads" bucket (proofs/ folder) and the shop_attach_proof RPC links it
// on the order row and nudges the payment status.

const MAX_PROOF_BYTES = 8 * 1024 * 1024;

type ProofBody = { code?: string; dataUri?: string };

export async function POST(req: Request) {
  let body: ProofBody;
  try {
    body = (await req.json()) as ProofBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ ok: false, error: "We need your order code first." });
  }

  const match = String(body.dataUri ?? "").match(
    /^data:([a-z0-9.+/-]+);base64,(.+)$/i,
  );
  if (!match) {
    return NextResponse.json({
      ok: false,
      error: "That file could not be read. Try a screenshot instead.",
    });
  }

  const type = match[1].toLowerCase();
  if (!type.startsWith("image/") && type !== "application/pdf") {
    return NextResponse.json({
      ok: false,
      error: "Send a photo, a screenshot or a PDF.",
    });
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) {
    return NextResponse.json({
      ok: false,
      error: "That file came through empty. Try again.",
    });
  }
  if (bytes.length > MAX_PROOF_BYTES) {
    return NextResponse.json({
      ok: false,
      error: "That file is too big. A screenshot of the payment is plenty.",
    });
  }

  const ext =
    type === "application/pdf"
      ? "pdf"
      : (type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const safeCode = code.replace(/[^A-Z0-9-]/g, "");
  const path = `proofs/proof-${safeCode}-${Date.now()}.${ext}`;

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("shop_attach_proof", {
    p_code: code,
    // The RPC is the gatekeeper (missing code, too many proofs), so probe it
    // with the URL the file is about to get — the public URL of a bucket
    // path is deterministic — and only upload once it has accepted. A failed
    // upload leaves a dangling URL, but the customer's retry overwrites it.
    p_url: publicUploadUrl(path),
  });

  if (error) {
    console.error("[proof] attach failed:", error.message);
    return NextResponse.json(
      { ok: false, error: "That did not send. Try again in a moment." },
      { status: 500 },
    );
  }

  const result = data as { ok: boolean; error?: string; message?: string };
  if (!result?.ok) return NextResponse.json(result);

  try {
    await uploadToBucket(path, bytes, type);
  } catch (e) {
    console.error("[proof] upload failed:", e);
    return NextResponse.json(
      { ok: false, error: "That did not send. Try again in a moment." },
      { status: 500 },
    );
  }

  return NextResponse.json(result);
}
