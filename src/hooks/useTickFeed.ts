import { useEffect, useRef, useState } from "react";
import { DerivWS } from "@/lib/deriv";
import { loadTicks, mergeTicks, saveTicks, type StoredTick } from "@/lib/tickStore";

/**
 * Public live tick feed for a market (no login needed). Ticks are saved on the
 * device and topped up from Deriv history so analysis never starts from zero.
 */
export function useTickFeed(symbol: string) {
  const [ticks, setTicks] = useState<StoredTick[]>([]);
  const [pip, setPip] = useState(2);
  const ticksRef = useRef<StoredTick[]>([]);
  const pushRef = useRef<(tick: any) => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    let ws: DerivWS | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    ticksRef.current = loadTicks(symbol);
    const addTick = (tick: any) => {
      if (!alive || (tick?.symbol ?? tick?.underlying_symbol) !== symbol) return;
      const ps = Number(tick.pip_size ?? 2);
      setPip(ps);
      const t = { e: Number(tick.epoch), p: Number(tick.quote).toFixed(ps) };
      if (!isFinite(t.e) || t.p === "NaN") return;
      const list = ticksRef.current;
      if (list.length && list[list.length - 1]!.e >= t.e) return;
      ticksRef.current = [...list, t].slice(-5000);
      setTicks(ticksRef.current);
      persist();
    };
    pushRef.current = addTick;
    setTicks(ticksRef.current);

    const persist = () => {
      if (saveTimer) return;
      saveTimer = setTimeout(() => {
        saveTimer = null;
        saveTicks(symbol, ticksRef.current);
      }, 2000);
    };

    const connect = async () => {
      ws = new DerivWS();
      try {
        await ws.connect();
      } catch {
        if (alive) retry = setTimeout(connect, 5000);
        return;
      }
      if (!alive) return ws.close();
      ws.onClose = () => {
        if (alive) retry = setTimeout(connect, 3000);
      };
      ws.onMessage((msg) => {
        if (msg?.msg_type === "tick") addTick(msg.tick);
      });
      try {
        const hist: any = await ws.send({
          ticks_history: symbol,
          end: "latest",
          count: 5000,
          style: "ticks",
        });
        const ps = Number(hist?.pip_size ?? 2);
        const prices: number[] = hist?.history?.prices ?? [];
        const times: number[] = hist?.history?.times ?? [];
        const past = prices.map((p, i) => ({ e: Number(times[i]), p: Number(p).toFixed(ps) }));
        setPip(ps);
        ticksRef.current = mergeTicks(past, ticksRef.current);
        setTicks(ticksRef.current);
        persist();
      } catch {
        /* history optional */
      }
      await ws.send({ ticks: symbol, subscribe: 1 }).catch(() => undefined);
    };
    void connect();

    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      if (saveTimer) clearTimeout(saveTimer);
      saveTicks(symbol, ticksRef.current);
      if (ws) {
        ws.onClose = null;
        ws.close();
      }
    };
  }, [symbol]);

  const last = ticks[ticks.length - 1];
  /** Feed a raw Deriv tick (e.g. from the logged-in account socket). */
  const pushTick = (tick: any) => pushRef.current(tick);
  return { pushTick, ticks, pip, price: last?.p ?? "—", lastDigit: last ? Number(last.p.slice(-1)) : null };
}
