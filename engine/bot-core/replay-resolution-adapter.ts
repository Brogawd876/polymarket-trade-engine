import { 
  type ResolutionSourceAdapter, 
  type ResolutionPriceEvent, 
  type RoundWindow,
  type BotAsset,
  createEventClock 
} from "./data-sources.ts";
import type { ReplayLogReader, ReplayEvent } from "./replay-log-reader.ts";

export class ReplayResolutionAdapter implements ResolutionSourceAdapter {
  readonly role = "resolution";
  readonly source = "replay-resolution";
  private handlers = new Set<(event: ResolutionPriceEvent) => void>();
  private _latest: ResolutionPriceEvent | null = null;
  private asset: BotAsset = "btc";

  constructor(reader: ReplayLogReader) {
    reader.subscribe((evt) => this.handleEvent(evt));
  }

  isReady(): boolean {
    return this._latest !== null;
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  latest(): ResolutionPriceEvent | null {
    return this._latest;
  }

  subscribe(handler: (event: ResolutionPriceEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async priceToBeat(round: RoundWindow): Promise<ResolutionPriceEvent | null> {
    return this._latest;
  }

  async closePrice(round: RoundWindow): Promise<ResolutionPriceEvent | null> {
    return this._latest;
  }

  private handleEvent(evt: ReplayEvent) {
    if (evt.type === "market_price") {
      const clock = createEventClock({
        receivedAtMs: evt.ts,
        processedAtMs: evt.ts,
        monotonicReceivedNs: BigInt(evt.ts),
      });

      const resEvent: ResolutionPriceEvent = {
        id: `replay-res-market-${evt.ts}`,
        role: "resolution",
        source: this.source,
        asset: this.asset,
        kind: "open",
        price: evt.openPrice,
        priceToBeat: evt.priceToBeat ?? evt.openPrice,
        clock,
        quality: "live",
        freshnessMs: 0,
        lagMs: 0,
      };

      this._latest = resEvent;
      for (const h of this.handlers) h(resEvent);
    } else if (evt.type === "ticker") {
      if (evt.assetPrice === undefined || evt.assetPrice === null) return;

      const clock = createEventClock({
        receivedAtMs: evt.ts,
        processedAtMs: evt.ts,
        monotonicReceivedNs: BigInt(evt.ts),
      });

      const resEvent: ResolutionPriceEvent = {
        id: `replay-res-live-${evt.ts}`,
        role: "resolution",
        source: this.source,
        asset: this.asset,
        kind: "live",
        price: evt.assetPrice,
        clock,
        quality: "live",
        freshnessMs: 0,
        lagMs: 0,
      };

      this._latest = resEvent;
      for (const h of this.handlers) h(resEvent);
    }
  }
}
