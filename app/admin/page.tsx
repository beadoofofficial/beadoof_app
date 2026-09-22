"use client";

// Admin orders dashboard — the replacement for the orders sheet. Check the
// details, open the proof of payment, move the payment status along, and
// track making + delivery the way the sheet's CREATING STATUS and
// Date delivery columns did.

import { useEffect, useMemo, useState } from "react";
import { dotted } from "@/lib/shop";

type OrderPiece = {
  merch: string;
  color: string;
  beadName: string;
  design: string;
  size: string | null;
  bead: string | null;
  addons: string[];
  subtotal: number;
};

type Order = {
  id: string;
  code: string | null;
  created_at: string;
  customer_name: string;
  contact: string | null;
  customer_email: string | null;
  merch: string | null;
  bead_name: string | null;
  color: string | null;
  charm: string | null;
  letter_size: string | null;
  bead_mix: string | null;
  addons: string[] | null;
  pieces: OrderPiece[] | null;
  piece_count: number | null;
  fulfillment: string | null;
  payment: string | null;
  notes: string | null;
  subtotal: number | null;
  discount_label: string | null;
  total: number | null;
  payment_status: string | null;
  creating_status: string | null;
  delivery_date: string | null;
  proof_url: string | null;
  proof_at: string | null;
};

const PAY_STATUSES = ["Unpaid", "Proof sent", "Paid"];
const MAKE_STATUSES = ["Not started", "In progress", "Done"];

function payChip(status: string): string {
  if (/^paid$/i.test(status)) return "bg-emerald-100 text-emerald-800";
  if (/proof/i.test(status)) return "bg-sky-100 text-sky-800";
  if (/unpaid/i.test(status)) return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

function makeChip(status: string): string {
  if (/done/i.test(status)) return "bg-emerald-100 text-emerald-800";
  if (/progress/i.test(status)) return "bg-violet-100 text-violet-800";
  return "bg-gray-100 text-gray-600";
}

const selectCls =
  "border border-[#e4d3c4] rounded-lg px-2 py-1.5 text-xs bg-white text-[#3b2b22] disabled:opacity-50";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/orders")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "load failed");
        if (!cancelled) setOrders(data as Order[]);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load orders.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function patchOrder(order: Order, patch: Partial<Order>) {
    const previous = order;
    setSavingId(order.id);
    setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, ...patch } : o)));
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: order.id, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "save failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
      setOrders((os) => os.map((o) => (o.id === order.id ? previous : o)));
    } finally {
      setSavingId(null);
    }
  }

  const stats = useMemo(() => {
    const unpaid = orders.filter(
      (o) => !/^paid$/i.test(o.payment_status ?? "Unpaid"),
    );
    const toMake = orders.filter((o) => !/done/i.test(o.creating_status ?? ""));
    const paidTotal = orders
      .filter((o) => /^paid$/i.test(o.payment_status ?? ""))
      .reduce((s, o) => s + (o.total ?? 0), 0);
    return { all: orders.length, unpaid: unpaid.length, toMake: toMake.length, paidTotal };
  }, [orders]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: orders.length };
    for (const s of PAY_STATUSES) {
      c[s] = orders.filter((o) => (o.payment_status ?? "Unpaid") === s).length;
    }
    return c;
  }, [orders]);

  const shown = orders.filter((o) => {
    if (filter !== "All" && (o.payment_status ?? "Unpaid") !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [o.code, o.customer_name, o.bead_name, o.contact, o.merch]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-[family-name:var(--font-fredoka)] text-2xl font-semibold text-[#3b2b22]">
          Orders
        </h1>
        <span className="text-xs text-[#9a8478]">
          Orders land here the moment someone finishes the form.
        </span>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">
          {error}
          {/sign in/i.test(error) && (
            <>
              {" "}
              <a href="/sign-in" className="underline font-semibold">
                Sign in
              </a>
            </>
          )}
        </div>
      )}

      {/* stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          ["All orders", String(stats.all)],
          ["Awaiting payment", String(stats.unpaid)],
          ["Still to make", String(stats.toMake)],
          ["Paid so far", `PHP ${stats.paidTotal.toLocaleString()}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-2xl shadow-sm px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-[#9a8478]">
              {label}
            </div>
            <div className="font-[family-name:var(--font-fredoka)] text-xl font-semibold text-[#3b2b22]">
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {["All", ...PAY_STATUSES].map((s) => (
          <button
            key={s}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              filter === s
                ? "bg-[#5a3a24] text-white"
                : "bg-white text-[#5a4438] hover:bg-[#f0e4d6]"
            }`}
            onClick={() => setFilter(s)}
          >
            {s} ({counts[s] ?? 0})
          </button>
        ))}
        <input
          className="ml-auto border border-[#e4d3c4] rounded-full px-3.5 py-1.5 text-sm bg-white w-full sm:w-60"
          placeholder="Search code, name, mobile…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-sm text-[#7a6a60]">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-sm text-[#7a6a60]">
          {orders.length === 0
            ? "No orders yet — they show up here as soon as the first one is placed."
            : "Nothing matches that filter."}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((o) => {
            const pay = o.payment_status ?? "Unpaid";
            const make = o.creating_status ?? "Not started";
            const multi = (o.pieces?.length ?? 0) > 1;
            const piece = dotted(
              o.merch,
              o.bead_name && `“${o.bead_name}”`,
              o.color,
              o.letter_size,
              o.bead_mix,
            );
            const saving = savingId === o.id;
            return (
              <li
                key={o.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden"
              >
                {/* head row */}
                <div className="flex items-center gap-2 flex-wrap px-4 pt-3">
                  <span className="font-[family-name:var(--font-fredoka)] font-semibold text-[#3b2b22]">
                    {o.code ?? "(no code)"}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-bold ${payChip(pay)}`}
                  >
                    {pay}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-bold ${makeChip(make)}`}
                  >
                    {make}
                  </span>
                  {typeof o.total === "number" && (
                    <span className="ml-auto font-[family-name:var(--font-fredoka)] font-semibold text-[#5a3a24]">
                      PHP {o.total.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* details */}
                <div className="px-4 pb-3 pt-1.5 space-y-1">
                  <div className="text-sm">
                    <span className="font-semibold">{o.customer_name}</span>
                    <span className="text-[#7a6a60]">
                      {o.contact ? ` · ${o.contact}` : ""}
                      {o.customer_email ? ` · ${o.customer_email}` : ""}
                    </span>
                  </div>
                  {multi ? (
                    <ol className="list-none space-y-0.5 text-sm text-[#5a4438]">
                      {o.pieces!.map((p, i) => (
                        <li key={i}>
                          <span className="mr-1 inline-block w-4 text-[11px] text-[#9a8478]">
                            {i + 1}.
                          </span>
                          {dotted(
                            p.merch,
                            p.beadName && `“${p.beadName}”`,
                            p.color,
                            p.size ?? undefined,
                            p.bead ?? undefined,
                            p.addons.length
                              ? `+ ${p.addons.join(", ")}`
                              : undefined,
                          )}
                          <span className="ml-1 text-[11px] text-[#9a8478]">
                            PHP {p.subtotal.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    piece && (
                      <div className="text-sm text-[#5a4438]">{piece}</div>
                    )
                  )}
                  <div className="text-[12px] text-[#9a8478] flex gap-x-3 gap-y-0.5 flex-wrap">
                    <span>{new Date(o.created_at).toLocaleString()}</span>
                    {o.fulfillment && <span>{o.fulfillment}</span>}
                    {o.payment && <span>{o.payment}</span>}
                    {(o.addons?.length ?? 0) > 0 && (
                      <span>Add-ons: {o.addons!.join(", ")}</span>
                    )}
                    {o.discount_label && <span>{o.discount_label}</span>}
                  </div>
                  {o.notes && (
                    <div className="text-[12px] text-[#7a6a60] italic">
                      “{o.notes}”
                    </div>
                  )}
                </div>

                {/* controls */}
                <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 bg-[#fbf6ef] border-t border-[#f1e4d5]">
                  <label className="flex items-center gap-1.5 text-[11px] text-[#9a8478]">
                    Payment
                    <select
                      className={selectCls}
                      value={pay}
                      disabled={saving}
                      onChange={(e) =>
                        patchOrder(o, { payment_status: e.target.value })
                      }
                    >
                      {(PAY_STATUSES.includes(pay)
                        ? PAY_STATUSES
                        : [pay, ...PAY_STATUSES]
                      ).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-[#9a8478]">
                    Making
                    <select
                      className={selectCls}
                      value={MAKE_STATUSES.includes(make) ? make : make}
                      disabled={saving}
                      onChange={(e) =>
                        patchOrder(o, {
                          creating_status:
                            e.target.value === "Not started"
                              ? ""
                              : e.target.value,
                        })
                      }
                    >
                      {(MAKE_STATUSES.includes(make)
                        ? MAKE_STATUSES
                        : [make, ...MAKE_STATUSES]
                      ).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] text-[#9a8478]">
                    Deliver
                    <input
                      type="date"
                      className={selectCls}
                      value={o.delivery_date ?? ""}
                      disabled={saving}
                      onChange={(e) =>
                        patchOrder(o, { delivery_date: e.target.value })
                      }
                    />
                  </label>
                  {saving && (
                    <span className="text-[11px] text-[#9a8478]">Saving…</span>
                  )}
                  {o.proof_url && (
                    <a
                      href={o.proof_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-xs font-semibold text-white bg-[#2fa3ae] px-3 py-1.5 rounded-full"
                    >
                      View proof
                      {o.proof_at
                        ? ` (${new Date(o.proof_at).toLocaleDateString()})`
                        : ""}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
