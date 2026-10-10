/** Per-market tick history saved on the device so analysis survives refreshes. */
export interface StoredTick {
  e: number; // epoch seconds
  p: string; // price string with full pip precision
}

export const MAX_STORED_TICKS = 5000;
const key = (symbol: string) => `jumbo:ticks:${symbol}`;

export function loadTicks(symbol: string): StoredTick[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(symbol));
    const list = raw ? (JSON.parse(raw) as StoredTick[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveTicks(symbol: string, ticks: StoredTick[]) {
  try {
    localStorage.setItem(key(symbol), JSON.stringify(ticks.slice(-MAX_STORED_TICKS)));
  } catch {
    /* storage full — keep in memory only */
  }
}

/** Merge two tick lists by epoch, keeping order and the newest MAX_STORED_TICKS. */
export function mergeTicks(a: StoredTick[], b: StoredTick[]): StoredTick[] {
  const map = new Map<number, StoredTick>();
  for (const t of a) map.set(t.e, t);
  for (const t of b) map.set(t.e, t);
  return [...map.values()].sort((x, y) => x.e - y.e).slice(-MAX_STORED_TICKS);
}

export const lastDigitOf = (p: string) => parseInt(p[p.length - 1]!, 10);

/** Percentage of each digit 0–9 in the last `count` ticks. */
export function digitStats(ticks: StoredTick[], count: number) {
  const win = ticks.slice(-Math.max(1, count));
  const counts = Array(10).fill(0) as number[];
  for (const t of win) counts[lastDigitOf(t.p)]!++;
  const total = win.length || 1;
  const pct = counts.map((c) => (c / total) * 100);
  return { counts, pct, total: win.length };
}

export function pctWhere(ticks: StoredTick[], count: number, pred: (d: number) => boolean) {
  const win = ticks.slice(-Math.max(1, count));
  if (!win.length) return 0;
  return (win.filter((t) => pred(lastDigitOf(t.p))).length / win.length) * 100;
}

/** Rise/fall percentages over consecutive ticks in the window. */
export function riseFallStats(ticks: StoredTick[], count: number) {
  const win = ticks.slice(-Math.max(2, count + 1));
  let rise = 0;
  let fall = 0;
  for (let i = 1; i < win.length; i++) {
    const d = Number(win[i]!.p) - Number(win[i - 1]!.p);
    if (d > 0) rise++;
    else if (d < 0) fall++;
  }
  const n = Math.max(1, win.length - 1);
  return { rise: (rise / n) * 100, fall: (fall / n) * 100 };
}
