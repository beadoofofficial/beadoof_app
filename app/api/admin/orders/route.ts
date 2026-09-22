import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getUser, isAdminEmail } from "@/lib/auth.server";

// Orders dashboard API — the replacement for reading the orders sheet.
// When ADMIN_EMAILS is set, only those signed-in users may call this; when it
// is not set (fresh prototype), any signed-in user is allowed, matching the
// open posture of the other admin APIs.

async function assertAdmin(): Promise<NextResponse | null> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }
  const gated = (process.env.ADMIN_EMAILS ?? "").trim().length > 0;
  if (gated && !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "admins only" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("shop_admin_orders");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: Request) {
  const denied = await assertAdmin();
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    payment_status?: string;
    creating_status?: string;
    delivery_date?: string;
  } | null;
  const hasField =
    body?.payment_status !== undefined ||
    body?.creating_status !== undefined ||
    body?.delivery_date !== undefined;
  if (!body?.id || !hasField) {
    return NextResponse.json(
      { error: "id and at least one field required" },
      { status: 400 },
    );
  }
  if (
    body.delivery_date !== undefined &&
    body.delivery_date !== "" &&
    !/^\d{4}-\d{2}-\d{2}$/.test(body.delivery_date)
  ) {
    return NextResponse.json(
      { error: "delivery_date must be YYYY-MM-DD or empty" },
      { status: 400 },
    );
  }

  const supabase = createClient(await cookies());
  const { error } = await supabase.rpc("shop_admin_update_order", {
    p_id: body.id,
    p_payment_status: body.payment_status ?? null,
    p_creating_status: body.creating_status ?? null,
    p_delivery_date: body.delivery_date ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
