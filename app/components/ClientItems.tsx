"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useActiveItem } from "./ActiveItemProvider";

type Item = { id: string; title: string; img: string };

function readItems(): Item[] {
  try {
    const raw = localStorage.getItem("beadoof:items");
    if (!raw) return [];
    return JSON.parse(raw) as Item[];
  } catch {
    return [];
  }
}

function CheckBadge() {
  return (
    <span className="absolute -top-1.5 -right-1.5 md:-top-2 md:-right-2 w-5 h-5 md:w-6 md:h-6 rounded-full bg-[#5a3a24] flex items-center justify-center shadow-md ring-2 ring-[#faf3ea]">
      <svg
        viewBox="0 0 24 24"
        className="w-3 h-3 md:w-3.5 md:h-3.5 text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  );
}

export default function ClientItems({ fallback }: { fallback: Item[] }) {
  const [items, setItems] = useState<Item[]>(fallback);
  const { activeItemId, setActiveItemId } = useActiveItem();

  useEffect(() => {
    const stored = readItems();
    if (stored && stored.length) {
      setItems(stored);
    }
  }, []);

  return (
    <>
      {items.map((it) => {
        const isActive = it.id === activeItemId;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => setActiveItemId(it.id)}
            aria-pressed={isActive}
            className={[
              "relative w-full aspect-square flex flex-col items-center justify-center gap-1 md:gap-1.5 rounded-2xl bg-white p-1.5 md:p-3 shadow-sm transition-all",
              isActive
                ? "ring-2 ring-[#5a3a24]"
                : "ring-1 ring-transparent hover:ring-[#e6d7cd]",
            ].join(" ")}
          >
            {isActive && <CheckBadge />}
            <Image
              src={it.img}
              alt={it.title || it.id}
              width={96}
              height={96}
              className="w-3/5 md:w-3/4 h-auto object-contain"
            />
            {it.title ? (
              <span className="text-[10px] md:text-sm font-semibold text-[#5a4438] text-center leading-tight">
                {it.title}
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
}
