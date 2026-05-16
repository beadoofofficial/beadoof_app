"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BarcodeScanner from "./BarcodeScanner";
import {
  stockLevelOf,
  type InventoryItem,
  type StockStatus,
} from "@/lib/inventory";

type Toast = { kind: "ok" | "err"; text: string } | null;

type DraftForm = {
  barcode: string;
  name: string;
  color_hex: string;
  is_assorted: boolean;
  is_lettered: boolean;
  stock: StockStatus;
  quantity: number;
  low_stock_threshold: number;
  size_mm: number;
  price_cents: string;
  notes: string;
};

const blankDraft = (barcode = ""): DraftForm => ({
  barcode,
  name: "",
  color_hex: "#e3a235",
  is_assorted: false,
  is_lettered: false,
  stock: "in",
  quantity: 1,
  low_stock_threshold: 5,
  size_mm: 8,
  price_cents: "",
  notes: "",
});

const itemToDraft = (it: InventoryItem): DraftForm => ({
  barcode: it.barcode,
  name: it.name,
  color_hex: it.color_hex || "#e3a235",
  is_assorted: it.is_assorted,
  is_lettered: it.is_lettered ?? false,
  stock: it.stock,
  quantity: it.quantity,
  low_stock_threshold: it.low_stock_threshold ?? 5,
  size_mm: it.size_mm ?? 8,
  price_cents:
    it.price_cents != null ? (it.price_cents / 100).toFixed(2) : "",
  notes: it.notes ?? "",
});

const ASSORTED_SWATCH =
  "conic-gradient(from 0deg,#ff6b6b,#f7b733,#52c41a,#13c2c2,#1890ff,#9c27b0,#ff6b6b)";

export default function InventoryAdminPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState(false);

  const startEdit = (it: InventoryItem) => {
    setEditingId(it.id);
    setDraft(itemToDraft(it));
  };

  const cancelDraft = () => {
    setDraft(null);
    setEditingId(null);
  };

  const flash = (t: Toast) => {
    setToast(t);
    if (t) window.setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async () => {
    const res = await fetch("/api/inventory", { cache: "no-store" });
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDetect = useCallback(
    async (code: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/inventory/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ barcode: code, delta: 1 }),
        });
        if (res.ok) {
          const data = await res.json();
          flash({
            kind: "ok",
            text: `+1 → ${data.item.name} (now ${data.item.quantity})`,
          });
          refresh();
        } else if (res.status === 404) {
          setScanning(false);
          setDraft(blankDraft(code));
          flash({ kind: "ok", text: `New barcode ${code} — fill in details.` });
        } else {
          const e = await res.json().catch(() => ({}));
          flash({ kind: "err", text: e.error || "Scan failed" });
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const saveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    try {
      const body = {
        barcode: draft.barcode,
        name: draft.name,
        is_assorted: draft.is_assorted,
        is_lettered: draft.is_lettered,
        color_hex: draft.is_assorted ? null : draft.color_hex || null,
        stock: draft.stock,
        quantity: draft.quantity,
        low_stock_threshold: draft.low_stock_threshold,
        size_mm: draft.size_mm,
        price_cents: draft.price_cents
          ? Math.round(parseFloat(draft.price_cents) * 100)
          : null,
        notes: draft.notes || null,
      };
      const url = editingId
        ? `/api/inventory/${editingId}`
        : "/api/inventory";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        flash({
          kind: "ok",
          text: editingId ? `Updated ${draft.name}` : `Added ${draft.name}`,
        });
        cancelDraft();
        refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        flash({ kind: "err", text: err.error || "Save failed" });
      }
    } finally {
      setBusy(false);
    }
  };

  const adjustQty = async (item: InventoryItem, delta: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quantity: Math.max(0, item.quantity + delta),
        }),
      });
      if (res.ok) refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (item: InventoryItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        flash({ kind: "ok", text: `Deleted ${item.name}` });
        refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#faf3ea] p-4 md:p-6 text-foreground">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Bead Inventory</h1>
            <p className="text-xs text-[#7a6a60]">
              Scan a barcode to add stock. Unknown codes open an Add form.
            </p>
          </div>
          <Link href="/admin" className="text-sm text-[#7a6a60] underline">
            ← Admin
          </Link>
        </div>

        {toast && (
          <div
            className={`mb-3 rounded-lg px-3 py-2 text-sm ${
              toast.kind === "ok"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {toast.text}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
          {/* Scanner */}
          <section className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Scanner</h2>
              <button
                type="button"
                onClick={() => setScanning((s) => !s)}
                className={`text-xs px-3 py-1.5 rounded-full ${
                  scanning
                    ? "bg-red-100 text-red-700"
                    : "bg-[#5a3a24] text-white"
                }`}
              >
                {scanning ? "Stop" : "Start camera"}
              </button>
            </div>

            {scanning ? (
              <BarcodeScanner onDetect={handleDetect} paused={busy} />
            ) : (
              <div className="text-xs text-[#7a6a60] bg-[#fbf1ea] rounded-lg p-3">
                Tap <span className="font-semibold">Start camera</span> to scan
                EAN/UPC/Code128/QR. Known barcodes auto-increment quantity by 1;
                unknown ones open the Add form.
              </div>
            )}
          </section>

          {/* Add / inline form */}
          <section className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">
                {!draft
                  ? "Inventory"
                  : editingId
                    ? "Edit inventory item"
                    : "Add to inventory"}
              </h2>
              {!draft ? (
                <button
                  type="button"
                  onClick={() => setDraft(blankDraft())}
                  className="text-xs px-3 py-1.5 rounded-full bg-[#fbf1ea] text-[#a07258]"
                >
                  + Add manually
                </button>
              ) : (
                <button
                  type="button"
                  onClick={cancelDraft}
                  className="text-xs px-3 py-1.5 rounded-full bg-[#fbf1ea] text-[#a07258]"
                >
                  Cancel
                </button>
              )}
            </div>

            {draft ? (
              <form onSubmit={saveDraft} className="space-y-2 text-sm">
                <Field label="Barcode">
                  <input
                    required
                    value={draft.barcode}
                    onChange={(e) =>
                      setDraft({ ...draft, barcode: e.target.value })
                    }
                    className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                  />
                </Field>
                <Field label="Name">
                  <input
                    required
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    placeholder="e.g. Coral Pink 8mm"
                    className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={draft.is_assorted}
                    onChange={(e) =>
                      setDraft({ ...draft, is_assorted: e.target.checked })
                    }
                    className="w-4 h-4"
                  />
                  <span
                    className="w-5 h-5 rounded-full border border-black/10"
                    style={{ background: ASSORTED_SWATCH }}
                    aria-hidden
                  />
                  <span className="font-medium">Assorted (mixed colors)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none py-1">
                  <input
                    type="checkbox"
                    checked={draft.is_lettered}
                    onChange={(e) =>
                      setDraft({ ...draft, is_lettered: e.target.checked })
                    }
                    className="w-4 h-4"
                  />
                  <span
                    className="w-5 h-5 rounded-full border border-black/10 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: draft.color_hex || "#5a3a24" }}
                    aria-hidden
                  >
                    A
                  </span>
                  <span className="font-medium">
                    Lettered pack (A–Z alphabet beads)
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {draft.is_assorted ? (
                    <Field label="Color">
                      <div className="w-full h-10 border border-[#e4d3c4] rounded-lg flex items-center px-2 gap-2 bg-[#fbf1ea] text-xs text-[#7a6a60]">
                        <span
                          className="w-5 h-5 rounded-full"
                          style={{ background: ASSORTED_SWATCH }}
                          aria-hidden
                        />
                        N/A — assorted pack
                      </div>
                    </Field>
                  ) : (
                    <Field label="Color">
                      <input
                        type="color"
                        value={draft.color_hex}
                        onChange={(e) =>
                          setDraft({ ...draft, color_hex: e.target.value })
                        }
                        className="w-full h-10 border border-[#e4d3c4] rounded-lg"
                      />
                    </Field>
                  )}
                  <Field label="Stock state">
                    <select
                      value={draft.stock}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          stock: e.target.value as StockStatus,
                        })
                      }
                      className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                    >
                      <option value="in">In stock</option>
                      <option value="glitter">Glitter</option>
                      <option value="out">Out of stock</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Quantity">
                    <input
                      type="number"
                      min={0}
                      value={draft.quantity}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          quantity: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                    />
                  </Field>
                  <Field label="Low-stock warning ≤">
                    <input
                      type="number"
                      min={0}
                      value={draft.low_stock_threshold}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          low_stock_threshold: Math.max(
                            0,
                            Number(e.target.value) || 0,
                          ),
                        })
                      }
                      className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Size (mm)">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={draft.size_mm}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          size_mm: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                    />
                  </Field>
                  <Field label="Price (optional)">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={draft.price_cents}
                      onChange={(e) =>
                        setDraft({ ...draft, price_cents: e.target.value })
                      }
                      placeholder="0.00"
                      className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                    />
                  </Field>
                </div>
                <Field label="Notes (optional)">
                  <textarea
                    value={draft.notes}
                    onChange={(e) =>
                      setDraft({ ...draft, notes: e.target.value })
                    }
                    className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2 min-h-15"
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#5a3a24] text-white py-2 rounded-lg disabled:opacity-50"
                >
                  {editingId ? "Save changes" : "Save to inventory"}
                </button>
              </form>
            ) : loading ? (
              <div className="text-xs text-[#7a6a60]">Loading…</div>
            ) : items.length === 0 ? (
              <div className="text-xs text-[#7a6a60]">
                No inventory yet. Scan a barcode or use{" "}
                <span className="font-semibold">+ Add manually</span>.
              </div>
            ) : (
              <ul className="divide-y divide-[#f1e4d5]">
                {items.map((it) => {
                  const level = stockLevelOf(it);
                  const levelClass =
                    level === "out"
                      ? "text-red-700"
                      : level === "low"
                        ? "text-amber-700"
                        : "text-emerald-700";
                  const levelText =
                    level === "out"
                      ? "Out of stock"
                      : level === "low"
                        ? `Low stock · ${it.quantity} left`
                        : `${it.quantity} in stock`;
                  return (
                    <li
                      key={it.id}
                      className="py-2 flex items-center gap-3 text-sm"
                    >
                      <span
                        className="w-7 h-7 rounded-full border border-black/5 shrink-0"
                        style={{
                          background:
                            it.stock === "out"
                              ? "repeating-linear-gradient(45deg,#cfcfcf 0 2px,#ececec 2px 5px)"
                              : it.is_assorted
                                ? ASSORTED_SWATCH
                                : it.color_hex || "#d9b48a",
                        }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{it.name}</div>
                        <div className="text-[11px] text-[#7a6a60] truncate">
                          {it.barcode} · {it.size_mm ?? 8}mm
                          {it.is_assorted ? " · Assorted" : ""}
                          {it.is_lettered ? " · Lettered" : ""}
                          {it.stock === "glitter" ? " · Glitter" : ""}
                        </div>
                        <div className={`text-[11px] font-semibold ${levelClass}`}>
                          {levelText}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => adjustQty(it, -1)}
                          disabled={busy || it.quantity <= 0}
                          className="w-7 h-7 rounded-full bg-[#fbf1ea] text-[#a07258] disabled:opacity-30"
                          aria-label="decrement"
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-semibold tabular-nums">
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => adjustQty(it, 1)}
                          disabled={busy}
                          className="w-7 h-7 rounded-full bg-[#5a3a24] text-white"
                          aria-label="increment"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(it)}
                          disabled={busy}
                          className="ml-2 text-xs text-[#5a3a24] underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(it)}
                          disabled={busy}
                          className="ml-1 text-xs text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-[#9a8478] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
