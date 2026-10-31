// Reading a fan's spending as a number, from what their profile showed.

import type { SavedStats } from './store';

// Where spending starts to matter, and where it stands out.
export const SPENDER = 100;
export const WHALE = 1000;

// "$1,204.50" → 1204.5, "$1.2K" → 1200. Null when there is no number.
export function parseMoney(value: string): number | null {
  const match = /(\d[\d,]*(?:\.\d+)?)\s*([kKmM]?)/.exec(value);
  if (!match) return null;
  const number = Number(match[1]!.replace(/,/g, ''));
  const scale = { k: 1e3, m: 1e6 }[match[2]!.toLowerCase()] ?? 1;
  return number * scale;
}

// What the fan has spent, or null when it isn't known: their profile hasn't been read, or
// it was gone before Nook ever read it. A profile that shows no spending counts as nothing spent.
export function spentOf(stats: SavedStats | undefined): number | null {
  if (!stats) return null;
  const item = stats.items.find((i) => /spent/i.test(i.label));
  return item ? (parseMoney(item.value) ?? 0) : stats.missing ? null : 0;
}

// Whole dollars, rounded down: $1,204.50 reads $1,204, never more than was spent.
export const formatMoney = (value: number) => `$${Math.floor(value).toLocaleString('en-US')}`;
