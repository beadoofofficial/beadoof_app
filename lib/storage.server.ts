import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

function ensure() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function saveBase64Image(base64: string, filename: string) {
  ensure();
  // base64 data URI maybe like 'data:image/png;base64,...'
  const match = base64.match(/^data:(.+);base64,(.+)$/);
  let data = base64;
  if (match) data = match[2];
  const buffer = Buffer.from(data, "base64");
  const out = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(out, buffer);
  return `/uploads/${filename}`;
}
