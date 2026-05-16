import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import type { User } from "@supabase/supabase-js";

/** Get the currently signed-in Supabase user, or null. */
export async function getUser(): Promise<User | null> {
  const supabase = createClient(await cookies());
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

/** Comma-separated list of admin emails from ADMIN_EMAILS env var. */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** Convenience: is the currently-signed-in user an admin? */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getUser();
  return isAdminEmail(user?.email);
}
