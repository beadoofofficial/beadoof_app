export type StockStatus = "in" | "out" | "glitter";

export type InventoryItem = {
  id: string;
  barcode: string;
  name: string;
  color_hex: string | null;
  is_assorted: boolean;
  is_lettered: boolean;
  stock: StockStatus;
  quantity: number;
  low_stock_threshold: number;
  size_mm: number;
  price_cents: number | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryDraft = {
  barcode: string;
  name: string;
  color_hex?: string | null;
  is_assorted?: boolean;
  is_lettered?: boolean;
  stock?: StockStatus;
  quantity?: number;
  low_stock_threshold?: number;
  size_mm?: number;
  price_cents?: number | null;
  image_url?: string | null;
  notes?: string | null;
};

export function stockLevelOf(
  item: Pick<InventoryItem, "quantity" | "low_stock_threshold" | "stock">,
): "out" | "low" | "ok" {
  if (item.stock === "out" || item.quantity <= 0) return "out";
  if (item.quantity <= (item.low_stock_threshold ?? 5)) return "low";
  return "ok";
}
