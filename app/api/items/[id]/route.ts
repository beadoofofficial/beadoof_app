import { NextResponse } from "next/server";
import { removeItem } from "../../../../lib/db.server";

export async function DELETE(_req: Request, context: any) {
  // context.params may be a Promise in some typings, normalize it
  const ctxParams =
    context?.params && typeof context.params.then === "function"
      ? await context.params
      : context?.params;
  const id = ctxParams?.id;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  removeItem(id);
  return NextResponse.json({ ok: true });
}
