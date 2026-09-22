// Imports orders from the Google Sheet export (BEADOOF ORDER - Sheet1.csv)
// into the Supabase orders table.
//
//   node scripts/import-orders.mjs "C:\path\to\BEADOOF ORDER - Sheet1.csv" --dry-run
//   node scripts/import-orders.mjs "C:\path\to\BEADOOF ORDER - Sheet1.csv"
//
// Sheet rows have no order codes, so each row gets a generated one from its
// order date (BDF-MMDD-901 upward — a 9xx block so they can never collide
// with codes the app hands out, which count up from 001). The code column
// is unique, which makes re-running this script safe: rows that are already
// in land as "skipped".
//
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from
// .env.local. Inserts run as the anon role, which the orders RLS allows for
// guest orders (user_id null).

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------------------------------------------------------------- args */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvPath = args.find((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error('Usage: node scripts/import-orders.mjs "<csv path>" [--dry-run]');
  process.exit(1);
}

/* ---------------------------------------------------------------- env */

function loadEnvLocal() {
  const out = {};
  try {
    const raw = readFileSync(join(projectRoot, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* fall through to process.env */
  }
  return out;
}

const env = { ...loadEnvLocal(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not found (.env.local).",
  );
  process.exit(1);
}
const supabase = createClient(url, key);

/* ---------------------------------------------------------------- csv */

/** Minimal RFC-4180 parser: quoted fields, embedded commas and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

/* ---------------------------------------------------------------- dates */

/** "9/16/2026" (M/D/YYYY) → { iso: "2026-09-16", mmdd: "0916" } */
function parseSlashDate(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const pad = (n) => String(n).padStart(2, "0");
  return { iso: `${y}-${pad(mo)}-${pad(d)}`, mmdd: `${pad(mo)}${pad(d)}` };
}

/** "Sep 17 2026" (and most other readable forms) → "2026-09-17" */
function parseLooseDate(s) {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const slash = parseSlashDate(t);
  if (slash) return slash.iso;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------------------------------------------------------------- run */

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

async function main() {
  const text = readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  if (rows.length < 2) {
    console.error("The CSV has no data rows.");
    process.exit(1);
  }

  // headers in the sheet carry trailing spaces ("Name ", "Payment ") — trim
  const headers = rows[0].map((h) => clean(h).toLowerCase());
  const col = (name) => headers.indexOf(name);
  const idx = {
    merch: col("merch name"),
    code: col("order code"),
    customer: col("order name"),
    color: col("color"),
    name: col("name"),
    design: col("main design"),
    size: col("size"),
    addons: col("additional"),
    payment: col("payment"),
    orderDate: col("order date"),
    deliveryDate: col("date delivery"),
    total: col("total"),
    status: col("status"),
    discount: col("discounted"),
    bead: col("bead style"),
    fulfillment: col("fulfillment"),
    contact: col("contact"),
    notes: col("notes"),
    timestamp: col("timestamp"),
    creating: col("creating status"),
  };
  for (const [k, i] of Object.entries(idx)) {
    if (i === -1) {
      console.error(`Column for "${k}" not found. Headers seen: ${headers.join(" | ")}`);
      process.exit(1);
    }
  }

  // shop's code prefix, so generated codes match the app's
  let prefix = "BDF";
  const { data: prefixRow } = await supabase
    .from("shop_settings")
    .select("value")
    .eq("key", "ORDER_CODE_PREFIX")
    .maybeSingle();
  if (prefixRow?.value) prefix = clean(prefixRow.value).toUpperCase();

  // generated codes count 901+ per day so they never meet the app's 001+
  const perDaySeq = {};
  const nextCode = (mmdd) => {
    perDaySeq[mmdd] = (perDaySeq[mmdd] ?? 900) + 1;
    return `${prefix}-${mmdd}-${perDaySeq[mmdd]}`;
  };

  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = (i) => clean(row[i]);

    const customer = cell(idx.customer);
    const merch = cell(idx.merch);
    if (!customer && !merch) continue; // decorative / stray row

    const orderDate = parseSlashDate(cell(idx.orderDate));
    const beadName = cell(idx.name);
    const size = cell(idx.size);
    const bead = cell(idx.bead);
    const addons = cell(idx.addons)
      ? cell(idx.addons).split(",").map(clean).filter(Boolean)
      : [];
    const totalRaw = cell(idx.total).replace(/[^\d.]/g, "");
    const total = totalRaw ? Math.round(Number(totalRaw)) : null;

    const piece = {
      merch,
      color: cell(idx.color),
      beadName,
      design: cell(idx.design),
      size: size || null,
      bead: bead || null,
      addons,
      // no name and no letter size on the sheet = a "no beaded name" item
      plain: !beadName && !size,
      subtotal: total ?? 0,
    };

    records.push({
      sheetRow: r + 1,
      insert: {
        user_id: null,
        code: cell(idx.code) || nextCode(orderDate?.mmdd ?? "0000"),
        customer_name: customer || "Unknown",
        contact: cell(idx.contact) || null,
        fulfillment: cell(idx.fulfillment) || null,
        merch: merch || null,
        color: piece.color || null,
        bead_name: beadName || null,
        charm: piece.design || null,
        letter_size: piece.size,
        bead_mix: piece.bead,
        addons,
        pieces: [piece],
        piece_count: 1,
        payment: cell(idx.payment) || null,
        notes: cell(idx.notes) || null,
        design: { importedFrom: "BEADOOF ORDER sheet", sheetRow: r + 1 },
        subtotal: null, // the sheet only kept the discounted total
        discount_label: cell(idx.discount) || null,
        total,
        payment_status: cell(idx.status) || "Unpaid",
        creating_status: /^done$/i.test(cell(idx.creating))
          ? "Done"
          : /progress/i.test(cell(idx.creating))
            ? "In progress"
            : cell(idx.creating) || null,
        delivery_date: parseLooseDate(cell(idx.deliveryDate)),
        created_at:
          parseLooseDate(cell(idx.timestamp)) ?? orderDate?.iso ?? undefined,
      },
    });
  }

  console.log(`Parsed ${records.length} orders from ${csvPath}`);

  if (dryRun) {
    for (const rec of records.slice(0, 5)) {
      console.log(`\nrow ${rec.sheetRow}:`, JSON.stringify(rec.insert, null, 2));
    }
    if (records.length > 5) console.log(`\n… and ${records.length - 5} more.`);
    console.log("\nDry run — nothing was written. Run without --dry-run to import.");
    return;
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  for (const rec of records) {
    const { error } = await supabase.from("orders").insert(rec.insert);
    if (!error) {
      inserted++;
    } else if (error.code === "23505") {
      skipped++; // code already there — imported on an earlier run
    } else {
      failed++;
      console.error(`row ${rec.sheetRow} (${rec.insert.code}): ${error.message}`);
    }
  }

  console.log(
    `\nDone: ${inserted} imported, ${skipped} skipped (already in), ${failed} failed.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
