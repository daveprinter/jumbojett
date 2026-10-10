import { cn } from "@/lib/utils";

const R = 26;
const C = 2 * Math.PI * R;

/** Deriv-style digit circles: ring arc per digit, green = most frequent, red = least, triangle under current digit. */
export function DigitCircles({
  pct,
  current,
}: {
  pct: number[];
  current: number | null;
  tone?: (d: number) => "win" | "loss" | undefined;
}) {
  const max = Math.max(...pct);
  const min = Math.min(...pct);
  const hasData = pct.some((p) => p > 0);
  return (
    <div className="grid grid-cols-5 gap-x-2 gap-y-3">
      {pct.map((p, d) => {
        const isMax = hasData && p === max;
        const isMin = hasData && p === min && !isMax;
        const active = current === d;
        const arc = hasData ? Math.min(1, p / (max || 1)) * 0.35 * C : 0;
        return (
          <div key={d} className="flex flex-col items-center">
            <div className="relative aspect-square w-full max-w-16">
              <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
                <circle cx="32" cy="32" r={R} fill="none" strokeWidth="5" className="stroke-muted" />
                {(isMax || isMin) && (
                  <circle
                    cx="32"
                    cy="32"
                    r={R}
                    fill="none"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${arc} ${C}`}
                    strokeDashoffset={-C * 0.32}
                    className={cn("transition-all duration-300", isMax ? "stroke-win" : "stroke-loss")}
                  />
                )}
              </svg>
              <div
                className={cn(
                  "absolute inset-[18%] flex flex-col items-center justify-center rounded-full transition-colors",
                  active ? "bg-foreground text-background" : "text-foreground",
                )}
              >
                <span className="text-sm font-bold leading-none">{d}</span>
                <span className={cn("mt-0.5 text-[9px] tabular-nums", active ? "opacity-90" : "text-muted-foreground")}>
                  {p.toFixed(1)}%
                </span>
              </div>
            </div>
            <div
              className={cn(
                "mt-1 h-0 w-0 border-x-[6px] border-b-[9px] border-x-transparent border-b-loss transition-opacity duration-200",
                active ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
          </div>
        );
      })}
    </div>
  );
}
