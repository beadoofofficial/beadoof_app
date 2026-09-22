import "server-only";
import { createClient } from "@supabase/supabase-js";

// File uploads live in the Supabase Storage bucket "uploads" (created by
// supabase/migrations/20260923_storage_bucket.sql): proofs/ holds customer
// payment screenshots. The old public/uploads folder on local disk is gone —
// it never worked on Vercel's read-only serverless filesystem.

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

