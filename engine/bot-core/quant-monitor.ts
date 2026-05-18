import { 
  type BotAsset, 
  type Clock, 
  RealClock,
  type QuantSnapshot,
  type QuantMonitor,
  type PredictiveSignalAggregator,
  type ResolutionSourceAdapter,
  type RoundWindow
} from "./data-sources.ts";
import { digitalCallProbability } from "../../utils/math.ts";

export type QuantMonitorOptions = {
  asset: BotAsset;
  aggregator: PredictiveSignalAggregator;
  resolution: ResolutionSourceAdapter;
  clock?: Clock;
  rvWindow?: number;
};

/**
 * DefaultQuantMonitor implementation.
 * Integrates price aggregate and resolution threshold to produce 
 * real-time fair-value probabilities.
 */
export class DefaultQuantMonitor implements QuantMonitor {
  private asset: BotAsset;
  private aggregator: PredictiveSignalAggregator;
  private resolution: ResolutionSourceAdapter;
  private clock: Clock;
  private rvWindow: number;

  private prices: number[] = [];
  private handlers = new Set<(snapshot: QuantSnapshot) => void>();
  private _latest: QuantSnapshot;

  constructor(opts: QuantMonitorOptions) {
    this.asset = opts.asset;
    this.aggregator = opts.aggregator;
    this.resolution = opts.resolution;
    this.clock = opts.clock ?? new RealClock();
    this.rvWindow = opts.rvWindow ?? 20;

    this._latest = {
      asset: this.asset,
      timestampMs: this.clock.nowMs(),
      sigma: null,
      probabilityUp: null
    };

    // Subscriptions
    this.aggregator.subscribe(() => this.update());
  }

  latest(): QuantSnapshot {
    return this._latest;
  }

  subscribe(handler: (snapshot: QuantSnapshot) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private update() {
    const agg = this.aggregator.latest();
    const price = agg.price;
    if (price === null) return;

    this.prices.push(price);
    if (this.prices.length > this.rvWindow + 1) {
      this.prices.shift();
    }

    const sigma = this._calculateSigma();
    const probabilityUp = this._calculateProbability(price, sigma);

    this._latest = {
      asset: this.asset,
      timestampMs: this.clock.nowMs(),
      sigma,
      probabilityUp
    };

    for (const handler of this.handlers) {
      handler(this._latest);
    }
  }

  private _calculateSigma(): number | null {
    if (this.prices.length < 5) return null;

    let sumSqReturns = 0;
    for (let i = 1; i < this.prices.length; i++) {
      const logReturn = Math.log(this.prices[i]! / this.prices[i - 1]!);
      sumSqReturns += Math.pow(logReturn, 2);
    }

    const meanSq = sumSqReturns / (this.prices.length - 1);
    const TICKS_PER_YEAR = 31536000; // 365 * 24 * 3600 (assumes 1s avg tick)
    return Math.sqrt(meanSq * TICKS_PER_YEAR);
  }

  private _calculateProbability(S: number, sigma: number | null): number | null {
    if (sigma === null) return null;

    const res = this.resolution.latest();
    if (!res || !res.round || !res.priceToBeat) return null;

    const K = res.priceToBeat;
    const now = this.clock.nowMs();
    const T_ms = res.round.endTimeMs - now;
    
    if (T_ms <= 0) return S >= K ? 1 : 0;

    // Convert T to years
    const T_years = T_ms / (1000 * 3600 * 24 * 365);

    return digitalCallProbability(S, K, T_years, sigma);
  }
}
