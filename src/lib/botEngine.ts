import { fetchAppMarkupPct, type DerivWS } from "./deriv";

export type ContractType =
  | "DIGITDIFF"
  | "DIGITMATCH"
  | "DIGITOVER"
  | "DIGITUNDER"
  | "DIGITEVEN"
  | "DIGITODD"
  | "CALL"
  | "PUT";
export type PrimaryKind = "differs" | "matches" | "over" | "under" | "even" | "odd" | "rise" | "fall";
export type RecoveryKind = "over" | "under" | "even" | "odd";
export type Transition = "onloss" | "random" | "sequential";
export type SpeedMode = "normal" | "everytick";

export const KIND_TYPE: Record<PrimaryKind, ContractType> = {
  differs: "DIGITDIFF",
  matches: "DIGITMATCH",
  over: "DIGITOVER",
  under: "DIGITUNDER",
  even: "DIGITEVEN",
  odd: "DIGITODD",
  rise: "CALL",
  fall: "PUT",
};
export const DIGIT_KINDS: PrimaryKind[] = ["differs", "matches", "over", "under"];

export interface DigitSelection {
  mode: "single" | "multi";
  digit: number;
  digits: number[];
  transition: Transition;
}

/** Main auto-trade contract. Batch mode buys one contract per selected digit at once. */
export interface PrimaryConfig {
  kind: PrimaryKind;
  batch: boolean;
  digit: number;
  digits: number[];
  stakeMode: "global" | "each";
  stakes: Record<string, number>;
  durationMode: "global" | "each";
  durations: Record<string, number>;
}

export interface RecoveryConfig {
  enabled: boolean;
  kinds: RecoveryKind[];
  kindTransition: Transition;
  over: DigitSelection;
  under: DigitSelection;
}

export type SwitchMode = "runs" | "losses" | "consecutive";

export interface SwitcherConfig {
  enabled: boolean;
  markets: string[];
  mode: SwitchMode;
  count: number;
}

export interface EngineConfig {
  symbol: string;
  stake: number;
  martingale: number;
  stopLoss: number;
  takeProfit: number;
  speed: SpeedMode;
  /** Default tick duration for every contract. */
  duration: number;
  primary: PrimaryConfig;
  recovery: RecoveryConfig;
  currency: string;
  switcher: SwitcherConfig;
}

export interface TradeLog {
  id: string;
  time: string;
  label: string;
  contractType: ContractType;
  prediction: number | null;
  entrySpot: string;
  exitSpot: string;
  resultDigit: number;
  stake: number;
  profit: number;
  win: boolean;
}

export interface EngineStats {
  runs: number;
  wins: number;
  losses: number;
  totalStake: number;
  totalPayout: number;
  profit: number;
}

export const emptyStats = (): EngineStats => ({
  runs: 0,
  wins: 0,
  losses: 0,
  totalStake: 0,
  totalPayout: 0,
  profit: 0,
});

export interface EngineCallbacks {
  onTick: (price: string, digit: number) => void;
  onLog: (log: TradeLog) => void;
  onStats: (stats: EngineStats) => void;
  onStake: (stake: number) => void;
  onStatus: (status: string) => void;
  onStop: (reason: string) => void;
  onBalance?: (balance: number) => void;
  onMarketSwitch?: (symbol: string) => void;
  onMarkup?: (pct: number | null) => void;
  onManualError?: (message: string) => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampTicks = (n: number) => Math.min(10, Math.max(1, Math.round(n || 1)));

export const CONTRACT_LABEL: Record<ContractType, string> = {
  DIGITDIFF: "Digit Differs",
  DIGITMATCH: "Digit Matches",
  DIGITOVER: "Digit Over",
  DIGITUNDER: "Digit Under",
  DIGITEVEN: "Digit Even",
  DIGITODD: "Digit Odd",
  CALL: "Rise",
  PUT: "Fall",
};

export function isWinFor(
  type: ContractType,
  digit: number,
  barrier: number | null,
  exitQuote = 0,
  entryQuote = 0,
) {
  switch (type) {
    case "DIGITDIFF":
      return digit !== barrier;
    case "DIGITMATCH":
      return digit === barrier;
    case "DIGITOVER":
      return digit > (barrier ?? 0);
    case "DIGITUNDER":
      return digit < (barrier ?? 0);
    case "DIGITEVEN":
      return digit % 2 === 0;
    case "DIGITODD":
      return digit % 2 === 1;
    case "CALL":
      return exitQuote > entryQuote;
    case "PUT":
      return exitQuote < entryQuote;
  }
}

/** Contracts one auto run buys for the primary config (one per digit in batch mode). */
export function planPrimary(
  p: PrimaryConfig,
  baseStake: number,
  currentStake: number,
  duration: number,
): PlannedContract[] {
  const type = KIND_TYPE[p.kind];
  const factor = baseStake > 0 ? currentStake / baseStake : 1;
  if (!DIGIT_KINDS.includes(p.kind)) {
    return [{ type, barrier: null, stake: round2(currentStake), duration: clampTicks(duration) }];
  }
  const digits = p.batch && p.digits.length ? p.digits : [p.digit];
  return digits.map((d) => {
    const own = p.batch && p.stakeMode === "each" ? p.stakes[String(d)] : undefined;
    const ownDur = p.batch && p.durationMode === "each" ? p.durations[String(d)] : undefined;
    return {
      type,
      barrier: d,
      stake: round2((own && own > 0 ? own : baseStake) * factor),
      duration: clampTicks(ownDur && ownDur > 0 ? ownDur : duration),
    };
  });
}

export interface PlannedContract {
  type: ContractType;
  barrier: number | null;
  stake: number;
  duration: number;
}

interface Pending {
  buyPrice: number;
  payout: number;
  type: ContractType;
  barrier: number | null;
  entrySpot: string;
  entryQuote: number | null;
  ticksLeft: number;
  manual: boolean;
}

export class BotEngine {
  private ws: DerivWS;
  private cb: EngineCallbacks;
  cfg: EngineConfig;

  private running = false;
  private buying = false;
  private unsubscribe: (() => void) | null = null;
  private pendings: Pending[] = [];
  private group: { remaining: number; profit: number } | null = null;
  private manualQueue: { type: ContractType; barrier: number | null }[] = [];

  private currentStake = 0;
  private stats = emptyStats();
  private skipTick = false;

  private recoveryKindIdx = 0;
  private recoveryDigitIdx = 0;
  private inRecovery = false;

  private paused = false;
  private switching = false;
  private marketRuns = 0;
  private marketLosses = 0;
  private marketStreak = 0;

  constructor(ws: DerivWS, cfg: EngineConfig, cb: EngineCallbacks) {
    this.ws = ws;
    this.cfg = cfg;
    this.cb = cb;
    this.currentStake = round2(cfg.stake);
  }

  updateConfig(cfg: EngineConfig) {
    this.cfg = { ...cfg, symbol: this.cfg.symbol };
  }

  markupPct: number | null = null;

  async refreshMarkup(): Promise<number | null> {
    const pct = await fetchAppMarkupPct(this.ws, this.cfg.symbol, this.cfg.currency || "USD");
    this.markupPct = pct;
    this.cb.onMarkup?.(pct);
    return pct;
  }

  getStats() {
    return this.stats;
  }

  hydrateStats(stats: EngineStats) {
    this.stats = { ...stats };
  }

  resetStats() {
    this.stats = emptyStats();
    this.cb.onStats(this.stats);
  }

  async subscribeTicks(symbol: string) {
    this.cfg = { ...this.cfg, symbol };
    this.unsubscribe?.();
    this.unsubscribe = this.ws.onMessage((msg) => {
      if (msg?.msg_type === "tick" && msg.tick?.symbol === this.cfg.symbol) {
        this.handleTick(msg.tick);
      }
      if (msg?.msg_type === "balance" && msg.balance) {
        this.cb.onBalance?.(Number(msg.balance.balance));
      }
    });
    await this.ws.send({ forget_all: "ticks" }).catch(() => undefined);
    await this.ws.send({ ticks: symbol, subscribe: 1 });
  }

  start() {
    this.currentStake = round2(this.cfg.stake);
    this.cb.onStake(this.currentStake);
    this.inRecovery = false;
    this.recoveryKindIdx = 0;
    this.recoveryDigitIdx = 0;
    this.group = null;
    this.resetMarketCounters();
    this.paused = false;
    this.running = true;
    this.cb.onStatus("Running");
  }

  stop(reason = "Stopped") {
    this.running = false;
    this.paused = false;
    this.buying = false;
    this.group = null;
    this.pendings = this.pendings.filter((p) => p.manual);
    this.cb.onStatus(reason);
  }

  pause() {
    if (!this.running) return;
    this.paused = true;
    this.cb.onStatus("Paused");
  }

  resume() {
    if (!this.running) return;
    this.paused = false;
    this.cb.onStatus(this.inRecovery ? "Recovery mode" : "Running");
  }

  get isPaused() {
    return this.paused;
  }

  get isRunning() {
    return this.running;
  }

  /** Buy one contract right now (every-tick speed) or on the next tick (normal speed). */
  manualTrade(type: ContractType, barrier: number | null) {
    if (this.cfg.speed === "everytick") void this.buyManual(type, barrier);
    else this.manualQueue.push({ type, barrier });
  }

  private resetMarketCounters() {
    this.marketRuns = 0;
    this.marketLosses = 0;
    this.marketStreak = 0;
  }

  private lastPrice = "";

  private handleTick(tick: any) {
    const pipSize = tick.pip_size ?? 2;
    const quote = Number(tick.quote);
    const priceStr = quote.toFixed(pipSize);
    this.lastPrice = priceStr;
    const digit = parseInt(priceStr[priceStr.length - 1]!, 10);
    this.cb.onTick(priceStr, digit);

    const everyTick = this.cfg.speed === "everytick";

    // Settle contracts whose tick duration has elapsed.
    const still: Pending[] = [];
    for (const p of this.pendings) {
      if (p.entryQuote === null) {
        p.entryQuote = quote; // rise/fall entry is the first tick after purchase
        still.push(p);
        continue;
      }
      p.ticksLeft--;
      if (p.ticksLeft > 0) {
        still.push(p);
        continue;
      }
      const win = isWinFor(p.type, digit, p.barrier, quote, p.entryQuote);
      const profit = win ? round2(p.payout - p.buyPrice) : -p.buyPrice;
      this.record(win, profit, digit, p, priceStr);
      if (!p.manual && this.group) {
        this.group.remaining--;
        this.group.profit = round2(this.group.profit + profit);
      }
    }
    this.pendings = still;

    if (this.group && this.group.remaining <= 0) {
      const groupWin = this.group.profit > 0;
      this.group = null;
      if (this.running) this.finishRun(groupWin);
      if (!this.running) return this.flushManual();
      if (!everyTick) this.skipTick = true;
    }

    this.flushManual();

    if (!this.running || this.paused || this.switching) return;
    if (this.buying || this.group) return;
    if (!everyTick && this.skipTick) {
      this.skipTick = false;
      return;
    }
    this.skipTick = false;
    void this.placeRun();
  }

  private flushManual() {
    const q = this.manualQueue;
    this.manualQueue = [];
    for (const m of q) void this.buyManual(m.type, m.barrier);
  }

  private nextContracts(): PlannedContract[] {
    const rec = this.cfg.recovery;
    if (this.inRecovery && rec.enabled && rec.kinds.length) {
      if (rec.kindTransition === "random")
        this.recoveryKindIdx = Math.floor(Math.random() * rec.kinds.length);
      const kind = rec.kinds[this.recoveryKindIdx % rec.kinds.length]!;
      const duration = clampTicks(this.cfg.duration);
      const stake = round2(this.currentStake);
      if (kind === "even") return [{ type: "DIGITEVEN", barrier: null, stake, duration }];
      if (kind === "odd") return [{ type: "DIGITODD", barrier: null, stake, duration }];
      const sel = kind === "over" ? rec.over : rec.under;
      return [
        {
          type: kind === "over" ? "DIGITOVER" : "DIGITUNDER",
          barrier: this.pickDigit(sel),
          stake,
          duration,
        },
      ];
    }
    return planPrimary(this.cfg.primary, round2(this.cfg.stake), this.currentStake, this.cfg.duration);
  }

  private pickDigit(sel: DigitSelection): number {
    if (sel.mode === "single" || sel.digits.length === 0) return sel.digit;
    const list = sel.digits;
    if (sel.transition === "random") return list[Math.floor(Math.random() * list.length)]!;
    return list[this.recoveryDigitIdx % list.length]!;
  }

  private advanceCursors(win: boolean) {
    const rec = this.cfg.recovery;
    if (!rec.enabled) return;
    const kind = rec.kinds[this.recoveryKindIdx % Math.max(rec.kinds.length, 1)];
    const sel = kind === "over" ? rec.over : kind === "under" ? rec.under : null;
    if (sel && sel.mode === "multi" && sel.digits.length > 1) {
      if (sel.transition === "sequential") this.recoveryDigitIdx++;
      else if (sel.transition === "onloss" && !win) this.recoveryDigitIdx++;
    }
    if (rec.kinds.length > 1) {
      if (rec.kindTransition === "sequential") this.recoveryKindIdx++;
      else if (rec.kindTransition === "onloss" && !win) this.recoveryKindIdx++;
    }
  }

  private record(win: boolean, profit: number, digit: number, p: Pending, exitSpot: string) {
    this.stats = {
      runs: this.stats.runs + 1,
      wins: this.stats.wins + (win ? 1 : 0),
      losses: this.stats.losses + (win ? 0 : 1),
      totalStake: round2(this.stats.totalStake + p.buyPrice),
      totalPayout: round2(this.stats.totalPayout + (win ? p.buyPrice + profit : 0)),
      profit: round2(this.stats.profit + profit),
    };
    this.cb.onStats(this.stats);
    this.cb.onLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time: new Date().toLocaleTimeString(),
      label: `${p.manual ? "Manual · " : ""}${CONTRACT_LABEL[p.type]}`,
      contractType: p.type,
      prediction: p.barrier,
      entrySpot: p.entrySpot,
      exitSpot,
      resultDigit: digit,
      stake: p.buyPrice,
      profit,
      win,
    });
  }

  /** After every auto run (single contract or whole batch) settles. */
  private finishRun(win: boolean) {
    const wasRecovery = this.inRecovery;
    const base = round2(this.cfg.stake);
    const multiplier = this.cfg.martingale;
    if (win) this.currentStake = base;
    else if (!isNaN(multiplier) && multiplier > 1)
      this.currentStake = round2(this.currentStake * multiplier);
    this.cb.onStake(this.currentStake);

    if (this.cfg.recovery.enabled && this.cfg.recovery.kinds.length) {
      if (!wasRecovery && !win) {
        this.inRecovery = true;
        this.recoveryKindIdx = 0;
        this.recoveryDigitIdx = 0;
        this.cb.onStatus("Recovery mode");
      } else if (wasRecovery && win) {
        this.inRecovery = false;
        this.cb.onStatus("Running");
      }
    }
    this.advanceCursors(win);

    if (this.cfg.takeProfit > 0 && this.stats.profit >= this.cfg.takeProfit) {
      this.stop("Take profit reached");
      this.cb.onStop("Take profit reached");
      return;
    }
    if (this.cfg.stopLoss > 0 && this.stats.profit <= -this.cfg.stopLoss) {
      this.stop("Stop loss reached");
      this.cb.onStop("Stop loss reached");
      return;
    }
    this.evaluateSwitch(win);
  }

  private evaluateSwitch(win: boolean) {
    const sw = this.cfg.switcher;
    this.marketRuns++;
    if (win) this.marketStreak = 0;
    else {
      this.marketLosses++;
      this.marketStreak++;
    }
    if (!sw?.enabled || sw.markets.length < 2 || !this.running) return;
    const count = Math.max(1, Math.floor(sw.count || 0));
    const hit =
      sw.mode === "runs"
        ? this.marketRuns >= count
        : sw.mode === "losses"
          ? this.marketLosses >= count
          : this.marketStreak >= count;
    if (!hit) return;

    const idx = sw.markets.indexOf(this.cfg.symbol);
    const next = sw.markets[(idx + 1) % sw.markets.length]!;
    this.resetMarketCounters();
    if (next === this.cfg.symbol) return;
    this.switching = true;
    this.cfg = { ...this.cfg, symbol: next };
    this.cb.onStatus(`Switching market…`);
    void this.subscribeTicks(next)
      .then(() => {
        this.cb.onMarketSwitch?.(next);
        this.cb.onStatus(this.inRecovery ? "Recovery mode" : "Running");
      })
      .catch((e: any) => {
        this.stop(e?.message || "Market switch failed");
        this.cb.onStop(e?.message || "Market switch failed");
      })
      .finally(() => {
        this.switching = false;
      });
  }

  private async buyOne(c: PlannedContract, manual: boolean): Promise<void> {
    const contractParams: Record<string, any> = {
      amount: c.stake,
      basis: "stake",
      contract_type: c.type,
      currency: this.cfg.currency || "USD",
      duration: c.duration,
      duration_unit: "t",
    };
    if (c.barrier !== null) contractParams["barrier"] = String(c.barrier);
    const entrySpot = this.lastPrice;
    const buyRes: any =
      this.ws.mode === "pat"
        ? await this.buyViaProposal(contractParams, c.stake)
        : await this.ws.send({
            buy: 1,
            price: c.stake,
            parameters: { ...contractParams, symbol: this.cfg.symbol },
          });
    const buy = buyRes?.buy;
    if (!buy) throw new Error("Deriv did not confirm the purchase");
    const riseFall = c.type === "CALL" || c.type === "PUT";
    this.pendings.push({
      buyPrice: Number(buy.buy_price ?? c.stake),
      payout: Number(buy.payout ?? 0),
      type: c.type,
      barrier: c.barrier,
      entrySpot,
      entryQuote: riseFall ? null : 0,
      ticksLeft: c.duration,
      manual,
    });
  }

  private async buyManual(type: ContractType, barrier: number | null) {
    try {
      await this.buyOne(
        { type, barrier, stake: round2(this.cfg.stake), duration: clampTicks(this.cfg.duration) },
        true,
      );
    } catch (e: any) {
      this.cb.onManualError?.(e?.message || "Manual trade failed");
    }
  }

  private async placeRun() {
    if (this.buying || !this.running || this.paused || this.switching) return;
    this.buying = true;
    const contracts = this.nextContracts();
    this.group = { remaining: contracts.length, profit: 0 };
    const results = await Promise.allSettled(contracts.map((c) => this.buyOne(c, false)));
    this.buying = false;
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    if (this.group) this.group.remaining -= failed.length;
    if (failed.length) {
      const msg = failed[0]!.reason?.message || "Trade failed";
      if (failed.length === contracts.length) this.group = null;
      this.stop(msg);
      this.cb.onStop(msg);
    }
  }

  private async buyViaProposal(contractParams: Record<string, any>, stake: number): Promise<any> {
    const proposalRes: any = await this.ws.send({
      proposal: 1,
      ...contractParams,
      underlying_symbol: this.cfg.symbol,
    });
    const proposalId = proposalRes?.proposal?.id;
    if (!proposalId) throw new Error("Deriv did not return a proposal ID");
    return this.ws.send({ buy: proposalId, price: stake });
  }

  destroy() {
    this.running = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
