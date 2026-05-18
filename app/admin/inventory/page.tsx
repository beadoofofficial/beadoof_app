"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BarcodeScanner from "./BarcodeScanner";
import ImageCropper from "@/app/components/ImageCropper";
import { createClient as createBrowserClient } from "@/utils/supabase/client";
import {
  stockLevelOf,
  buildAssortedSwirlCss,
  CATEGORY_LABELS,
  CATEGORY_VALUES,
  type InventoryItem,
  type ItemCategory,
  type StockStatus,
} from "@/lib/inventory";

const IMAGE_BUCKET = "inventory-images";

type Toast = { kind: "ok" | "err"; text: string } | null;

type DraftForm = {
  barcode: string;
  name: string;
  category: ItemCategory;
  color_hex: string;
  image_url: string | null;
  is_assorted: boolean;
  is_lettered: boolean;
  variant_colors: string[];
  stock: StockStatus;
  quantity: number;
  low_stock_threshold: number;
  size_mm: number;
  max_per_design: string;
  price_cents: string;
  notes: string;
};

const blankDraft = (barcode = ""): DraftForm => ({
  barcode,
  name: "",
  category: "bead",
  color_hex: "#e3a235",
  image_url: null,
  is_assorted: false,
  is_lettered: false,
  variant_colors: [],
  stock: "in",
  quantity: 1,
  low_stock_threshold: 5,
  size_mm: 8,
  max_per_design: "",
  price_cents: "",
  notes: "",
});

const itemToDraft = (it: InventoryItem): DraftForm => ({
  barcode: it.barcode,
  name: it.name,
  category: it.category ?? "bead",
  image_url: it.image_url ?? null,
  color_hex: it.color_hex || "#e3a235",
  is_assorted: it.is_assorted,
  is_lettered: it.is_lettered ?? false,
  variant_colors: Array.isArray(it.variant_colors) ? it.variant_colors : [],
  stock: it.stock,
  quantity: it.quantity,
  low_stock_threshold: it.low_stock_threshold ?? 5,
  size_mm: it.size_mm ?? 8,
  max_per_design:
    typeof it.max_per_design === "number" ? String(it.max_per_design) : "",
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
  const [uploading, setUploading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    src: string;
    filename: string;
  } | null>(null);

  const stageImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      flash({ kind: "err", text: "Only image files are allowed." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      flash({ kind: "err", text: "Image must be under 5 MB." });
      return;
    }
    const url = URL.createObjectURL(file);
    setPendingImage({ src: url, filename: file.name });
  };

  const cancelCrop = () => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.src);
    setPendingImage(null);
  };

  const uploadCroppedBlob = async (blob: Blob) => {
    if (!draft || uploading) return;
    setUploading(true);
    try {
      const supabase = createBrowserClient();
      const path = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}.jpg`;
      const { error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) {
        flash({ kind: "err", text: `Upload failed: ${error.message}` });
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
      setDraft((d) => (d ? { ...d, image_url: publicUrl } : d));
      flash({ kind: "ok", text: "Image uploaded" });
      cancelCrop();
    } finally {
      setUploading(false);
    }
  };

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
        category: draft.category,
        image_url: draft.image_url,
        is_assorted: draft.is_assorted,
        is_lettered: draft.is_lettered,
        variant_colors: draft.is_assorted ? draft.variant_colors : [],
        color_hex: draft.is_assorted ? null : draft.color_hex || null,
        stock: draft.stock,
        quantity: draft.quantity,
        low_stock_threshold: draft.low_stock_threshold,
        size_mm: draft.size_mm,
        max_per_design: draft.max_per_design.trim()
          ? Math.max(1, parseInt(draft.max_per_design, 10) || 1)
          : null,
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
                <Field label="Category">
                  <select
                    value={draft.category}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        category: e.target.value as ItemCategory,
                      })
                    }
                    className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                  >
                    {CATEGORY_VALUES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-[#7a6a60] mt-1">
                    Only <strong>Bead</strong> items show on the home palette.
                    Pins / hooks / clasps stay in admin only.
                  </span>
                </Field>
                <Field label="Photo (optional)">
                  <div className="flex items-center gap-3">
                    {draft.image_url ? (
                      <div className="relative w-16 h-16 shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={draft.image_url}
                          alt="bead preview"
                          className="w-16 h-16 rounded-xl object-cover border border-[#e4d3c4]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, image_url: null })
                          }
                          aria-label="Remove image"
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-[#e4d3c4] text-[#5a3a24] text-sm shadow"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div
                        className="w-16 h-16 shrink-0 rounded-xl border border-dashed border-[#e4d3c4] flex items-center justify-center text-[#9a8478] text-2xl"
                        aria-hidden
                      >
                        📷
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <label className="inline-block">
                        <input
                          type="file"
                          accept="image/*"
                          disabled={uploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) stageImageFile(file);
                            e.target.value = "";
                          }}
                          className="hidden"
                        />
                        <span
                          className={`inline-block text-xs px-3 py-1.5 rounded-full font-semibold cursor-pointer ${
                            uploading
                              ? "bg-[#fbf1ea] text-[#a07258] opacity-60 cursor-wait"
                              : "bg-[#5a3a24] text-white"
                          }`}
                        >
                          {uploading
                            ? "Uploading…"
                            : draft.image_url
                              ? "Replace image"
                              : "Choose image"}
                        </span>
                      </label>
                      <span className="block text-[11px] text-[#7a6a60]">
                        Replaces the color swatch on the home palette. PNG /
                        JPG / WebP, ≤5 MB.
                      </span>
                    </div>
                  </div>
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
                    style={{
                      background:
                        draft.is_assorted && draft.variant_colors.length > 0
                          ? buildAssortedSwirlCss(draft.variant_colors)
                          : ASSORTED_SWATCH,
                    }}
                    aria-hidden
                  />
                  <span className="font-medium">Assorted (mixed colors)</span>
                </label>
                {draft.is_assorted && (
                  <Field label="Variant colors (optional)">
                    <div className="space-y-2">
                      {draft.variant_colors.length === 0 ? (
                        <div className="text-[11px] text-[#7a6a60]">
                          No specific colors set — renders as a generic
                          rainbow swirl.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {draft.variant_colors.map((c, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1 bg-[#fbf6ef] border border-[#e4d3c4] rounded-lg pl-1 pr-1"
                            >
                              <input
                                type="color"
                                value={c}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    variant_colors: draft.variant_colors.map(
                                      (v, i) =>
                                        i === idx ? e.target.value : v,
                                    ),
                                  })
                                }
                                className="w-8 h-8 cursor-pointer bg-transparent"
                                aria-label={`Variant color ${idx + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setDraft({
                                    ...draft,
                                    variant_colors:
                                      draft.variant_colors.filter(
                                        (_, i) => i !== idx,
                                      ),
                                  })
                                }
                                aria-label={`Remove variant color ${idx + 1}`}
                                className="text-[#a07258] text-lg leading-none px-1 hover:text-red-600"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            variant_colors: [
                              ...draft.variant_colors,
                              "#e3a235",
                            ],
                          })
                        }
                        className="text-xs px-3 py-1 rounded-full bg-[#fbf1ea] text-[#a07258] font-semibold"
                      >
                        + Add color
                      </button>
                      <span className="block text-[11px] text-[#7a6a60]">
                        List the exact colors in this pack. The swirl on the
                        palette and receipt is built from these instead of the
                        default rainbow. Leave empty for the generic rainbow.
                      </span>
                    </div>
                  </Field>
                )}
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
                <Field label="Max per design (optional)">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.max_per_design}
                    onChange={(e) =>
                      setDraft({ ...draft, max_per_design: e.target.value })
                    }
                    placeholder="No limit"
                    className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                  />
                  <span className="block text-[11px] text-[#7a6a60] mt-1">
                    Leave blank for no limit. When set, customers can only use
                    this item up to N times in a single design.
                  </span>
                </Field>
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
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.image_url}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover border border-black/10 shrink-0"
                        />
                      ) : (
                        <span
                          className="w-7 h-7 rounded-full border border-black/5 shrink-0"
                          style={{
                            background:
                              it.stock === "out"
                                ? "repeating-linear-gradient(45deg,#cfcfcf 0 2px,#ececec 2px 5px)"
                                : it.is_assorted
                                  ? it.variant_colors &&
                                    it.variant_colors.length > 0
                                    ? buildAssortedSwirlCss(it.variant_colors)
                                    : ASSORTED_SWATCH
                                  : it.color_hex || "#d9b48a",
                          }}
                          aria-hidden
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium truncate">
                            {it.name}
                          </span>
                          {it.category && it.category !== "bead" && (
                            <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#fbf1ea] text-[#a07258]">
                              {CATEGORY_LABELS[it.category] ?? it.category}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#7a6a60] truncate">
                          {it.barcode} · {it.size_mm ?? 8}mm
                          {it.is_assorted ? " · Assorted" : ""}
                          {it.is_lettered ? " · Lettered" : ""}
                          {it.stock === "glitter" ? " · Glitter" : ""}
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${levelClass}`}
                        >
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

      {pendingImage && (
        <ImageCropper
          src={pendingImage.src}
          filename={pendingImage.filename}
          onCancel={cancelCrop}
          onConfirm={uploadCroppedBlob}
        />
      )}
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
