import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isAdminEmail } from "@/lib/auth.server";

export default async function ProfilePage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const isAdmin = isAdminEmail(user.email);
  const joinedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString()
    : "—";
  const lastSignIn = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString()
    : "—";

  const { count: orderCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true });

  return (
    <div className="min-h-screen bg-[#faf3ea] text-foreground">
      <div className="max-w-md mx-auto p-4 md:p-6 space-y-4 pb-24">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your profile</h1>
            <p className="text-xs text-[#7a6a60]">
              Signed in with email + password
            </p>
          </div>
          <Link href="/" className="text-sm text-[#7a6a60] underline">
            ← Home
          </Link>
        </header>

        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#9a8478]">
              Email
            </div>
            <div className="text-sm font-medium break-all">{user.email}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#9a8478]">
                Joined
              </div>
              <div>{joinedDate}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[#9a8478]">
                Last sign-in
              </div>
              <div>{lastSignIn}</div>
            </div>
          </div>
          {isAdmin && (
            <div className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#5a3a24] text-white">
              ★ Admin
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="text-base font-bold">Activity</h2>
          <div className="flex items-center justify-between">
            <span className="text-sm">Orders placed</span>
            <span className="font-bold tabular-nums">{orderCount ?? 0}</span>
          </div>
          <Link
            href="/my-orders"
            className="block w-full text-center bg-[#fbf1ea] text-[#5a3a24] py-2 rounded-lg text-sm font-semibold"
          >
            View my orders →
          </Link>
          {isAdmin && (
            <Link
              href="/admin/inventory"
              className="block w-full text-center bg-[#5a3a24] text-white py-2 rounded-lg text-sm font-semibold"
            >
              Admin: manage inventory →
            </Link>
          )}
        </section>

        <form
          action="/auth/signout"
          method="post"
          suppressHydrationWarning
        >
          <button
            type="submit"
            className="w-full bg-white border border-red-200 text-red-700 py-2.5 rounded-xl font-semibold"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
