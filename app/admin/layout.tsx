import type { Metadata } from "next";
import Link from "next/link";
import AdminNav from "./AdminNav";

// One shell for every admin page: brand, section tabs, consistent canvas.
// Pages only render their content — no per-page headers or backgrounds.
// Fredoka/Karla come from the root layout's <html> font variables.

export const metadata: Metadata = {
  title: "BEADOOF admin",
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-[#faf3ea] text-foreground">
      <header className="sticky top-0 z-20 bg-[#faf3ea]/95 backdrop-blur border-b border-[#eadbc9]">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex items-center gap-4 flex-wrap">
          <Link
            href="/admin"
            className="font-[family-name:var(--font-fredoka)] font-semibold text-lg tracking-wide text-[#5a3a24]"
          >
            BEADOOF{" "}
            <span className="text-[11px] font-normal uppercase tracking-widest text-[#9a8478]">
              admin
            </span>
          </Link>
          <AdminNav />
          <Link
            href="/"
            className="ml-auto shrink-0 text-sm text-[#7a6a60] underline underline-offset-2 hover:text-[#5a3a24]"
          >
            View shop →
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5">{children}</main>
    </div>
  );
}
