// Migrates the Apps Script era proof-of-payment files (downloaded from the
// Google Drive folder "BEADOOF proof of payment") into the Supabase Storage
// "uploads" bucket and links each one to its order.
//
//   node scripts/import-proofs.mjs "C:\path\to\extracted-folder" --dry-run
//   node scripts/import-proofs.mjs "C:\path\to\extracted-folder"
//
// The Apps Script named every file "<ORDER CODE> - <customer> - <date>.<ext>",
// so the order code is parsed straight from the filename. Files upload to a
// deterministic path (proofs/sheet/<filename>), which makes re-runs safe:
// a file that is already in the bucket is skipped entirely.
//
// Linking goes through the same shop_attach_proof RPC the customer form uses,
// so the payment status is nudged Unpaid → "Proof sent" but a status the
// owner already set (Paid) is left alone.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "uploads";

/* ---------------------------------------------------------------- args */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const folder = args.find((a) => !a.startsWith("--"));
if (!folder) {
  console.error('Usage: node scripts/import-proofs.mjs "<folder>" [--dry-run]');
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

/* ---------------------------------------------------------------- files */

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
};

// "BDF-0918-013 - Arielle Obar - 2026-09-18 2035.jpg" → BDF-0918-013
function codeFromName(name) {
  const m = name.match(/^([A-Za-z]{2,6}-\d{3,4}-\d{1,4})\b/);
  return m ? m[1].toUpperCase() : null;
}

function sanitize(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_");
}

/* ---------------------------------------------------------------- run */

async function main() {
  const entries = readdirSync(folder)
    .filter((f) => {
      try {
        return statSync(join(folder, f)).isFile();
      } catch {
        return false;
      }
    })
    // ascending name order = ascending timestamps, so an order with several
    // proofs ends up linked to its newest one (same as the live form)
    .sort((a, b) => a.localeCompare(b));

  if (!entries.length) {
    console.error(`No files found in ${folder}`);
    process.exit(1);
  }

  let linked = 0;
  let skipped = 0;
  let unmatched = 0;
  let failed = 0;

  for (const name of entries) {
    const code = codeFromName(name);
    const ext = extname(name).toLowerCase();
    const contentType = CONTENT_TYPES[ext];

    if (!code || !contentType) {
      unmatched++;
      console.warn(
        `SKIP  ${name} — ${!code ? "no order code in the filename" : `unsupported type ${ext || "(none)"}`}`,
      );
      continue;
    }

    const path = `proofs/sheet/${sanitize(name)}`;
    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    if (dryRun) {
      console.log(`would link ${code}  ←  ${name}`);
      linked++;
      continue;
    }

    // deterministic path: "already exists" means an earlier run handled it
    const bytes = readFileSync(join(folder, name));
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) {
      if (/already exists|duplicate/i.test(upErr.message)) {
        skipped++;
        continue;
      }
      failed++;
      console.error(`FAIL  ${name} — upload: ${upErr.message}`);
      continue;
    }

    const { data, error: rpcErr } = await supabase.rpc("shop_attach_proof", {
      p_code: code,
      p_url: publicUrl,
    });
    const result = data ?? {};
    if (rpcErr || !result.ok) {
      failed++;
      console.error(
        `FAIL  ${name} — link to ${code}: ${rpcErr?.message ?? result.error ?? "unknown"}`,
      );
      continue;
    }

    linked++;
    console.log(`ok    ${code}  ←  ${name}`);
  }

  console.log(
    `\nDone: ${linked} ${dryRun ? "would be linked" : "linked"}, ${skipped} skipped (already in), ${unmatched} unmatched, ${failed} failed.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
