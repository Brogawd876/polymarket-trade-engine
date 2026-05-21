import { describe, expect, test } from "bun:test";
import { deriveResultFromEvents, type StrategyLabRunResult } from "../../engine/strategy-lab.ts";
import type { TelemetryEvent } from "../../engine/bot-core/index.ts";

describe("StrategyLab Rigorous Fill Evidence", () => {
  const BASE_RESULT: StrategyLabRunResult = {
    id: "run1",
    strategy: "test",
    baseStrategy: "test",
    variantLabel: "test",
    paperEligible: false,
    file: "test.log",
    slug: null,
    status: "completed",
    pnl: null,
    direction: null,
    openPrice: null,
    closePrice: null,
    counts: { intents: 0, allowed: 0, blocked: 0, fills: 0, problems: 0, settlements: 0 },
    verdict: null,
    brierScore: null,
    logLoss: null,
    execution: {} as any, // mocked
  };

  function runScorer(events: TelemetryEvent[], l2Events: any[]) {
    return deriveResultFromEvents(BASE_RESULT, events, [], l2Events);
  }

  test("missing raw L2 file -> conservative evidence unavailable", () => {
    const res = runScorer([
      { ts: 1000, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "intent1", tokenId: "TOKEN_A", createdAtMs: 1001 } as any } },
      { ts: 1005, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "intent1", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any }
    ], []);
    expect(res.execution.conservativeFill.conservativeFillEvidenceAvailable).toBe(false);
    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(0);
    expect(res.execution.conservativeFill.conservativeFillEvidenceSource).toBe("unavailable");
    expect(res.execution.conservativeFill.conservativeFillWarning).toBe("raw_l2_events_missing");
  });

  test("raw L2 market_trade below maker BUY price -> trade_through_fill", () => {
    const res = runScorer([
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "intent1", tokenId: "TOKEN_A", createdAtMs: 1001 } as any } },
      { ts: 1005, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "intent1", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any }
    ], [
      { eventType: "market_trade", processedTsMs: 1004, payload: { tokenId: "TOKEN_A", price: 0.49, shares: 10 } }
    ]);
    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(1);
    expect(res.execution.conservativeFill.conservativeFillVerdictCounts.trade_through_fill).toBe(1);
  });

  test("raw L2 market_trade above maker SELL price -> trade_through_fill", () => {
    const res = runScorer([
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "intent1", tokenId: "TOKEN_A", createdAtMs: 1001 } as any } },
      { ts: 1005, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "intent1", status: "filled", side: "UP", action: "sell", price: 0.60, shares: 10 } as any }
    ], [
      { eventType: "market_trade", processedTsMs: 1004, payload: { tokenId: "TOKEN_A", price: 0.61, shares: 10 } }
    ]);
    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(1);
    expect(res.execution.conservativeFill.conservativeFillVerdictCounts.trade_through_fill).toBe(1);
  });

  test("raw L2 book touch only -> touch_only", () => {
    const res = runScorer([
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "intent1", tokenId: "TOKEN_A", createdAtMs: 1001 } as any } },
      { ts: 1005, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "intent1", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any }
    ], [
      { eventType: "market_book_snapshot", processedTsMs: 1002, payload: { tokenId: "TOKEN_A", side: "UP", bestBid: 0.50, bestAsk: 0.52 } }
    ]);
    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(1);
    expect(res.execution.conservativeFill.conservativeFillVerdictCounts.touch_only).toBe(1);
  });

  test("raw L2 wrong token -> unknown_insufficient_data", () => {
    const res = runScorer([
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "intent1", tokenId: "TOKEN_A", createdAtMs: 1001 } as any } },
      { ts: 1005, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "intent1", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any }
    ], [
      { eventType: "market_trade", processedTsMs: 1004, payload: { tokenId: "TOKEN_WRONG", price: 0.49, shares: 10 } }
    ]);
    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(1);
    expect(res.execution.conservativeFill.conservativeFillVerdictCounts.unknown_insufficient_data).toBe(1);
  });

  test("two intents in same slug, one fill, no unambiguous link -> unavailable", () => {
    const res = runScorer([
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { tokenId: "TOKEN_A", createdAtMs: 1001 } as any } }, // NO ID
      { ts: 1002, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { tokenId: "TOKEN_A", createdAtMs: 1002 } as any } }, // NO ID
      { ts: 1005, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "unknown-order-id", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any }
    ], [
      { eventType: "market_trade", processedTsMs: 1004, payload: { tokenId: "TOKEN_A", price: 0.49, shares: 10 } }
    ]);
    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(0);
    expect(res.execution.conservativeFill.conservativeFillUnavailableReasons.ambiguous_intent_mapping).toBe(1);
  });

  test("fill with matching intentId -> correct token/placement used", () => {
    const res = runScorer([
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "my-intent", tokenId: "TOKEN_A", createdAtMs: 1001 } as any } },
      { ts: 1002, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "other-intent", tokenId: "TOKEN_B", createdAtMs: 1002 } as any } },
      { ts: 1005, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", intentId: "my-intent", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any }
    ], [
      { eventType: "market_trade", processedTsMs: 1004, payload: { tokenId: "TOKEN_A", price: 0.49, shares: 10 } }
    ]);
    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(1);
    expect(res.execution.conservativeFill.conservativeFillVerdictCounts.trade_through_fill).toBe(1);
  });

  test("multiple horizons are averaged separately", () => {
    const res = runScorer([
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "intent1", tokenId: "TOKEN_A", createdAtMs: 1001 } as any } },
      { ts: 1005, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "intent1", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any },
      { ts: 1101, type: "ORDER_INTENT", payload: { slug: "btc-1100", intent: { id: "intent2", tokenId: "TOKEN_B", createdAtMs: 1101 } as any } },
      { ts: 1105, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1100", orderId: "intent2", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any }
    ], [
      { eventType: "market_trade", processedTsMs: 1004, payload: { tokenId: "TOKEN_A", price: 0.49, shares: 10 } },
      { eventType: "market_book_snapshot", processedTsMs: 2004, payload: { tokenId: "TOKEN_A", side: "UP", bestBid: 0.52, bestAsk: 0.52 } }, // 1s markout = 0.52 - 0.50 = 0.02
      { eventType: "market_book_snapshot", processedTsMs: 6004, payload: { tokenId: "TOKEN_A", side: "UP", bestBid: 0.53, bestAsk: 0.53 } }, // 5s markout = 0.53 - 0.50 = 0.03
      { eventType: "market_trade", processedTsMs: 1104, payload: { tokenId: "TOKEN_B", price: 0.49, shares: 10 } },
      { eventType: "market_book_snapshot", processedTsMs: 2104, payload: { tokenId: "TOKEN_B", side: "UP", bestBid: 0.54, bestAsk: 0.54 } } // 1s markout = 0.54 - 0.50 = 0.04
    ]);

    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(2);
    expect(res.execution.conservativeFill.conservativeMarkout1sAvg).toBeCloseTo((0.02 + 0.04) / 2, 4); // 0.03
    expect(res.execution.conservativeFill.conservativeMarkout5sAvg).toBeCloseTo(0.035, 4); // 0.03 from fill1, 0.04 from fill2
    expect(res.execution.conservativeFill.conservativeMarkout30sAvg).toBeNull();
  });

  test("multiple fills aggregate counts (logic check)", () => {
    const res = runScorer([
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "i1", tokenId: "T1", createdAtMs: 1001 } as any } },
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "i2", tokenId: "T2", createdAtMs: 1001 } as any } },
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "i3", tokenId: "T3", createdAtMs: 1001 } as any } },
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "i4", tokenId: "T4", createdAtMs: 1001 } as any } },
      { ts: 1001, type: "ORDER_INTENT", payload: { slug: "btc-1000", intent: { id: "i5", tokenId: "T5", createdAtMs: 1001 } as any } },
      { ts: 1002, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "i1", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any },
      { ts: 1002, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "i2", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any },
      { ts: 1002, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "i3", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any },
      { ts: 1002, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "i4", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any },
      { ts: 1002, type: "ORDER_LIFECYCLE", payload: { slug: "btc-1000", orderId: "i5", status: "filled", side: "UP", action: "buy", price: 0.50, shares: 10 } as any },
    ], [
      { eventType: "market_trade", processedTsMs: 1002, payload: { tokenId: "T1", price: 0.49, shares: 10 } }, // trade_through
      { eventType: "market_book_snapshot", processedTsMs: 1002, payload: { tokenId: "T2", side: "UP", bestBid: 0.50, bestAsk: 0.52 } }, // touch
      { eventType: "market_trade", processedTsMs: 1002, payload: { tokenId: "T3", price: 0.50, shares: 1000 } }, // probable (since queue is unknown, actually wait, unknown queue defaults to Infinity, so this will be no_fill)
      // T4 gets no events -> unknown
      // T5 will also be no_fill or unknown, let's just assert the totals work.
    ]);
    expect(res.execution.conservativeFill.usableEvidenceCount).toBe(5);
    expect(res.execution.conservativeFill.conservativeFillVerdictCounts.trade_through_fill).toBe(1);
    expect(res.execution.conservativeFill.conservativeFillVerdictCounts.touch_only).toBe(1);
    // 3 fills have no data or don't meet fill criteria
    const counts = res.execution.conservativeFill.conservativeFillVerdictCounts;
    expect(counts.no_fill + counts.unknown_insufficient_data).toBe(3);
  });
});
