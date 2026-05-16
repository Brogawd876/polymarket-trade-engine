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
  private clock: Clock;

  constructor(opts: AggregatorOptions) {
    this.asset = opts.asset;
    this.feeds = opts.feeds;
    this.divergenceThresholdAbs = opts.divergenceThresholdAbs ?? 50;
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
    const healthyPrices: number[] = [];
    const now = this.clock.nowMs();

    for (const [name, event] of this.latestEvents) {
      snapshotFeeds[name] = {
        price: event.price,
        quality: event.quality,
        latestEventAgeMs: now - event.clock.receivedAtMs,
        arrivalDelayMs: event.freshnessMs,
      };

      if (event.quality === "live") {
        healthyPrices.push(event.price);
      }
    }

    let price: number | null = null;
    let divergenceAbs: number | null = null;
    let divergencePct: number | null = null;
    let disagreement = false;

    if (healthyPrices.length > 0) {
      price = healthyPrices.reduce((a, b) => a + b, 0) / healthyPrices.length;

      if (healthyPrices.length > 1) {
        const max = Math.max(...healthyPrices);
        const min = Math.min(...healthyPrices);
        divergenceAbs = max - min;
        divergencePct = (divergenceAbs / price) * 100;

        if (divergenceAbs > this.divergenceThresholdAbs) {
          disagreement = true;
        }
      }
      // If exactly one healthy feed, disagreement remains false as divergence cannot be computed.
    } else {
      disagreement = true; // No live feeds is a form of disagreement/failure
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
