import fs from "fs";
import path from "path";
import { Item } from "./types";

const DATA_PATH = path.join(process.cwd(), "data");
const ITEMS_FILE = path.join(DATA_PATH, "items.json");

function ensure() {
  if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH);
  if (!fs.existsSync(ITEMS_FILE))
    fs.writeFileSync(ITEMS_FILE, JSON.stringify([]));
}

export function readItems(): Item[] {
  ensure();
  try {
    const raw = fs.readFileSync(ITEMS_FILE, "utf8");
    return JSON.parse(raw) as Item[];
  } catch {
    return [];
  }
}

export function writeItems(items: Item[]) {
  ensure();
  fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2));
}

export function addOrUpdateItem(item: Item) {
  const items = readItems().filter((i) => i.id !== item.id);
  items.push(item);
  writeItems(items);
  return item;
}

export function removeItem(id: string) {
  const items = readItems().filter((i) => i.id !== id);
  writeItems(items);
  return true;
}
