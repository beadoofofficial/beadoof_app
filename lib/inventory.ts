export type StockStatus = "in" | "out" | "glitter";

export type ItemCategory =
  | "bead"
  | "finding"
  | "pin"
  | "hook"
  | "clasp"
  | "other";

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  bead: "Bead",
  finding: "Finding",
  pin: "Pin",
  hook: "Hook",
  clasp: "Clasp",
  other: "Other",
};

export const CATEGORY_VALUES: ItemCategory[] = [
  "bead",
  "finding",
  "pin",
  "hook",
  "clasp",
  "other",
];

export type InventoryItem = {
  id: string;
  barcode: string;
  name: string;
  category: ItemCategory;
  color_hex: string | null;
  is_assorted: boolean;
  is_lettered: boolean;
  variant_colors: string[];
  stock: StockStatus;
  quantity: number;
  low_stock_threshold: number;
  size_mm: number;
  max_per_design: number | null;
  price_cents: number | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryDraft = {
  barcode: string;
  name: string;
  category?: ItemCategory;
  color_hex?: string | null;
  is_assorted?: boolean;
  is_lettered?: boolean;
  variant_colors?: string[];
  stock?: StockStatus;
  quantity?: number;
  low_stock_threshold?: number;
  size_mm?: number;
  max_per_design?: number | null;
  price_cents?: number | null;
  image_url?: string | null;
  notes?: string | null;
};

/**
 * Default rainbow used when an assorted pack hasn't specified variant_colors.
 * Six segments matches the existing "ASSORTED_SWIRL" pattern in the UI.
 */
export const DEFAULT_ASSORTED_PALETTE = [
  "#ff6b6b",
  "#f7b733",
  "#52c41a",
  "#13c2c2",
  "#1890ff",
  "#9c27b0",
];

/**
 * Returns the colors to render for an assorted-style swirl. If variant_colors
 * has entries (and at least 1 hex), those win; otherwise we fall back to the
 * rainbow default. Components can pipe this into either a CSS conic-gradient
 * (web) or SVG pie slices (email receipt).
 */
export function assortedColorsFor(
  variant_colors: string[] | null | undefined,
): string[] {
  if (variant_colors && variant_colors.length > 0) return variant_colors;
  return DEFAULT_ASSORTED_PALETTE;
}

/** Build a CSS conic-gradient string from a color list. */
export function buildAssortedSwirlCss(colors: string[]): string {
  if (colors.length === 0) return "transparent";
  if (colors.length === 1) return colors[0];
  // Repeat the first color at the end so the gradient closes cleanly.
  const stops = [...colors, colors[0]].join(",");
  return `conic-gradient(from 0deg,${stops})`;
}

export function stockLevelOf(
  item: Pick<InventoryItem, "quantity" | "low_stock_threshold" | "stock">,
): "out" | "low" | "ok" {
  if (item.stock === "out" || item.quantity <= 0) return "out";
  if (item.quantity <= (item.low_stock_threshold ?? 5)) return "low";
  return "ok";
}
