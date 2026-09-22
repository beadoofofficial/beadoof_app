import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// Port of the Apps Script lookupOrder(): guests look an order up by its code.
// Goes through the shop_lookup_order security-definer RPC so no blanket
// select policy is needed on the orders table.

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
  if (!code) {
    return NextResponse.json({ ok: false, error: "Type your order code." });
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("shop_lookup_order", {
    p_code: code,
  });

  if (error) {
    console.error("[track] lookup failed:", error.message);
    return NextResponse.json(
      { ok: false, error: "That did not work. Try again in a moment." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({
      ok: false,
      error: "We can't find that code. Check it and try again.",
    });
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
