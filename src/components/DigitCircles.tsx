import { cn } from "@/lib/utils";

/** Deriv-style digit circles with a moving triangle cursor over the current digit. */
export function DigitCircles({
  pct,
  current,
  tone,
}: {
  pct: number[];
  current: number | null;
  /** Optional colour per digit (e.g. even/odd): "win" | "loss" */
  tone?: (d: number) => "win" | "loss" | undefined;
}) {
  const max = Math.max(...pct);
  const min = Math.min(...pct);
  const hasData = pct.some((p) => p > 0);
  return (
    <div className="relative pt-4">
      {current !== null && (
        <div
          className="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[10px] border-x-transparent border-t-primary transition-[left] duration-300 ease-out"
          style={{ left: `${(current + 0.5) * 10}%` }}
          aria-hidden
        />
      )}
      <div className="grid grid-cols-10 gap-1">
        {pct.map((p, d) => {
          const isMax = hasData && p === max;
          const isMin = hasData && p === min && !isMax;
          const t = tone?.(d);
          return (
            <div key={d} className="flex flex-col items-center">
              <div
                className={cn(
                  "flex aspect-square w-full max-w-11 items-center justify-center rounded-full border-[3px] text-sm font-bold transition-colors",
                  current === d ? "bg-primary text-primary-foreground" : "bg-card",
                  isMax ? "border-win" : isMin ? "border-loss" : "border-border",
                  !isMax && !isMin && t === "win" && "border-win/40",
                  !isMax && !isMin && t === "loss" && "border-loss/40",
                )}
              >
                {d}
              </div>
              <span
                className={cn(
                  "mt-1 text-[10px] font-semibold tabular-nums",
                  isMax ? "text-win" : isMin ? "text-loss" : "text-muted-foreground",
                )}
              >
                {p.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
