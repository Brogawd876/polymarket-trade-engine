import {
  type BotAsset,
  type PredictiveFeedAdapter,
  type PredictivePriceEvent,
  type PredictiveAggregateSnapshot,
  type PredictiveSignalAggregator,
  type Clock,
  RealClock,
} from "./data-sources";

export type AggregatorOptions = {
  asset: BotAsset;
  feeds: Record<string, PredictiveFeedAdapter>;
  /** Weights per feed. Default: uniform weights. Example: { binance: 0.7, coinbase: 0.3 } */
  feedWeights?: Record<string, number>;
  /** Max divergence between feeds before marking disagreement. Default: 50 ($50 for BTC). */
  divergenceThresholdAbs?: number;
  clock?: Clock;
};

export class DefaultPredictiveAggregator implements PredictiveSignalAggregator {
  private asset: BotAsset;
  private feeds: Record<string, PredictiveFeedAdapter>;
  private latestEvents = new Map<string, PredictivePriceEvent>();
  private handlers = new Set<(snapshot: PredictiveAggregateSnapshot) => void>();
  private divergenceThresholdAbs: number;
  private feedWeights: Record<string, number>;
  private clock: Clock;

  constructor(opts: AggregatorOptions) {
    this.asset = opts.asset;
    this.feeds = opts.feeds;
    this.divergenceThresholdAbs = opts.divergenceThresholdAbs ?? 50;
    this.feedWeights = opts.feedWeights ?? {};
    this.clock = opts.clock ?? new RealClock();

    for (const [name, adapter] of Object.entries(this.feeds)) {
      adapter.subscribe((event) => {
        this.latestEvents.set(name, event);
        this.notify();
      });
    }
  }

  latest(): PredictiveAggregateSnapshot {
    const snapshotFeeds: PredictiveAggregateSnapshot["feeds"] = {};
    const healthyFeedNames: string[] = [];
    const now = this.clock.nowMs();

    for (const [name, event] of this.latestEvents) {
      snapshotFeeds[name] = {
        price: event.price,
        quality: event.quality,
        latestEventAgeMs: now - event.clock.receivedAtMs,
        arrivalDelayMs: event.freshnessMs,
      };

      if (event.quality === "live") {
        healthyFeedNames.push(name);
      }
    }

    let price: number | null = null;
    let divergenceAbs: number | null = null;
    let divergencePct: number | null = null;
    let disagreement = false;

    if (healthyFeedNames.length > 0) {
      // Calculate Weighted Price
      let totalWeight = 0;
      let weightedSum = 0;
      const healthyPrices: number[] = [];

      for (const name of healthyFeedNames) {
        const weight = this.feedWeights[name] ?? 1.0;
        const p = this.latestEvents.get(name)!.price;
        weightedSum += p * weight;
        totalWeight += weight;
        healthyPrices.push(p);
      }
      
      price = weightedSum / totalWeight;

      if (healthyPrices.length > 1) {
        const max = Math.max(...healthyPrices);
        const min = Math.min(...healthyPrices);
        divergenceAbs = max - min;
        divergencePct = (divergenceAbs / price) * 100;

        // Institutional Disagreement: If high-weight feeds agree but low-weight lags, 
        // we might NOT mark disagreement. For now, we stick to the absolute threshold.
        if (divergenceAbs > this.divergenceThresholdAbs) {
          disagreement = true;
        }
      }
    } else {
      disagreement = true;
    }
    return {
      asset: this.asset,
      timestampMs: now,
      price,
      feeds: snapshotFeeds,
      divergenceAbs,
      divergencePct,
      disagreement,
    };
  }

  subscribe(handler: (snapshot: PredictiveAggregateSnapshot) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private notify() {
    const snapshot = this.latest();
    for (const handler of this.handlers) {
      handler(snapshot);
    }
  }
}
