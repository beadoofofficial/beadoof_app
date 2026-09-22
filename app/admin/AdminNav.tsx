"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Orders", icon: "🧾" },
  { href: "/admin/shop", label: "Shop editor", icon: "🛍️" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto" aria-label="Admin sections">
      {TABS.map((t) => {
        const active =
          t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              active
                ? "bg-shop-pink text-white shadow-sm"
                : "text-ink/80 hover:bg-cord/30"
            }`}
          >
            <span aria-hidden className="mr-1">
              {t.icon}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
