"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

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

function writeItems(items: Item[]) {
  localStorage.setItem("beadoof:items", JSON.stringify(items));
}

export default function AdminPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [img, setImg] = useState("");

  useEffect(() => {
    setItems(readItems());
  }, []);

  function addItem() {
    if (!title.trim()) return;
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const newItem = { id, title: title.trim(), img: img || "/file.svg" };
    const next = [...items.filter((i) => i.id !== id), newItem];
    setItems(next);
    writeItems(next);
    setTitle("");
    setImg("");
  }

  function removeItem(id: string) {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    writeItems(next);
  }

  return (
    <div className="min-h-screen bg-[rgba(250,246,241,1)] p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Beadoof Admin</h1>
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/admin/inventory"
              className="px-3 py-1.5 rounded-full bg-[#5a3a24] text-white"
            >
              Inventory & Barcodes
            </Link>
            <Link href="/" className="text-[#7a6a60] underline">
              Back to Home
            </Link>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <input
              className="col-span-1 border rounded px-3 py-2"
              placeholder="Item title (eg. Bracelet)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="col-span-1 border rounded px-3 py-2"
              placeholder="Image path (eg. /file.svg)"
              value={img}
              onChange={(e) => setImg(e.target.value)}
            />
            <div className="col-span-1 flex">
              <button
                className="ml-auto bg-[#8a5a3b] text-white px-4 rounded"
                onClick={addItem}
              >
                Add
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.length === 0 && (
              <div className="text-sm text-[#7a6a60]">No items yet.</div>
            )}
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between p-2 border rounded"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 relative">
                    <Image
                      src={it.img}
                      alt={it.title}
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div>
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-[#7a6a60]">{it.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="text-sm text-red-600"
                    onClick={() => removeItem(it.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
