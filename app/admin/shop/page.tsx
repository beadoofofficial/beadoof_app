"use client";

// Shop catalog + settings editor — the replacement for the Google Sheet tabs
// of the Apps Script version. Each tab here is one step of the order wizard.

import { useEffect, useState } from "react";
import {
  CATEGORIES,
  pieceSubtotalOf,
  type Category,
  type ShopOption,
  type ShopOptions,
} from "@/lib/shop";

// _key is a stable client-side identity: rows must never be matched by object
// reference, because every state update replaces the object (a save that set
// saving:true would then never find its row again to clear it).
type Row = ShopOption & {
  id?: string;
  _key: string;
  dirty?: boolean;
  saving?: boolean;
};

/** A pre-made catalogue design, as /api/shop/designs speaks it: a saved
    recipe over the catalog. Its price is computed, never typed. */
type DesignRow = {
  id?: string;
  name: string;
  note: string;
  merch: string;
  bead_name: string;
  charm: string;
  letter_size: string | null;
  bead_mix: string | null;
  addons: string[];
  color: string | null;
  set_id: string | null;
  image_url: string | null;
  active: boolean;
  sort: number;
  _key: string;
  dirty?: boolean;
  saving?: boolean;
};

/** A set/category from the managed list (shop_sets). */
type SetRow = {
  id?: string;
  name: string;
  sort: number;
  _key: string;
  dirty?: boolean;
  saving?: boolean;
};

/** The shop editor's tabs: the option categories plus the designs catalogue. */
type Tab = Category | "PREMADE";
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
  const [tab, setTab] = useState<Tab>("MERCH");
  const [rows, setRows] = useState<Row[]>([]);
  const [designRows, setDesignRows] = useState<DesignRow[]>([]);
  const [setList, setSetList] = useState<SetRow[]>([]);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // loading starts true and error starts null, so the initial load only
  // touches state from promise callbacks — never synchronously in the effect.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/shop/options"),
      fetch("/api/shop/settings"),
      fetch("/api/shop/designs"),
      fetch("/api/shop/sets"),
    ])
      .then(async ([optRes, setRes, desRes, setsRes]) => {
        const opts = await optRes.json();
        const sets = await setRes.json();
        const des = await desRes.json();
        const setList = await setsRes.json();
        if (!optRes.ok) throw new Error(opts.error || "options failed");
        if (!setRes.ok) throw new Error(sets.error || "settings failed");
        if (cancelled) return;
        setRows(
          (opts as ShopOption[]).map((o) => ({
            ...o,
            _key: o.id ?? crypto.randomUUID(),
          })),
        );
        setSettings(sets as Setting[]);
        // a missing shop_designs table just means the tab starts empty
        if (desRes.ok && Array.isArray(des)) {
          setDesignRows(
            (des as Omit<DesignRow, "_key">[]).map((d) => ({
              ...d,
              _key: d.id ?? crypto.randomUUID(),
            })),
          );
        }
        if (setsRes.ok && Array.isArray(setList)) {
          setSetList(
            (setList as Omit<SetRow, "_key">[]).map((s) => ({
              ...s,
              _key: s.id ?? crypto.randomUUID(),
            })),
          );
        }
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
      rs.map((r) => (r._key === row._key ? { ...r, ...patch, dirty: true } : r)),
    );
  }

  async function saveRow(row: Row) {
    setRows((rs) =>
      rs.map((r) => (r._key === row._key ? { ...r, saving: true } : r)),
    );
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
          r._key === row._key
            ? {
                ...(data as ShopOption),
                _key: row._key,
                dirty: false,
                saving: false,
              }
            : r,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setRows((rs) =>
        rs.map((r) => (r._key === row._key ? { ...r, saving: false } : r)),
      );
    }
  }

  async function deleteRow(row: Row) {
    if (!row.id) {
      setRows((rs) => rs.filter((r) => r._key !== row._key));
      return;
    }
    if (!confirm(`Delete "${row.value}"? Unticking Active hides it instead.`))
      return;
    const res = await fetch(`/api/shop/options?id=${row.id}`, {
      method: "DELETE",
    });
    if (res.ok) setRows((rs) => rs.filter((r) => r._key !== row._key));
    else setError("Delete failed.");
  }

  function addRow() {
    if (tab === "PREMADE") return; // designs have their own add button
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
        _key: crypto.randomUUID(),
        dirty: true,
      },
    ]);
  }

  /* ---------------- pre-made designs ---------------- */

  function patchDesign(row: DesignRow, patch: Partial<DesignRow>) {
    setDesignRows((rs) =>
      rs.map((r) =>
        r._key === row._key ? { ...r, ...patch, dirty: true } : r,
      ),
    );
  }

  async function saveDesign(row: DesignRow) {
    setDesignRows((rs) =>
      rs.map((r) => (r._key === row._key ? { ...r, saving: true } : r)),
    );
    try {
      const res = await fetch("/api/shop/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(row),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save failed");
      setDesignRows((rs) =>
        rs.map((r) =>
          r._key === row._key
            ? {
                ...(data as Omit<DesignRow, "_key">),
                _key: row._key,
                dirty: false,
                saving: false,
              }
            : r,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setDesignRows((rs) =>
        rs.map((r) => (r._key === row._key ? { ...r, saving: false } : r)),
      );
    }
  }

  async function deleteDesign(row: DesignRow) {
    if (!row.id) {
      setDesignRows((rs) => rs.filter((r) => r._key !== row._key));
      return;
    }
    if (!confirm(`Delete "${row.name}"? Unticking Active hides it instead.`))
      return;
    const res = await fetch(`/api/shop/designs?id=${row.id}`, {
      method: "DELETE",
    });
    if (res.ok) setDesignRows((rs) => rs.filter((r) => r._key !== row._key));
    else setError("Delete failed.");
  }

  function addDesign() {
    const maxSort = Math.max(0, ...designRows.map((r) => r.sort));
    setDesignRows((rs) => [
      ...rs,
      {
        name: "",
        note: "",
        merch: "",
        bead_name: "",
        charm: "",
        letter_size: null,
        bead_mix: null,
        addons: [],
        color: null,
        set_id: null,
        image_url: null,
        active: true,
        sort: maxSort + 1,
        _key: crypto.randomUUID(),
        dirty: true,
      },
    ]);
  }

  /* ---------------- sets (the managed category list) ---------------- */

  function patchSet(row: SetRow, patch: Partial<SetRow>) {
    setSetList((rs) =>
      rs.map((r) => (r._key === row._key ? { ...r, ...patch, dirty: true } : r)),
    );
  }

  async function saveSet(row: SetRow) {
    setSetList((rs) =>
      rs.map((r) => (r._key === row._key ? { ...r, saving: true } : r)),
    );
    try {
      const res = await fetch("/api/shop/sets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(row),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "save failed");
      setSetList((rs) =>
        rs.map((r) =>
          r._key === row._key
            ? { ...(data as Omit<SetRow, "_key">), _key: row._key, dirty: false, saving: false }
            : r,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSetList((rs) =>
        rs.map((r) => (r._key === row._key ? { ...r, saving: false } : r)),
      );
    }
  }

  async function deleteSet(row: SetRow) {
    if (!row.id) {
      setSetList((rs) => rs.filter((r) => r._key !== row._key));
      return;
    }
    if (
      !confirm(
        `Delete the set "${row.name}"? Its designs stay, just ungrouped.`,
      )
    )
      return;
    const res = await fetch(`/api/shop/sets?id=${row.id}`, { method: "DELETE" });
    if (res.ok) {
      setSetList((rs) => rs.filter((r) => r._key !== row._key));
      setDesignRows((rs) =>
        rs.map((r) => (r.set_id === row.id ? { ...r, set_id: null } : r)),
      );
    } else setError("Delete failed.");
  }

  /** "+ New set…" in a design's dropdown: name it, save it, use it. */
  async function createSetFor(designRow: DesignRow) {
    const name = prompt("Name the new set/category:")?.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/shop/sets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, sort: setList.length + 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "could not add the set");
      setSetList((rs) => [
        ...rs,
        { ...(data as Omit<SetRow, "_key">), _key: data.id },
      ]);
      patchDesign(designRow, { set_id: data.id as string });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the set.");
    }
  }

  /** The catalog as the wizard sees it, for pricing design recipes live. */
  function optionsFromRows(): ShopOptions {
    const g = Object.fromEntries(
      CATEGORIES.map((c) => [c, [] as ShopOption[]]),
    ) as ShopOptions;
    for (const r of rows) g[r.category]?.push(r);
    return g;
  }

  /** Active values for a recipe select, keeping a now-inactive current value. */
  function optionValues(cat: Category, current?: string | null): string[] {
    const act = rows
      .filter((r) => r.category === cat && r.active)
      .map((r) => r.value);
    return current && !act.includes(current) ? [current, ...act] : act;
  }

  function designPrice(r: DesignRow): number {
    const ppl =
      Number(settings.find((s) => s.key === "PRICE_PER_LETTER")?.value) || 0;
    return pieceSubtotalOf(
      optionsFromRows(),
      {
        merch: r.merch || undefined,
        color: r.color || undefined,
        beadName: r.bead_name || undefined,
        design: r.charm || undefined,
        size: r.letter_size || undefined,
        bead: r.bead_mix || undefined,
        addons: r.addons,
      },
      ppl,
    );
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
    "w-full rounded-xl border-2 border-cord/50 bg-white px-2.5 py-1.5 text-sm text-ink focus:border-aqua focus:outline-none";
  const pillCls = (on: boolean) =>
    `cursor-pointer rounded-full px-3 py-1.5 font-display text-[13px] font-medium ${
      on ? "bg-shop-pink text-white shadow-sm" : "bg-white text-ink/80 hover:bg-cord/30"
    }`;

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
                  className={pillCls(!showSettings && tab === c)}
                  onClick={() => {
                    setShowSettings(false);
                    setTab(c);
                  }}
                >
                  {TAB_LABEL[c]}
                </button>
              ))}
              <button
                className={pillCls(!showSettings && tab === "PREMADE")}
                onClick={() => {
                  setShowSettings(false);
                  setTab("PREMADE");
                }}
              >
                🖼️ Pre-made designs
              </button>
              <button
                className={pillCls(showSettings)}
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
              className="cursor-pointer rounded-full bg-shop-pink px-5 py-2 font-display text-sm font-medium text-white shadow-[0_3px_0_#c93a74] active:translate-y-[2px] active:shadow-[0_1px_0_#c93a74] disabled:opacity-50 disabled:shadow-none"
              disabled={savingSettings || !settings.some((s) => s.dirty)}
              onClick={saveSettings}
            >
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </div>
        ) : tab === "PREMADE" ? (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs text-shop-muted">
              Ready-made pieces customers buy as-is, choosing only a colour
              (from the 🎨 Colours tab). Build each design like a custom order —
              the price is worked out from those choices, so it follows your
              catalog prices automatically.
            </p>

            {/* the managed set/category list: rename here renames everywhere */}
            <div className="rounded-xl bg-paper/60 p-3">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="font-display text-[14px] font-medium">
                  Sets / categories
                </span>
                <span className="text-[11px] text-shop-muted">
                  The catalogue groups designs by these.
                </span>
              </div>
              <div className="space-y-1.5">
                {setList.map((s) => (
                  <div key={s._key} className="flex items-center gap-2">
                    <input
                      className={`${inputCls} max-w-56`}
                      value={s.name}
                      onChange={(e) => patchSet(s, { name: e.target.value })}
                    />
                    <input
                      className={`${inputCls} w-16`}
                      type="number"
                      title="Sort order"
                      value={s.sort}
                      onChange={(e) =>
                        patchSet(s, { sort: Number(e.target.value) || 0 })
                      }
                    />
                    <button
                      className="cursor-pointer rounded-full bg-shop-pink px-3 py-1 font-display text-xs font-medium text-white disabled:opacity-40"
                      disabled={!s.dirty || s.saving || !s.name.trim()}
                      onClick={() => saveSet(s)}
                    >
                      {s.saving ? "…" : "Save"}
                    </button>
                    <button
                      className="cursor-pointer text-xs text-[#a31346]"
                      onClick={() => deleteSet(s)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
                {setList.length === 0 && (
                  <p className="text-xs text-shop-muted">
                    No sets yet — add one below, or straight from a design&apos;s
                    Set dropdown.
                  </p>
                )}
                <button
                  className="cursor-pointer font-display text-xs font-medium text-shop-muted underline"
                  onClick={() =>
                    setSetList((rs) => [
                      ...rs,
                      {
                        name: "",
                        sort: rs.length + 1,
                        _key: crypto.randomUUID(),
                        dirty: true,
                      },
                    ])
                  }
                >
                  + Add a set
                </button>
              </div>
            </div>

            {designRows.length === 0 && (
              <div className="text-sm text-shop-muted">
                No designs yet — the Pre-made card stays hidden on the shop
                until you add one.
              </div>
            )}

            {designRows
              .slice()
              .sort((a, b) => a.sort - b.sort)
              .map((row) => (
                <div
                  key={row._key}
                  className="border border-cord/40 rounded-xl p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grow basis-40 min-w-0">
                      <span className="text-[11px] text-shop-muted">
                        Design name (shown in the catalogue)
                      </span>
                      <input
                        className={inputCls}
                        value={row.name}
                        onChange={(e) =>
                          patchDesign(row, { name: e.target.value })
                        }
                      />
                    </label>
                    <label className="grow basis-36 min-w-0">
                      <span className="text-[11px] text-shop-muted">
                        Set / category (groups the catalogue)
                      </span>
                      <select
                        className={inputCls}
                        value={row.set_id ?? ""}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            void createSetFor(row);
                            return;
                          }
                          patchDesign(row, { set_id: e.target.value || null });
                        }}
                      >
                        <option value="">No set</option>
                        {setList
                          .filter((s) => s.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        <option value="__new__">＋ New set…</option>
                      </select>
                    </label>
                    <label className="w-20 shrink-0">
                      <span className="text-[11px] text-shop-muted">Sort</span>
                      <input
                        className={inputCls}
                        type="number"
                        value={row.sort}
                        onChange={(e) =>
                          patchDesign(row, { sort: Number(e.target.value) || 0 })
                        }
                      />
                    </label>
                  </div>

                  {/* the recipe: the same picks a customer makes in the wizard */}
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grow basis-36 min-w-0">
                      <span className="text-[11px] text-shop-muted">Item</span>
                      <select
                        className={inputCls}
                        value={row.merch}
                        onChange={(e) =>
                          patchDesign(row, { merch: e.target.value })
                        }
                      >
                        <option value="">Pick an item…</option>
                        {optionValues("MERCH", row.merch).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grow basis-36 min-w-0">
                      <span className="text-[11px] text-shop-muted">Colour</span>
                      <select
                        className={inputCls}
                        value={row.color ?? ""}
                        onChange={(e) =>
                          patchDesign(row, { color: e.target.value || null })
                        }
                      >
                        <option value="">Customer picks…</option>
                        {optionValues("COLOR", row.color).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grow basis-36 min-w-0">
                      <span className="text-[11px] text-shop-muted">
                        Name on the piece (optional)
                      </span>
                      <input
                        className={inputCls}
                        value={row.bead_name}
                        onChange={(e) =>
                          patchDesign(row, { bead_name: e.target.value })
                        }
                      />
                    </label>
                    <label className="grow basis-36 min-w-0">
                      <span className="text-[11px] text-shop-muted">
                        Main design
                      </span>
                      <select
                        className={inputCls}
                        value={row.charm}
                        onChange={(e) =>
                          patchDesign(row, { charm: e.target.value })
                        }
                      >
                        <option value="">Pick a design…</option>
                        {optionValues("DESIGN", row.charm).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    {row.bead_name.trim() !== "" && (
                      <label className="grow basis-36 min-w-0">
                        <span className="text-[11px] text-shop-muted">
                          Letter size
                        </span>
                        <select
                          className={inputCls}
                          value={row.letter_size ?? ""}
                          onChange={(e) =>
                            patchDesign(row, {
                              letter_size: e.target.value || null,
                            })
                          }
                        >
                          <option value="">Pick a size…</option>
                          {optionValues("SIZE", row.letter_size).map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="grow basis-36 min-w-0">
                      <span className="text-[11px] text-shop-muted">
                        Bead mix
                      </span>
                      <select
                        className={inputCls}
                        value={row.bead_mix ?? ""}
                        onChange={(e) =>
                          patchDesign(row, { bead_mix: e.target.value || null })
                        }
                      >
                        <option value="">Pick a mix…</option>
                        {optionValues("BEAD", row.bead_mix).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div>
                    <span className="text-[11px] text-shop-muted">Add-ons</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {optionValues("ADDON").map((v) => {
                        const on = row.addons.includes(v);
                        return (
                          <button
                            key={v}
                            type="button"
                            className={`cursor-pointer rounded-full border-2 px-2.5 py-1 text-xs font-semibold ${
                              on
                                ? "border-shop-pink bg-shop-pink/10 text-shop-pink"
                                : "border-cord/60 bg-white text-shop-muted"
                            }`}
                            onClick={() =>
                              patchDesign(row, {
                                addons: on
                                  ? row.addons.filter((a) => a !== v)
                                  : [...row.addons, v],
                              })
                            }
                          >
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-[11px] text-shop-muted">
                      Description shown to customer
                    </span>
                    <input
                      className={inputCls}
                      value={row.note}
                      onChange={(e) => patchDesign(row, { note: e.target.value })}
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] text-shop-muted">
                      Photo URL (optional — replaces the drawn preview)
                    </span>
                    <input
                      className={inputCls}
                      value={row.image_url ?? ""}
                      onChange={(e) =>
                        patchDesign(row, { image_url: e.target.value || null })
                      }
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-3 justify-end pt-1">
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(e) =>
                          patchDesign(row, { active: e.target.checked })
                        }
                      />
                      Active
                    </label>
                    <span
                      className="text-sm font-bold text-shop-pink tabular-nums"
                      title="Worked out from the catalog prices, before any colour surcharge"
                    >
                      = PHP {designPrice(row).toLocaleString()}
                    </span>
                    <span className="mr-auto" />
                    <button
                      className="text-sm text-[#a31346]"
                      onClick={() => deleteDesign(row)}
                    >
                      Delete
                    </button>
                    <button
                      className="cursor-pointer rounded-full bg-shop-pink px-4 py-1.5 font-display text-sm font-medium text-white shadow-[0_3px_0_#c93a74] active:translate-y-[2px] active:shadow-[0_1px_0_#c93a74] disabled:opacity-40 disabled:shadow-none"
                      disabled={
                        !row.dirty || row.saving || !row.name.trim() || !row.merch
                      }
                      onClick={() => saveDesign(row)}
                    >
                      {row.saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ))}

            <button
              className="cursor-pointer font-display text-sm font-medium text-shop-muted underline"
              onClick={addDesign}
            >
              + Add a design
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

              {tabRows.map((row) => (
                <div
                  key={row._key}
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
                      className="cursor-pointer rounded-full bg-shop-pink px-4 py-1.5 font-display text-sm font-medium text-white shadow-[0_3px_0_#c93a74] active:translate-y-[2px] active:shadow-[0_1px_0_#c93a74] disabled:opacity-40 disabled:shadow-none"
                      disabled={!row.dirty || row.saving || !row.value.trim()}
                      onClick={() => saveRow(row)}
                    >
                      {row.saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ))}

              <button
                className="cursor-pointer font-display text-sm font-medium text-shop-muted underline"
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
