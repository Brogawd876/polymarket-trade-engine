import type { ProfitEventEnvelope, MarketBookPayload } from "../event-store/events.ts";
import { calculateMarkouts, type ReferencePricePoint, type FillForMarkout } from "./markout.ts";

export type FillScoreVerdict =
  | "no_fill"
  | "touch_only"
  | "trade_through_fill"
  | "probable_fill"
  | "unknown_insufficient_data";

export type FillScoreResult = {
  verdict: FillScoreVerdict;
  reason: string;
  fillProbability: number;
  adverseSelection: boolean | null;
  fillTsMs: number | null;
  markouts: {
    "1s": number | null;
    "5s": number | null;
    "30s": number | null;
    settlement: number | null;
  };
  markoutReasons: {
    "1s"?: string;
    "5s"?: string;
    "30s"?: string;
    settlement?: string;
  };
};

export type ScoreFillOptions = {
  orderId: string;
  tokenId: string;
  action: "buy" | "sell";
  side: "UP" | "DOWN";
  price: number;
  shares: number;
  placedTsMs: number;
  queuePosition?: number | null;
  maxWaitMs?: number;
};

export class ConservativeFillScorer {
  evaluate(opts: ScoreFillOptions, events: ProfitEventEnvelope[]): FillScoreResult {
    const sorted = [...events].sort((a, b) => a.processedTsMs - b.processedTsMs);
    
    let verdict: FillScoreVerdict = "unknown_insufficient_data";
    let reason = "no relevant data found";
    let fillProbability = 0;
    let fillTsMs: number | null = null;

    let cumulativeTradeAtPrice = 0;
    let hasTouch = false;
    let hasData = false;
    let queuePosition = opts.queuePosition ?? Infinity;

    const references: ReferencePricePoint[] = [];

    // State for the token's reference point
    let upBid: number | null | undefined = undefined;
    let upAsk: number | null | undefined = undefined;
    let downBid: number | null | undefined = undefined;
    let downAsk: number | null | undefined = undefined;

    for (const evt of sorted) {
      if (evt.processedTsMs < opts.placedTsMs) continue;

      if (evt.eventType === "market_book_snapshot" || evt.eventType === "market_book_delta") {
        const payload = evt.payload as MarketBookPayload;
        if (payload.tokenId === opts.tokenId) {
          hasData = true;
          const isUp = opts.side === "UP";
          const isDown = opts.side === "DOWN";
          
          if (isUp) {
            if (payload.bestBid !== undefined) upBid = payload.bestBid;
            if (payload.bestAsk !== undefined) upAsk = payload.bestAsk;
          } else if (isDown) {
            if (payload.bestBid !== undefined) downBid = payload.bestBid;
            if (payload.bestAsk !== undefined) downAsk = payload.bestAsk;
          }

          const currentRef: ReferencePricePoint = {
            tsMs: evt.processedTsMs,
            upBid, upAsk, downBid, downAsk,
            upMid: upBid != null && upAsk != null ? (upBid + upAsk) / 2 : undefined,
            downMid: downBid != null && downAsk != null ? (downBid + downAsk) / 2 : undefined,
          };
          references.push(currentRef);

          // Check if touched
          if (opts.action === "buy") {
             const ask = isUp ? upAsk : downAsk;
             if (ask !== null && ask !== undefined && ask <= opts.price + 1e-9) {
                 hasTouch = true;
             }
          } else {
             const bid = isUp ? upBid : downBid;
             if (bid !== null && bid !== undefined && bid >= opts.price - 1e-9) {
                 hasTouch = true;
             }
          }
        }
      }

      if (fillTsMs === null) {
        if (evt.eventType === "market_trade") {
          const payload = evt.payload as any;
          if (payload.tokenId === opts.tokenId) {
            hasData = true;
            const tradePrice = payload.price;
            const tradeSize = payload.shares;
            
            const tradedThrough = opts.action === "buy" ? tradePrice < opts.price - 1e-9 : tradePrice > opts.price + 1e-9;
            const tradedAt = Math.abs(tradePrice - opts.price) < 1e-9;

            if (tradedThrough) {
              verdict = "trade_through_fill";
              reason = "trade-through crossed resting maker price";
              fillProbability = 1;
              fillTsMs = evt.processedTsMs;
            } else if (tradedAt) {
              cumulativeTradeAtPrice += tradeSize;
              if (cumulativeTradeAtPrice >= queuePosition + opts.shares) {
                verdict = "probable_fill";
                reason = "exact-price trade volume satisfied queue position";
                fillProbability = 1;
                fillTsMs = evt.processedTsMs;
              }
            }
          }
        } else if (evt.eventType === "last_trade_price") {
           // last_trade_price cannot cause a fill by itself
        }
      }
    }

    if (fillTsMs === null) {
       if (hasData && hasTouch) {
           verdict = "touch_only";
           reason = "price reached resting level but trade-through or queue satisfaction missing";
           fillProbability = 0;
       } else if (hasData) {
           verdict = "no_fill";
           reason = "price never reached resting level";
           fillProbability = 0;
       }
    }

    const markouts = { "1s": null as number | null, "5s": null as number | null, "30s": null as number | null, settlement: null as number | null };
    const markoutReasons: Record<string, string> = {};
    let adverseSelection: boolean | null = null;

    if (fillTsMs !== null) {
      const fillForMarkout: FillForMarkout = {
        orderId: opts.orderId,
        tsMs: fillTsMs,
        side: opts.side,
        action: opts.action,
        price: opts.price,
      };

      const mkResults = calculateMarkouts(fillForMarkout, references, { maxObservationDistanceMs: 5000 });
      
      for (const res of mkResults) {
        let label = res.horizon === 1000 ? "1s" : res.horizon === 5000 ? "5s" : res.horizon === 30000 ? "30s" : "settlement";
        if (res.available && res.value !== null) {
           markouts[label as keyof typeof markouts] = res.value;
        } else {
           if (res.reason) markoutReasons[label] = res.reason;
        }
      }
      
      const m1s = markouts["1s"];
      const m5s = markouts["5s"];
      if (m1s !== null && m1s < 0) adverseSelection = true;
      else if (m5s !== null && m5s < 0) adverseSelection = true;
      else if (m1s !== null || m5s !== null) adverseSelection = false;
    } else {
       markoutReasons["1s"] = "missing_fill";
       markoutReasons["5s"] = "missing_fill";
       markoutReasons["30s"] = "missing_fill";
       markoutReasons["settlement"] = "missing_fill";
    }

    return {
      verdict,
      reason,
      fillProbability,
      adverseSelection,
      fillTsMs,
      markouts,
      markoutReasons,
    };
  }
}
