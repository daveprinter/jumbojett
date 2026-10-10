import { useMemo } from "react";
import { Hand } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DigitCircles } from "@/components/DigitCircles";
import { DigitGrid } from "@/components/DigitGrid";
import { usePersistentState } from "@/hooks/usePluto";
import { cn } from "@/lib/utils";
import {
  DIGIT_KINDS,
  type ContractType,
  type PrimaryConfig,
  type PrimaryKind,
} from "@/lib/botEngine";
import { digitStats, lastDigitOf, pctWhere, riseFallStats, type StoredTick } from "@/lib/tickStore";

type Category = "overunder" | "matchdiff" | "evenodd" | "risefall";

const CATEGORIES: { value: Category; label: string; kinds: [PrimaryKind, PrimaryKind] }[] = [
  { value: "overunder", label: "Over / Under", kinds: ["over", "under"] },
  { value: "matchdiff", label: "Matches / Differs", kinds: ["matches", "differs"] },
  { value: "evenodd", label: "Even / Odd", kinds: ["even", "odd"] },
  { value: "risefall", label: "Rise / Fall", kinds: ["rise", "fall"] },
];

const KIND_LABEL: Record<PrimaryKind, string> = {
  over: "Over",
  under: "Under",
  matches: "Matches",
  differs: "Differs",
  even: "Even",
  odd: "Odd",
  rise: "Rise",
  fall: "Fall",
};

const STRIP = 30;

function DigitSelect({
  label,
  value,
  onChange,
  min = 0,
  max = 9,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((d) => (
            <SelectItem key={d} value={String(d)}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PctBox({ label, value, tone }: { label: string; value: number; tone: "win" | "loss" }) {
  return (
    <div className="rounded-lg border border-border bg-accent/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", tone === "win" ? "text-win" : "text-loss")}>
        {value.toFixed(1)}%
      </p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", tone === "win" ? "bg-win" : "bg-loss")}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function TickStrip({ items }: { items: { ch: string; tone: "win" | "loss" | "muted" }[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        Last {items.length} ticks
      </p>
      <div className="flex flex-wrap gap-1">
        {items.map((it, i) => (
          <span
            key={i}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold",
              it.tone === "win" && "bg-win text-primary-foreground",
              it.tone === "loss" && "bg-loss text-primary-foreground",
              it.tone === "muted" && "bg-muted text-muted-foreground",
              i === items.length - 1 && "ring-2 ring-primary ring-offset-1 ring-offset-card",
            )}
          >
            {it.ch}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MultiContracts({
  ticks,
  lastDigit,
  primary,
  onPrimary,
  onManual,
  canTrade,
}: {
  ticks: StoredTick[];
  lastDigit: number | null;
  primary: PrimaryConfig;
  onPrimary: (p: PrimaryConfig) => void;
  onManual: (type: ContractType, barrier: number | null, label: string) => void;
  canTrade: boolean;
}) {
  const [cat, setCat] = usePersistentState<Category>("analysisCategory", "overunder");
  const [counts, setCounts] = usePersistentState<Record<Category, string>>("analysisCounts", {
    overunder: "1000",
    matchdiff: "1000",
    evenodd: "1000",
    risefall: "1000",
  });
  const [overDigit, setOverDigit] = usePersistentState("anOverDigit", 5);
  const [underDigit, setUnderDigit] = usePersistentState("anUnderDigit", 6);
  const [mdDigit, setMdDigit] = usePersistentState("anMdDigit", 5);

  const n = Math.max(1, parseInt(counts[cat] ?? "1000", 10) || 1000);
  const win = useMemo(() => ticks.slice(-n), [ticks, n]);
  const stats = useMemo(() => digitStats(win, n), [win, n]);
  const recent = win.slice(-STRIP);

  const category = CATEGORIES.find((c) => c.value === cat)!;
  const isDigitKind = DIGIT_KINDS.includes(primary.kind);
  const toggle = (list: number[], d: number) =>
    list.includes(d) ? list.filter((x) => x !== d) : [...list, d];

  const manualBtn = (kind: PrimaryKind, type: ContractType, barrier: number | null, tone: "win" | "loss") => {
    const label = `${KIND_LABEL[kind]}${barrier !== null ? ` ${barrier}` : ""}`;
    return (
      <Button
        key={label}
        variant={tone === "win" ? "win" : "loss"}
        disabled={!canTrade}
        onClick={() => onManual(type, barrier, label)}
      >
        <Hand className="mr-1.5 h-4 w-4" /> {label}
      </Button>
    );
  };

  let analysis: React.ReactNode = null;
  if (cat === "overunder") {
    const over = pctWhere(win, n, (d) => d > overDigit);
    const under = pctWhere(win, n, (d) => d < underDigit);
    analysis = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <DigitSelect label="Over digit to analyze" value={overDigit} onChange={setOverDigit} max={8} />
          <DigitSelect label="Under digit to analyze" value={underDigit} onChange={setUnderDigit} min={1} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PctBox label={`Over ${overDigit}`} value={over} tone="loss" />
          <PctBox label={`Under ${underDigit}`} value={under} tone="win" />
        </div>
        <TickStrip
          items={recent.map((t) => {
            const d = lastDigitOf(t.p);
            return d > overDigit
              ? { ch: "O", tone: "loss" as const }
              : d < underDigit
                ? { ch: "U", tone: "win" as const }
                : { ch: String(d), tone: "muted" as const };
          })}
        />
        <div className="grid grid-cols-2 gap-2">
          {manualBtn("over", "DIGITOVER", overDigit, "loss")}
          {manualBtn("under", "DIGITUNDER", underDigit, "win")}
        </div>
      </>
    );
  } else if (cat === "matchdiff") {
    const m = pctWhere(win, n, (d) => d === mdDigit);
    analysis = (
      <>
        <div className="max-w-48">
          <DigitSelect label="Digit to analyze" value={mdDigit} onChange={setMdDigit} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PctBox label={`Matches ${mdDigit}`} value={m} tone="win" />
          <PctBox label={`Differs ${mdDigit}`} value={win.length ? 100 - m : 0} tone="loss" />
        </div>
        <TickStrip
          items={recent.map((t) =>
            lastDigitOf(t.p) === mdDigit
              ? { ch: "M", tone: "win" as const }
              : { ch: "D", tone: "loss" as const },
          )}
        />
        <div className="grid grid-cols-2 gap-2">
          {manualBtn("matches", "DIGITMATCH", mdDigit, "win")}
          {manualBtn("differs", "DIGITDIFF", mdDigit, "loss")}
        </div>
      </>
    );
  } else if (cat === "evenodd") {
    const even = pctWhere(win, n, (d) => d % 2 === 0);
    analysis = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <PctBox label="Even" value={even} tone="win" />
          <PctBox label="Odd" value={win.length ? 100 - even : 0} tone="loss" />
        </div>
        <DigitCircles
          pct={stats.pct}
          current={lastDigit}
          tone={(d) => (d % 2 === 0 ? "win" : "loss")}
        />
        <TickStrip
          items={recent.map((t) =>
            lastDigitOf(t.p) % 2 === 0
              ? { ch: "E", tone: "win" as const }
              : { ch: "O", tone: "loss" as const },
          )}
        />
        <div className="grid grid-cols-2 gap-2">
          {manualBtn("even", "DIGITEVEN", null, "win")}
          {manualBtn("odd", "DIGITODD", null, "loss")}
        </div>
      </>
    );
  } else {
    const rf = riseFallStats(ticks, n);
    const items = ticks.slice(-(STRIP + 1)).flatMap((t, i, arr) => {
      if (i === 0) return [];
      const d = Number(t.p) - Number(arr[i - 1]!.p);
      return [
        d > 0
          ? { ch: "R", tone: "win" as const }
          : d < 0
            ? { ch: "F", tone: "loss" as const }
            : { ch: "=", tone: "muted" as const },
      ];
    });
    analysis = (
      <>
        <div className="grid grid-cols-2 gap-3">
          <PctBox label="Rise" value={rf.rise} tone="win" />
          <PctBox label="Fall" value={rf.fall} tone="loss" />
        </div>
        <TickStrip items={items} />
        <div className="grid grid-cols-2 gap-2">
          {manualBtn("rise", "CALL", null, "win")}
          {manualBtn("fall", "PUT", null, "loss")}
        </div>
      </>
    );
  }

  const selectedDigits = primary.batch ? primary.digits : [primary.digit];

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">Multiple contracts</h2>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCat(c.value)}
            className={cn(
              "rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
              cat === c.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary/50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Analysis */}
      <div className="space-y-3 rounded-lg border border-primary/30 bg-accent/30 p-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-xs font-semibold">{category.label} analysis</p>
          <div className="w-32">
            <Label className="mb-1 block text-[11px]">Ticks to analyze</Label>
            <Input
              inputMode="numeric"
              value={counts[cat] ?? "1000"}
              onChange={(e) =>
                setCounts((prev) => ({ ...prev, [cat]: e.target.value.replace(/[^0-9]/g, "") }))
              }
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Based on {win.length} of {n} ticks{win.length < n ? " (still collecting)" : ""}.
          Manual buttons trade {canTrade ? "at your stake and tick duration." : "once your Deriv account is connected."}
        </p>
        {analysis}
      </div>

      {/* Auto-trade setup */}
      <div className="mt-4 space-y-3">
        <Label className="block text-xs">Auto-trade contract (used by Start trading)</Label>
        <div className="grid grid-cols-2 gap-2">
          {category.kinds.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onPrimary({ ...primary, kind: k })}
              className={cn(
                "rounded-xl border p-3 text-left text-sm font-semibold transition-colors",
                primary.kind === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        {!category.kinds.includes(primary.kind) && (
          <p className="text-xs text-muted-foreground">
            Currently auto-trading <strong className="text-foreground">{KIND_LABEL[primary.kind]}</strong>.
            Tap one above to change it.
          </p>
        )}

        {isDigitKind && category.kinds.includes(primary.kind) && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Batch mode</p>
                <p className="text-xs text-muted-foreground">
                  {primary.batch ? "Trade all selected digits at once" : "One digit per trade"}
                </p>
              </div>
              <Switch
                checked={primary.batch}
                onCheckedChange={(v) =>
                  onPrimary({ ...primary, batch: v, digits: v && !primary.digits.length ? [primary.digit] : primary.digits })
                }
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">
                {KIND_LABEL[primary.kind]} digit{primary.batch ? "s" : ""}
              </Label>
              <DigitGrid
                selected={selectedDigits}
                onToggle={(d) =>
                  primary.batch
                    ? onPrimary({ ...primary, digits: toggle(primary.digits, d) })
                    : onPrimary({ ...primary, digit: d })
                }
              />
            </div>

            {primary.batch && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-xs">Stake mode</Label>
                    <Select
                      value={primary.stakeMode}
                      onValueChange={(v) => onPrimary({ ...primary, stakeMode: v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Same stake for all (app stake)</SelectItem>
                        <SelectItem value="each">Own stake per prediction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs">Tick duration mode</Label>
                    <Select
                      value={primary.durationMode}
                      onValueChange={(v) => onPrimary({ ...primary, durationMode: v as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Same duration for all (app duration)</SelectItem>
                        <SelectItem value="each">Own duration per prediction</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(primary.stakeMode === "each" || primary.durationMode === "each") &&
                  primary.digits.length > 0 && (
                    <div className="space-y-2">
                      {primary.digits.map((d) => (
                        <div key={d} className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
                          <span className="mb-2 flex h-7 w-16 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                            {KIND_LABEL[primary.kind]} {d}
                          </span>
                          {primary.stakeMode === "each" ? (
                            <div>
                              <Label className="mb-1 block text-[11px]">Stake</Label>
                              <Input
                                inputMode="decimal"
                                value={primary.stakes[String(d)] ?? ""}
                                placeholder="App stake"
                                onChange={(e) =>
                                  onPrimary({
                                    ...primary,
                                    stakes: { ...primary.stakes, [String(d)]: parseFloat(e.target.value) || 0 },
                                  })
                                }
                              />
                            </div>
                          ) : (
                            <span />
                          )}
                          {primary.durationMode === "each" ? (
                            <div>
                              <Label className="mb-1 block text-[11px]">Ticks (1–10)</Label>
                              <Input
                                inputMode="numeric"
                                value={primary.durations[String(d)] ?? ""}
                                placeholder="App ticks"
                                onChange={(e) =>
                                  onPrimary({
                                    ...primary,
                                    durations: {
                                      ...primary.durations,
                                      [String(d)]: parseInt(e.target.value, 10) || 0,
                                    },
                                  })
                                }
                              />
                            </div>
                          ) : (
                            <span />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
