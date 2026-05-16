import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

type OrderRow = {
  id: string;
  customer_name: string;
  delivery_type: "pickup" | "courier";
  total_beads: number;
  total_length_mm: number;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-blue-100 text-blue-800",
  },
  in_progress: {
    label: "In progress",
    className: "bg-indigo-100 text-indigo-800",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-800",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-100 text-red-800",
  },
};

export default async function MyOrdersPage() {
  const supabase = createClient(await cookies());
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, customer_name, delivery_type, total_beads, total_length_mm, status, created_at",
    )
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as OrderRow[];

  return (
    <div className="min-h-screen bg-[#faf3ea] text-foreground">
      <div className="max-w-md mx-auto p-4 md:p-6 space-y-4 pb-24">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My orders</h1>
            <p className="text-xs text-[#7a6a60]">
              {orders.length === 0
                ? "Nothing yet"
                : `${orders.length} order${orders.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <Link href="/" className="text-sm text-[#7a6a60] underline">
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
            <div className="text-4xl">🪡</div>
            <p className="text-sm text-[#7a6a60]">
              You haven&apos;t placed any orders yet. Build a design on the home
              page, then tap <strong>Send order</strong> to place your first.
            </p>
            <Link
              href="/"
              className="inline-block bg-[#5a3a24] text-white px-4 py-2 rounded-full text-sm font-semibold"
            >
              Start designing
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => {
              const status = STATUS_LABEL[o.status] ?? {
                label: o.status,
                className: "bg-gray-100 text-gray-700",
              };
              const lengthIn = (o.total_length_mm / 25.4).toFixed(1);
              return (
                <li
                  key={o.id}
                  className="bg-white rounded-2xl shadow-sm p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">
                        {o.customer_name}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#7a6a60] truncate">
                      {new Date(o.created_at).toLocaleString()} ·{" "}
                      {o.delivery_type} · {o.total_beads} beads · {lengthIn} in
                    </div>
                  </div>
                  <span className="text-[#9a8478] shrink-0" aria-hidden>
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
