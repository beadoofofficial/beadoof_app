import Image from "next/image";
import Link from "next/link";
import ClientItems from "./components/ClientItems";
import DesignBuilder, { type Bead } from "./components/DesignBuilder";
import { ActiveItemProvider } from "./components/ActiveItemProvider";
import { IconHeart } from "./components/icons";
import { getInventory } from "@/lib/inventory.server";
import { getUser } from "@/lib/auth.server";
import type { InventoryItem } from "@/lib/inventory";

const ITEMS = [
  { id: "bracelet", title: "Bracelet", img: "/logo.png" },
  { id: "lanyard", title: "Lanyard", img: "/logo.png" },
];

const EXAMPLES = [
  { id: "ex-1", img: "/logo.png" },
  { id: "ex-2", img: "/logo.png" },
];

function toBead(it: InventoryItem): Bead {
  return {
    color: it.color_hex || "#d9b48a",
    stock: it.stock,
    name: it.name,
    assorted: it.is_assorted,
    lettered: it.is_lettered,
    quantity: it.quantity,
    lowThreshold: it.low_stock_threshold,
    sizeMm: it.size_mm,
  };
}

function NavIcon({
  kind,
  active,
}: {
  kind: "home" | "heart" | "bag" | "user";
  active?: boolean;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: active ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "w-6 h-6",
    "aria-hidden": true,
  };
  switch (kind) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H4a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common}>
          <path d="M20.8 6.6a5 5 0 0 0-7.1 0L12 8.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
        </svg>
      );
    case "bag":
      return (
        <svg {...common}>
          <path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8z" />
          <path d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
  }
}

function EmptyInventoryCard() {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 flex flex-col items-center text-center gap-4">
      <div className="relative w-20 h-20 md:w-24 md:h-24">
        <Image
          src="/logo.png"
          alt=""
          fill
          sizes="96px"
          className="object-contain"
        />
      </div>
      <div>
        <h2 className="text-lg md:text-xl font-bold">
          No beads in inventory yet
        </h2>
        <p className="text-sm text-[#7a6a60] mt-1 max-w-sm">
          Add your first beads by scanning their barcodes in the admin
          inventory. Once you have at least one bead, your palette and design
          builder will appear here.
        </p>
      </div>
      <Link
        href="/admin/inventory"
        className="inline-flex items-center gap-2 bg-[#5a3a24] text-white px-4 py-2 rounded-full text-sm font-semibold"
      >
        Open inventory
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

export default async function Home() {
  const [inventory, user] = await Promise.all([getInventory(), getUser()]);
  const beads: Bead[] = inventory.map(toBead);
  const empty = inventory.length === 0;
  const greetingName = user?.email ? user.email.split("@")[0] : "Maker";

  return (
    <div className="min-h-screen flex flex-col bg-[#faf3ea] font-sans text-foreground overflow-x-clip">
      <header className="w-full max-w-6xl mx-auto px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative w-16 h-16 md:w-20 md:h-20 shrink-0">
            <Image
              src="/logo.png"
              alt="Beadoof mascot"
              fill
              sizes="80px"
              className="object-contain"
              priority
            />
          </div>
          <div className="leading-tight">
            <div className="text-3xl md:text-4xl font-extrabold tracking-tight flex items-baseline">
              <span>Bead</span>
              <span className="relative inline-block w-[0.85em] h-[0.85em] mx-[0.02em] rounded-full bg-[#b07a48] shadow-[inset_0_-3px_4px_rgba(0,0,0,0.25),inset_0_2px_3px_rgba(255,255,255,0.25)]">
                <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[0.2em] h-[0.2em] rounded-full bg-[#5a3a24]" />
              </span>
              <span>of</span>
            </div>
            <div className="text-xs md:text-sm text-[#8a6f5e] -mt-0.5">
              Design. Bead. Inspire.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm shrink-0">
          <div className="relative w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#f0d9c8] overflow-hidden">
            <Image
              src="/logo.png"
              alt="avatar"
              fill
              sizes="32px"
              className="object-cover"
            />
          </div>
          <span className="text-[#5a4438] font-medium hidden xs:inline truncate max-w-[140px]">
            Hi, {greetingName}!
          </span>
          {user ? (
            <Link
              href="/profile"
              aria-label="Open profile"
              className="text-[#9a8478] hover:text-[#5a3a24]"
            >
              <IconHeart className="w-5 h-5" />
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#5a3a24] text-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-3 md:px-6 pb-28">
        <ActiveItemProvider defaultId="bracelet">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)] gap-3 md:gap-6">
          {/* Left column */}
          <aside className="flex flex-col gap-3 md:gap-4 min-w-0">
            <div>
              <div className="text-xs md:text-sm font-semibold text-[#5a4438] mb-2 px-1">
                Choose Your Item
              </div>
              <div className="flex flex-col gap-2 md:gap-3">
                <ClientItems fallback={ITEMS} />
              </div>
            </div>

            <div>
              <div className="text-xs md:text-sm font-semibold text-[#5a4438] mb-2 px-1">
                Example Designs
              </div>
              <div className="flex flex-col gap-2 md:gap-3">
                {EXAMPLES.map((ex) => (
                  <div
                    key={ex.id}
                    className="aspect-square rounded-2xl bg-white shadow-sm border border-transparent flex items-center justify-center overflow-hidden"
                  >
                    <Image
                      src={ex.img}
                      alt={ex.id}
                      width={120}
                      height={120}
                      className="object-contain p-3"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="relative pt-12">
              <div className="absolute left-0 -bottom-2 w-20 h-20 md:w-24 md:h-24 z-10">
                <Image
                  src="/logo.png"
                  alt="helper mascot"
                  fill
                  sizes="96px"
                  className="object-contain"
                />
              </div>
              <div className="ml-10 md:ml-14 bg-[#8a5a3b] text-white rounded-2xl rounded-bl-sm p-3 text-[11px] md:text-xs leading-snug shadow-sm">
                <div className="font-semibold">Have fun creating!</div>
                <div className="mt-1 opacity-90">You&apos;re doing great!</div>
                <IconHeart className="w-3 h-3 mt-1 text-white/80" />
              </div>
            </div>
          </aside>

          {/* Right column: interactive design builder or empty state */}
          <section className="flex flex-col gap-3 md:gap-4 min-w-0">
            {empty ? <EmptyInventoryCard /> : <DesignBuilder beads={beads} />}
          </section>
        </div>
        </ActiveItemProvider>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#efe3d6] z-20">
        <div className="max-w-6xl mx-auto px-2 py-2 grid grid-cols-3 text-[11px] md:text-xs">
          <Link
            href="/"
            className="flex flex-col items-center gap-0.5 text-[#5a3a24]"
          >
            <NavIcon kind="home" active />
            <span className="font-semibold">Home</span>
          </Link>
          <Link
            href="/my-orders"
            className="flex flex-col items-center gap-0.5 text-[#9a8478]"
          >
            <NavIcon kind="bag" />
            <span>My orders</span>
          </Link>
          <Link
            href="/profile"
            className="flex flex-col items-center gap-0.5 text-[#9a8478]"
          >
            <NavIcon kind="user" />
            <span>Profile</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
