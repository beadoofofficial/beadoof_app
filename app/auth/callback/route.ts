import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

// Supabase email-confirmation / password-reset redirect target. The link
// contains ?code=... ; we exchange it for a session cookie and forward to
// `next` (or "/").
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    const err = new URL("/sign-in", url.origin);
    err.searchParams.set("error", "missing_code");
    return NextResponse.redirect(err);
  }

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const err = new URL("/sign-in", url.origin);
    err.searchParams.set("error", error.message);
    return NextResponse.redirect(err);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
