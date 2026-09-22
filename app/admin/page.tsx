"use client";

// Admin orders dashboard, built for fast-moving batches: one-click status
// segments (no dropdowns), proof-of-payment lightbox with a Mark-as-Paid
// button in it, payment + making filters with live counts, clickable stat
// tiles as filter presets, search, and a 60s auto-refresh.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/* ---------------- status models ---------------- */

const PAY_STATUSES = ["Unpaid", "Proof sent", "Paid"] as const;
const PAY_SHORT: Record<string, string> = {
  Unpaid: "Unpaid",
  "Proof sent": "Proof",
  Paid: "Paid",
};

// stored value ↔ segment label for the making status
const MAKE_SEGMENTS = [
  { label: "To do", value: "" },
  { label: "Making", value: "In progress" },
  { label: "Done", value: "Done" },
] as const;

const payOf = (o: Order) => o.payment_status ?? "Unpaid";
const makeOf = (o: Order) => o.creating_status ?? "";

function payTone(status: string): string {
  if (/^paid$/i.test(status)) return "bg-emerald-500 text-white";
  if (/proof/i.test(status)) return "bg-sky-500 text-white";
  return "bg-amber-400 text-[#5a4300]";
}

function makeTone(value: string): string {
  if (/done/i.test(value)) return "bg-emerald-500 text-white";
  if (/progress/i.test(value)) return "bg-violet-500 text-white";
  return "bg-[#c9b8a8] text-white";
}

/* ---------------- small pieces ---------------- */

/** One-click segmented status control. */
function Seg({
  options,
  value,
  disabled,
  tone,
  onPick,
}: {
  options: { label: string; value: string }[];
  value: string;
  disabled?: boolean;
  tone: (v: string) => string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-[#e4d3c4] bg-white">
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.label}
            type="button"
            disabled={disabled}
            className={`cursor-pointer px-2.5 py-1 text-[11px] font-bold whitespace-nowrap transition-colors disabled:opacity-50 ${
              on ? tone(opt.value) : "text-[#9a8478] hover:bg-[#f6ede2]"
            }`}
            onClick={() => !on && onPick(opt.value)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url);

/* ---------------- proof lightbox ---------------- */

function ProofLightbox({
  order,
  saving,
  onMarkPaid,
  onClose,
}: {
  order: Order;
  saving: boolean;
  onMarkPaid: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const paid = /^paid$/i.test(payOf(order));
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#f1e4d5] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-bold">
              {order.code} · {order.customer_name}
            </div>
            <div className="text-xs text-[#9a8478]">
              PHP {(order.total ?? 0).toLocaleString()} · {order.payment}
              {order.proof_at
                ? ` · proof sent ${new Date(order.proof_at).toLocaleString()}`
                : ""}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="ml-auto shrink-0 cursor-pointer px-2 text-2xl leading-none text-[#9a8478] hover:text-[#3b2b22]"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#f6ede2] p-3">
          {order.proof_url && isPdf(order.proof_url) ? (
            <a
              href={order.proof_url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl bg-white p-8 text-center text-sm font-semibold text-[#5a3a24] underline"
            >
              Open the PDF proof
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- customer upload, unknown dimensions
            <img
              src={order.proof_url ?? ""}
              alt={`Proof of payment for ${order.code}`}
              className="mx-auto max-h-[65vh] w-auto rounded-xl"
            />
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[#f1e4d5] px-4 py-3">
          <a
            href={order.proof_url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#9a8478] underline"
          >
            Open full size
          </a>
          <button
            type="button"
            disabled={paid || saving}
            className="ml-auto cursor-pointer rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-default disabled:opacity-50"
            onClick={onMarkPaid}
          >
            {paid ? "Already paid ✓" : saving ? "Saving…" : "✓ Mark as Paid"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- the dashboard ---------------- */

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<string>("All");
  const [makeFilter, setMakeFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [proofOrderId, setProofOrderId] = useState<string | null>(null);
  const savingRef = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    try {
      const res = await fetch("/api/admin/orders");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "load failed");
      setOrders(data as Order[]);
      setError(null);
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "Could not load orders.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // initial load + a quiet refresh every minute (fast-moving orders)
  useEffect(() => {
    let cancelled = false;
    const run = (silent: boolean) => {
      if (!cancelled && !savingRef.current) void refresh(silent);
    };
    run(false);
    const timer = setInterval(() => run(true), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refresh]);

  async function patchOrder(order: Order, patch: Partial<Order>) {
    const previous = order;
    setSavingId(order.id);
    savingRef.current = true;
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
      savingRef.current = false;
    }
  }

  /* ---- filters ---- */

  const counts = useMemo(() => {
    const pay: Record<string, number> = { All: orders.length };
    for (const s of PAY_STATUSES) pay[s] = 0;
    const make: Record<string, number> = { All: orders.length };
    for (const m of MAKE_SEGMENTS) make[m.label] = 0;
    for (const o of orders) {
      const p = payOf(o);
      pay[p] = (pay[p] ?? 0) + 1;
      const seg =
        MAKE_SEGMENTS.find((m) => m.value === makeOf(o)) ?? MAKE_SEGMENTS[0];
      make[seg.label] += 1;
    }
    return { pay, make };
  }, [orders]);

  const stats = useMemo(() => {
    const awaiting = orders.filter((o) => !/^paid$/i.test(payOf(o))).length;
    const toMake = orders.filter(
      (o) => /^paid$/i.test(payOf(o)) && !/done/i.test(makeOf(o)),
    ).length;
    const paidTotal = orders
      .filter((o) => /^paid$/i.test(payOf(o)))
      .reduce((s, o) => s + (o.total ?? 0), 0);
    return { all: orders.length, awaiting, toMake, paidTotal };
  }, [orders]);

  const shown = orders.filter((o) => {
    if (payFilter !== "All" && payOf(o) !== payFilter) return false;
    if (makeFilter !== "All") {
      const seg =
        MAKE_SEGMENTS.find((m) => m.value === makeOf(o)) ?? MAKE_SEGMENTS[0];
      if (seg.label !== makeFilter) return false;
    }
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [o.code, o.customer_name, o.bead_name, o.contact, o.merch]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const chip = (on: boolean) =>
    `cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold ${
      on ? "bg-[#5a3a24] text-white" : "bg-white text-[#5a4438] hover:bg-[#f0e4d6]"
    }`;

  const proofOrder = orders.find((o) => o.id === proofOrderId) ?? null;

  /* ---- render ---- */

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h1 className="font-display text-2xl font-semibold text-[#3b2b22]">
          Orders
        </h1>
        <button
          type="button"
          className="shrink-0 cursor-pointer text-xs text-[#9a8478] underline"
          title="The list also refreshes itself every minute"
          onClick={() => refresh()}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
          {/sign in/i.test(error) && (
            <>
              {" "}
              <a href="/sign-in" className="font-semibold underline">
                Sign in
              </a>
            </>
          )}
        </div>
      )}

      {/* stat tiles double as filter presets */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {(
          [
            ["All orders", String(stats.all), () => {
              setPayFilter("All");
              setMakeFilter("All");
            }],
            ["Awaiting payment", String(stats.awaiting), () => {
              setPayFilter("Unpaid");
              setMakeFilter("All");
            }],
            ["Still to make", String(stats.toMake), () => {
              setPayFilter("Paid");
              setMakeFilter("To do");
            }],
            ["Paid so far", `PHP ${stats.paidTotal.toLocaleString()}`, () => {
              setPayFilter("Paid");
              setMakeFilter("All");
            }],
          ] as const
        ).map(([label, value, apply]) => (
          <button
            key={label}
            type="button"
            className="cursor-pointer rounded-2xl bg-white px-4 py-3 text-left shadow-sm hover:shadow"
            onClick={apply}
            title="Filter the list"
          >
            <div className="text-[11px] tracking-wide text-[#9a8478] uppercase">
              {label}
            </div>
            <div className="font-display text-xl font-semibold text-[#3b2b22]">
              {value}
            </div>
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-16 text-[11px] font-bold tracking-wide text-[#9a8478] uppercase">
            Payment
          </span>
          {["All", ...PAY_STATUSES].map((s) => (
            <button
              key={s}
              className={chip(payFilter === s)}
              onClick={() => setPayFilter(s)}
            >
              {PAY_SHORT[s] ?? s} ({counts.pay[s] ?? 0})
            </button>
          ))}
          <input
            className="ml-auto w-full rounded-full border border-[#e4d3c4] bg-white px-3.5 py-1.5 text-sm sm:w-60"
            placeholder="Search code, name, mobile…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-16 text-[11px] font-bold tracking-wide text-[#9a8478] uppercase">
            Making
          </span>
          {["All", ...MAKE_SEGMENTS.map((m) => m.label)].map((s) => (
            <button
              key={s}
              className={chip(makeFilter === s)}
              onClick={() => setMakeFilter(s)}
            >
              {s} ({counts.make[s] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-[#7a6a60]">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-[#7a6a60] shadow-sm">
          {orders.length === 0
            ? "No orders yet — they show up here as soon as the first one is placed."
            : "Nothing matches these filters."}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((o) => {
            const saving = savingId === o.id;
            const expanded = expandedId === o.id;
            const multi = (o.pieces?.length ?? 0) > 1;
            const piece = multi
              ? `${o.pieces!.length} pieces · ${o.merch} …`
              : dotted(
                  o.merch,
                  o.bead_name && `“${o.bead_name}”`,
                  o.color,
                  o.letter_size,
                );
            return (
              <li key={o.id} className="rounded-xl bg-white shadow-sm">
                {/* main row: everything triage needs on one line */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 basis-52 cursor-pointer text-left"
                    onClick={() => setExpandedId(expanded ? null : o.id)}
                    title={expanded ? "Hide details" : "Show details"}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-[#3b2b22]">
                        {o.code ?? "(no code)"}
                      </span>
                      <span className="text-[11px] text-[#9a8478]">
                        {shortDate(o.created_at)}
                      </span>
                      <span
                        className={`ml-auto text-[#9a8478] transition-transform ${expanded ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        ›
                      </span>
                    </div>
                    <div className="truncate text-[13px] text-[#5a4438]">
                      <span className="font-semibold">{o.customer_name}</span>
                      {piece ? ` · ${piece}` : ""}
                    </div>
                  </button>

                  <span className="font-display text-[15px] font-semibold whitespace-nowrap text-[#5a3a24]">
                    PHP {(o.total ?? 0).toLocaleString()}
                  </span>

                  {o.proof_url ? (
                    <button
                      type="button"
                      className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 border-sky-300 bg-[#f6ede2]"
                      title="View proof of payment"
                      onClick={() => setProofOrderId(o.id)}
                    >
                      {isPdf(o.proof_url) ? (
                        <span className="grid h-full w-full place-items-center text-[10px] font-bold text-[#5a3a24]">
                          PDF
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- tiny thumbnail of a customer upload
                        <img
                          src={o.proof_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      )}
                    </button>
                  ) : (
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-dashed border-[#e4d3c4] text-[9px] text-[#c9b8a8]"
                      title="No proof sent yet"
                    >
                      no proof
                    </span>
                  )}

                  {/* the two segments wrap independently on narrow screens */}
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Seg
                      options={PAY_STATUSES.map((s) => ({
                        label: PAY_SHORT[s],
                        value: s,
                      }))}
                      value={payOf(o)}
                      disabled={saving}
                      tone={payTone}
                      onPick={(v) => patchOrder(o, { payment_status: v })}
                    />
                    <Seg
                      options={[...MAKE_SEGMENTS]}
                      value={makeOf(o)}
                      disabled={saving}
                      tone={makeTone}
                      onPick={(v) => patchOrder(o, { creating_status: v })}
                    />
                  </div>
                </div>

                {/* expanded details */}
                {expanded && (
                  <div className="space-y-1.5 border-t border-[#f1e4d5] bg-[#fbf6ef] px-3 py-2.5 text-[13px]">
                    {multi ? (
                      <ol className="list-none space-y-0.5 text-[#5a4438]">
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
                      <div className="text-[#5a4438]">
                        {dotted(
                          o.merch,
                          o.bead_name && `“${o.bead_name}”`,
                          o.color,
                          o.letter_size,
                          o.bead_mix,
                          (o.addons?.length ?? 0) > 0
                            ? `+ ${o.addons!.join(", ")}`
                            : undefined,
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#9a8478]">
                      {o.contact && <span>{o.contact}</span>}
                      {o.customer_email && <span>{o.customer_email}</span>}
                      {o.fulfillment && <span>{o.fulfillment}</span>}
                      {o.payment && <span>{o.payment}</span>}
                      {o.discount_label && <span>{o.discount_label}</span>}
                      <span>{new Date(o.created_at).toLocaleString()}</span>
                    </div>
                    {o.notes && (
                      <div className="text-xs text-[#7a6a60] italic">
                        “{o.notes}”
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 text-xs text-[#9a8478]">
                      Deliver
                      <input
                        type="date"
                        className="rounded-lg border border-[#e4d3c4] bg-white px-2 py-1 text-xs text-[#3b2b22]"
                        value={o.delivery_date ?? ""}
                        disabled={saving}
                        onChange={(e) =>
                          patchOrder(o, { delivery_date: e.target.value })
                        }
                      />
                      {saving && <span>Saving…</span>}
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {proofOrder && (
        <ProofLightbox
          order={proofOrder}
          saving={savingId === proofOrder.id}
          onMarkPaid={() => patchOrder(proofOrder, { payment_status: "Paid" })}
          onClose={() => setProofOrderId(null)}
        />
      )}
    </div>
  );
}
