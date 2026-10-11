import { useEffect, useMemo, useRef, useState } from "react";
import { DerivWS } from "@/lib/deriv";

export interface PayoutRequest {
  key: string;
  type: string; // Deriv contract_type e.g. DIGITOVER, CALL
  barrier: number | null;
  stake: number;
  duration: number;
}

export interface PayoutQuote {
  payout: number | null;
  error?: string;
}

/**
 * Live payout quotes straight from Deriv's official pricing (proposal API).
 * Prices depend on market, contract type, barrier, stake and tick duration, so
 * every prediction is quoted with its own settings and refreshed every few seconds.
 */
export function usePayouts(symbol: string, currency: string, requests: PayoutRequest[]) {
  const [quotes, setQuotes] = useState<Record<string, PayoutQuote>>({});
  const wsRef = useRef<DerivWS | null>(null);
  const sig = useMemo(
    () => JSON.stringify([symbol, currency, requests.map((r) => [r.key, r.type, r.barrier, r.stake, r.duration])]),
    [symbol, currency, requests],
  );
  const reqRef = useRef(requests);
  reqRef.current = requests;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const quoteAll = async () => {
      try {
        if (!wsRef.current?.isOpen) {
          wsRef.current?.close();
          const ws = new DerivWS();
          await ws.connect();
          wsRef.current = ws;
        }
        const ws = wsRef.current!;
        const results = await Promise.all(
          reqRef.current.map(async (r): Promise<[string, PayoutQuote]> => {
            if (!(r.stake > 0)) return [r.key, { payout: null, error: "Set a stake" }];
            try {
              const res: any = await ws.send({
                proposal: 1,
                amount: Math.round(r.stake * 100) / 100,
                basis: "stake",
                contract_type: r.type,
                currency: currency || "USD",
                duration: Math.min(10, Math.max(1, r.duration || 1)),
                duration_unit: "t",
                symbol,
                ...(r.barrier !== null ? { barrier: String(r.barrier) } : {}),
              });
              return [r.key, { payout: Number(res?.proposal?.payout) || null }];
            } catch (e: any) {
              return [r.key, { payout: null, error: e?.message || "Not available" }];
            }
          }),
        );
        if (alive) setQuotes(Object.fromEntries(results));
      } catch {
        /* offline — retry later */
      }
      if (alive) timer = setTimeout(quoteAll, 5000);
    };
    void quoteAll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [sig, symbol, currency]);

  useEffect(() => () => wsRef.current?.close(), []);
  return quotes;
}
