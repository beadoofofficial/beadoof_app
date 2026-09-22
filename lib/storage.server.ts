import "server-only";
import { createClient } from "@supabase/supabase-js";

// File uploads live in the Supabase Storage bucket "uploads" (created by
// supabase/migrations/20260923_storage_bucket.sql): proofs/ for customer
// payment screenshots, inventory/ for admin photos. The old public/uploads
// folder on local disk is gone — it never worked on Vercel's read-only
// serverless filesystem.

const BUCKET = "uploads";

function storageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

/** The public URL a path inside the bucket will be served from.
    Deterministic — the object does not have to exist yet. */
export function publicUploadUrl(path: string): string {
  return storageClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Uploads raw bytes to the bucket. Throws on failure. */
export async function uploadToBucket(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await storageClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);
}

/** Uploads a base64 / data-URI payload and returns its public URL. */
export async function uploadBase64(
  folder: string,
  filename: string,
  base64: string,
): Promise<string> {
  const match = String(base64).match(/^data:([a-z0-9.+/-]+);base64,(.+)$/i);
  const contentType = match ? match[1] : "application/octet-stream";
  const bytes = Buffer.from(match ? match[2] : base64, "base64");
  const path = `${folder}/${filename}`;
  await uploadToBucket(path, bytes, contentType);
  return publicUploadUrl(path);
}
