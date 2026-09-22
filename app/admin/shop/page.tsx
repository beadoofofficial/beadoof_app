"use client";

// Shop catalog + settings editor — the replacement for the Google Sheet tabs
// of the Apps Script version. Each tab here is one step of the order wizard.

import { useEffect, useState } from "react";
import { CATEGORIES, type Category, type ShopOption } from "@/lib/shop";

type Row = ShopOption & { id?: string; dirty?: boolean; saving?: boolean };
type Setting = {
  key: string;
  value: string;
  label: string;
  help: string;
  dirty?: boolean;
};

const TAB_LABEL: Record<Category, string> = {
  FULFILLMENT: "📦 Pick up or pre-order",
  MERCH: "🛍️ Items",
  COLOR: "🎨 Colours",
  DESIGN: "✨ Designs",
  SIZE: "🔤 Letter sizes",
  BEAD: "📿 Bead mixes",
  ADDON: "➕ Add-ons",
  PAYMENT: "💳 Payment",
};

const STYLE_LABEL: Partial<Record<Category, string>> = {
  COLOR: "Colour (#E03B48)",
  BEAD: "Colours (#hex,#hex,…)",
  DESIGN: "Emoji",
};

function swatches(style: string) {
  return style
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^#[0-9a-fA-F]{6}$/.test(s));
}

export default function ShopAdminPage() {
  const [tab, setTab] = useState<Category>("MERCH");
  const [rows, setRows] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // loading starts true and error starts null, so the initial load only
  // touches state from promise callbacks — never synchronously in the effect.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/shop/options"), fetch("/api/shop/settings")])
      .then(async ([optRes, setRes]) => {
        const opts = await optRes.json();
        const sets = await setRes.json();
        if (!optRes.ok) throw new Error(opts.error || "options failed");
        if (!setRes.ok) throw new Error(sets.error || "settings failed");
        if (cancelled) return;
        setRows(opts as Row[]);
        setSettings(sets as Setting[]);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load the shop.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function patchRow(row: Row, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => (r === row ? { ...r, ...patch, dirty: true } : r)),
    );
  }

  async function saveRow(row: Row) {
    setRows((rs) => rs.map((r) => (r === row ? { ...r, saving: true } : r)));
    try {
      const res = await fetch("/api/shop/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(row),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save failed");
      setRows((rs) =>
        rs.map((r) =>
          r === row ? { ...(data as Row), dirty: false, saving: false } : r,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setRows((rs) => rs.map((r) => (r === row ? { ...r, saving: false } : r)));
    }
  }

  async function deleteRow(row: Row) {
    if (!row.id) {
      setRows((rs) => rs.filter((r) => r !== row));
      return;
    }
    if (!confirm(`Delete "${row.value}"? Unticking Active hides it instead.`))
      return;
    const res = await fetch(`/api/shop/options?id=${row.id}`, {
      method: "DELETE",
    });
    if (res.ok) setRows((rs) => rs.filter((r) => r !== row));
    else setError("Delete failed.");
  }

  function addRow() {
    const maxSort = Math.max(
      0,
      ...rows.filter((r) => r.category === tab).map((r) => r.sort),
    );
    setRows((rs) => [
      ...rs,
      {
        category: tab,
        value: "",
        price: 0,
        active: true,
        note: "",
        style: "",
        qr: null,
        plain: false,
        sort: maxSort + 1,
        dirty: true,
      },
    ]);
  }

  async function saveSettings() {
    setSavingSettings(true);
    setError(null);
    try {
      const dirty = settings.filter((s) => s.dirty);
      if (dirty.length) {
        const res = await fetch("/api/shop/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(dirty.map(({ key, value }) => ({ key, value }))),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "save failed");
        setSettings((ss) => ss.map((s) => ({ ...s, dirty: false })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSavingSettings(false);
    }
  }

  const tabRows = rows
    .filter((r) => r.category === tab)
    .sort((a, b) => a.sort - b.sort);

  const inputCls =
    "border border-cord/60 rounded px-2 py-1.5 text-sm w-full bg-white";

  return (
    <div className="space-y-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h1 className="font-[family-name:var(--font-fredoka)] text-2xl font-semibold text-ink">
            Shop editor
          </h1>
          <span className="text-xs text-shop-muted">
            Each tab is one step of the order form. Changes show straight away.
          </span>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
        {loading ? (
          <div className="text-sm text-shop-muted">Loading…</div>
        ) : (
          <>
            {/* one pill per form step, plus the settings pill */}
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    !showSettings && tab === c
                      ? "bg-shop-pink text-white shadow-sm"
                      : "bg-white text-ink/80 hover:bg-cord/30"
                  }`}
                  onClick={() => {
                    setShowSettings(false);
                    setTab(c);
                  }}
                >
                  {TAB_LABEL[c]}
                </button>
              ))}
              <button
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                  showSettings
                    ? "bg-shop-pink text-white shadow-sm"
                    : "bg-white text-ink/80 hover:bg-cord/30"
                }`}
                onClick={() => setShowSettings(true)}
              >
                ⚙️ Shop settings
              </button>
            </div>

            {showSettings ? (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs text-shop-muted">
              Shop name, discount, GCash details, open/closed. Changes show on
              the form straight away.
            </p>
            <div className="grid md:grid-cols-2 gap-x-5 gap-y-3">
              {settings.map((s) => {
                const isBool = /^(true|false)$/i.test(s.value.trim());
                const set = (value: string) =>
                  setSettings((ss) =>
                    ss.map((x) =>
                      x.key === s.key ? { ...x, value, dirty: true } : x,
                    ),
                  );
                return (
                  <label key={s.key} className="block">
                    <span className="text-xs font-semibold text-ink/80">
                      {s.label || s.key}
                    </span>
                    {s.help && (
                      <span className="block text-[11px] text-shop-muted">
                        {s.help}
                      </span>
                    )}
                    {isBool ? (
                      <span className="mt-1.5 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={/^true$/i.test(s.value)}
                          onChange={(e) => set(e.target.checked ? "true" : "false")}
                        />
                        {/^true$/i.test(s.value) ? "On" : "Off"}
                      </span>
                    ) : (
                      <input
                        className={`${inputCls} mt-1`}
                        value={s.value}
                        onChange={(e) => set(e.target.value)}
                      />
                    )}
                  </label>
                );
              })}
            </div>
            <button
              className="bg-shop-pink text-white px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-50"
              disabled={savingSettings || !settings.some((s) => s.dirty)}
              onClick={saveSettings}
            >
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
              <p className="text-xs text-shop-muted">
                One row = one tile on that step of the form. Untick Active to
                hide a row without deleting it. Prices are plain numbers (50,
                not PHP 50).
                {tab === "MERCH" &&
                  " Tick “No beaded name” for items with no name on them (earrings) — the form then skips the name, letter size and bead mix steps."}
                {tab === "PAYMENT" &&
                  " QR: paste an image URL, or better the QR's own text (a long line starting 00020101…) — the form draws it, and only text QRs can carry the order total (see ⚙️ Shop settings)."}
              </p>

              {tabRows.length === 0 && (
                <div className="text-sm text-shop-muted">
                  Nothing here yet — this step of the form will show an error
                  until you add a row.
                </div>
              )}

              {tabRows.map((row, i) => (
                <div
                  key={row.id ?? `new-${i}`}
                  className="border border-cord/40 rounded-xl p-3 space-y-2"
                >
                  {/* flex-wrap so narrow screens stack fields instead of
                      pushing them past the card edge */}
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grow basis-40 min-w-0">
                      <span className="text-[11px] text-shop-muted">Name</span>
                      <input
                        className={inputCls}
                        value={row.value}
                        onChange={(e) =>
                          patchRow(row, { value: e.target.value })
                        }
                      />
                    </label>
                    <label className="w-24 shrink-0">
                      <span className="text-[11px] text-shop-muted">Price</span>
                      <input
                        className={inputCls}
                        type="number"
                        value={row.price}
                        onChange={(e) =>
                          patchRow(row, { price: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    <label className="w-20 shrink-0">
                      <span className="text-[11px] text-shop-muted">Sort</span>
                      <input
                        className={inputCls}
                        type="number"
                        value={row.sort}
                        onChange={(e) =>
                          patchRow(row, { sort: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                    {STYLE_LABEL[tab] && (
                      <label className="grow basis-48 min-w-0">
                        <span className="text-[11px] text-shop-muted">
                          {STYLE_LABEL[tab]}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <input
                            className={inputCls}
                            value={row.style}
                            onChange={(e) =>
                              patchRow(row, { style: e.target.value })
                            }
                          />
                          {swatches(row.style).map((hex, j) => (
                            <span
                              key={j}
                              className="w-5 h-5 rounded-full shrink-0 border border-black/10"
                              style={{ background: hex }}
                            />
                          ))}
                        </div>
                      </label>
                    )}
                  </div>

                  <label className="block">
                    <span className="text-[11px] text-shop-muted">
                      Description shown to customer
                    </span>
                    <input
                      className={inputCls}
                      value={row.note}
                      onChange={(e) => patchRow(row, { note: e.target.value })}
                    />
                  </label>

                  {tab === "PAYMENT" && (
                    <label className="block">
                      <span className="text-[11px] text-shop-muted">
                        QR code (image URL or QR text, empty for none)
                      </span>
                      <input
                        className={inputCls}
                        value={row.qr ?? ""}
                        onChange={(e) =>
                          patchRow(row, { qr: e.target.value || null })
                        }
                      />
                    </label>
                  )}

                  <div className="flex flex-wrap items-center gap-3 justify-end pt-1">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(e) =>
                          patchRow(row, { active: e.target.checked })
                        }
                      />
                      Active
                    </label>
                    {tab === "MERCH" && (
                      <label
                        className="flex items-center gap-1.5 text-sm"
                        title="Tick for items with no name on them, like earrings — the form skips the name, letter size and bead mix steps."
                      >
                        <input
                          type="checkbox"
                          checked={row.plain}
                          onChange={(e) =>
                            patchRow(row, { plain: e.target.checked })
                          }
                        />
                        No beaded name
                      </label>
                    )}
                    <span className="mr-auto" />
                    <button
                      className="text-sm text-red-600"
                      onClick={() => deleteRow(row)}
                    >
                      Delete
                    </button>
                    <button
                      className="text-sm font-semibold text-white bg-shop-pink px-4 py-1.5 rounded-full disabled:opacity-40"
                      disabled={!row.dirty || row.saving || !row.value.trim()}
                      onClick={() => saveRow(row)}
                    >
                      {row.saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ))}

              <button
                className="text-sm font-semibold text-ink underline"
                onClick={addRow}
              >
                + Add a row
              </button>
            </div>
          </>
        )}
          </>
        )}
    </div>
  );
}
