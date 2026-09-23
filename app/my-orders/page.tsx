import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

type OrderRow = {
  id: string;
  code: string | null;
  customer_name: string;
  merch: string | null;
  bead_name: string | null;
  fulfillment: string | null;
  total: number | null;
  payment_status: string | null;
  piece_count: number | null;
  created_at: string;
};

function statusClass(status: string): string {
  if (/^paid$/i.test(status)) return "bg-emerald-100 text-emerald-800";
  if (/proof/i.test(status)) return "bg-aqua/25 text-[#0e6d76]";
  if (/unpaid/i.test(status)) return "bg-lemon/60 text-[#5a4300]";
  return "bg-cord/40 text-ink/70";
}

export default async function MyOrdersPage() {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, code, customer_name, merch, bead_name, fulfillment, total, payment_status, piece_count, created_at",
    )
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as OrderRow[];

  return (
    <div className="min-h-screen bg-paper font-shop text-ink">
      <div className="max-w-md mx-auto p-4 md:p-6 space-y-4 pb-24">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold">My orders</h1>
            <p className="text-xs text-shop-muted">
              {orders.length === 0
                ? "Nothing yet"
                : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Link href="/" className="text-sm text-shop-muted underline">
            ← Home
          </Link>
        </header>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-3 text-xs">
            Couldn&apos;t load orders: {error.message}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center space-y-3">
            <div className="text-4xl">📿</div>
            <p className="text-sm text-shop-muted">
              You haven&apos;t placed any orders yet — orders placed while
              signed in show up here. You can also check any order by its code
              on the home page.
            </p>
            <Link
              href="/"
              className="inline-block rounded-full bg-shop-pink px-4 py-2 font-display text-sm font-medium text-white shadow-[0_3px_0_#c93a74]"
            >
              Start an order
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => {
              const status = o.payment_status ?? "Unpaid";
              return (
                <li
                  key={o.id}
                  className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">
                        {o.code ?? o.customer_name}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${statusClass(status)}`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="text-[11px] text-shop-muted truncate">
                      {new Date(o.created_at).toLocaleString()}
                      {o.merch ? ` · ${o.merch}` : ""}
                      {(o.piece_count ?? 1) > 1
                        ? ` +${(o.piece_count ?? 1) - 1} more`
                        : ""}
                      {o.bead_name ? ` · “${o.bead_name}”` : ""}
                      {o.fulfillment ? ` · ${o.fulfillment}` : ""}
                      {typeof o.total === "number" ? ` · PHP ${o.total}` : ""}
                    </div>
                  </div>
                  <span className="text-shop-muted shrink-0" aria-hidden>
                    ›
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
