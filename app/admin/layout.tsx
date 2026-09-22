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
    <div className="min-h-screen bg-paper font-shop text-ink">
      <header className="sticky top-0 z-20 bg-paper/95 backdrop-blur border-b border-cord/50">
        {/* phones: brand + view-shop on one line, tabs on their own scrollable
            line; from md everything sits on a single row */}
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-2.5 md:py-3 flex items-center gap-x-4 gap-y-2 flex-wrap">
          <Link
            href="/admin"
            className="order-1 shrink-0 font-[family-name:var(--font-fredoka)] font-semibold text-lg tracking-wide text-ink"
          >
            BEADOOF{" "}
            <span className="text-[11px] font-normal uppercase tracking-widest text-shop-muted">
              admin
            </span>
          </Link>
          <Link
            href="/"
            className="order-2 md:order-3 ml-auto shrink-0 text-sm text-shop-muted underline underline-offset-2 hover:text-ink"
          >
            View shop →
          </Link>
          <div className="order-3 md:order-2 w-full min-w-0 md:w-auto md:flex-1">
            <AdminNav />
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5">{children}</main>
    </div>
  );
}
