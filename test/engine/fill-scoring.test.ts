import { describe, expect, it } from "bun:test";
import { ConservativeFillScorer, type ScoreFillOptions } from "../../engine/replay/fill-scoring.ts";
import type { ProfitEventEnvelope } from "../../engine/event-store/events.ts";

function mockEvent(type: string, tsMs: number, payload: any): ProfitEventEnvelope {
  return {
    eventId: crypto.randomUUID(),
    schemaVersion: 1,
    runId: "test",
    sessionId: "test",
    eventType: type as any,
    source: "test",
    receivedTsMs: tsMs,
    processedTsMs: tsMs,
    commitSha: "test",
    payload,
  };
}

describe("ConservativeFillScorer", () => {
  const scorer = new ConservativeFillScorer();

  const baseOrder: ScoreFillOptions = {
    orderId: "order1",
    tokenId: "tokenA",
    action: "buy",
    side: "UP",
    price: 0.50,
    shares: 100,
    placedTsMs: 1000,
  };

  it("exact-price trade with unknown queue is not a fill", () => {
    const events = [
      mockEvent("market_book_snapshot", 1001, { tokenId: "tokenA", side: "UP", bestAsk: 0.50 }),
      mockEvent("market_trade", 1002, { tokenId: "tokenA", price: 0.50, shares: 1000 }),
    ];
    const result = scorer.evaluate(baseOrder, events);
    // Queue is unknown (defaults to Infinity). Exact price trade won't satisfy it.
    // It should be touch_only because the book snapshot shows an ask at 0.50 (touch).
    expect(result.verdict).toBe("touch_only");
    expect(result.fillTsMs).toBeNull();
  });

  it("exact-price trade with known queue satisfied is a probable fill", () => {
    const order = { ...baseOrder, queuePosition: 200 };
    const events = [
      mockEvent("market_trade", 1001, { tokenId: "tokenA", price: 0.50, shares: 200 }), // Not enough yet (200 >= 200+100 is false)
      mockEvent("market_trade", 1002, { tokenId: "tokenA", price: 0.50, shares: 150 }), // Cumulative 350 >= 300. Satisfied!
    ];
    const result = scorer.evaluate(order, events);
    expect(result.verdict).toBe("probable_fill");
    expect(result.fillTsMs).toBe(1002);
  });

  it("exact-price trade with known queue not satisfied is not a fill", () => {
    const order = { ...baseOrder, queuePosition: 200 };
    const events = [
      mockEvent("market_trade", 1001, { tokenId: "tokenA", price: 0.50, shares: 100 }),
    ];
    const result = scorer.evaluate(order, events);
    // No touch event provided, so it's a no_fill. If there was a touch, it would be touch_only.
    expect(result.verdict).toBe("no_fill");
  });

  it("trade-through is strong fill evidence", () => {
    const events = [
      mockEvent("market_trade", 1001, { tokenId: "tokenA", price: 0.49, shares: 10 }), // Trade through!
    ];
    const result = scorer.evaluate(baseOrder, events);
    expect(result.verdict).toBe("trade_through_fill");
    expect(result.fillTsMs).toBe(1001);
  });

  it("buy/sell symmetry", () => {
    const sellOrder = { ...baseOrder, action: "sell" as const, price: 0.60, queuePosition: 100 };
    
    // Trade through (buy > 0.60)
    const throughEvents = [mockEvent("market_trade", 1001, { tokenId: "tokenA", price: 0.61, shares: 10 })];
    expect(scorer.evaluate(sellOrder, throughEvents).verdict).toBe("trade_through_fill");

    // Exact price satisfied
    const exactEvents = [mockEvent("market_trade", 1001, { tokenId: "tokenA", price: 0.60, shares: 250 })];
    expect(scorer.evaluate(sellOrder, exactEvents).verdict).toBe("probable_fill");

    // Touch only
    const touchEvents = [mockEvent("market_book_snapshot", 1001, { tokenId: "tokenA", side: "UP", bestBid: 0.60 })];
    expect(scorer.evaluate(sellOrder, touchEvents).verdict).toBe("touch_only");
  });

  it("token mismatch ignored", () => {
    const events = [
      mockEvent("market_trade", 1001, { tokenId: "tokenB", price: 0.40, shares: 1000 }), // Traded through, but wrong token
    ];
    const result = scorer.evaluate(baseOrder, events);
    expect(result.verdict).toBe("unknown_insufficient_data");
  });

  it("last_trade_price does not create fill", () => {
    const events = [
      // Traded through price, but it's a last_trade_price event, not market_trade
      mockEvent("last_trade_price", 1001, { tokenId: "tokenA", price: 0.45 }), 
    ];
    // Will be no_fill or unknown, but NOT a fill verdict
    const result = scorer.evaluate(baseOrder, events);
    expect(result.verdict).not.toBe("trade_through_fill");
    expect(result.verdict).not.toBe("probable_fill");
  });

  it("missing future reference gives null markout with reason", () => {
    const events = [
      mockEvent("market_trade", 1001, { tokenId: "tokenA", price: 0.49, shares: 10 }), // Fill at 1001
      // No more events...
    ];
    const result = scorer.evaluate(baseOrder, events);
    expect(result.fillTsMs).toBe(1001);
    expect(result.markouts["1s"]).toBeNull();
    expect(result.markoutReasons["1s"]).toBe("missing_horizon");
  });

  it("pre-placement events ignored", () => {
    const events = [
      mockEvent("market_trade", 900, { tokenId: "tokenA", price: 0.45, shares: 1000 }), // Traded through before placement
      mockEvent("market_trade", 1005, { tokenId: "tokenA", price: 0.50, shares: 10 }), // Not enough for queue
    ];
    const result = scorer.evaluate({ ...baseOrder, queuePosition: 100 }, events);
    expect(result.verdict).toBe("no_fill"); // Since 900 is ignored
  });

  it("out-of-order event handling", () => {
    const events = [
      mockEvent("market_trade", 1005, { tokenId: "tokenA", price: 0.45, shares: 100 }), // This trade-through comes later
      mockEvent("market_book_snapshot", 1002, { tokenId: "tokenA", side: "UP", bestAsk: 0.50 }), // This comes earlier
    ];
    const result = scorer.evaluate(baseOrder, events);
    expect(result.verdict).toBe("trade_through_fill");
    expect(result.fillTsMs).toBe(1005);
  });

  it("adverse selection with valid markout", () => {
    const events = [
      mockEvent("market_trade", 1001, { tokenId: "tokenA", price: 0.49, shares: 10 }), // Fill at 0.49
      // At 1001 + 1000 = 2001, the price is 0.48 (which is worse than our fill price of 0.50)
      mockEvent("market_book_snapshot", 2001, { tokenId: "tokenA", side: "UP", bestBid: 0.48, bestAsk: 0.48 }),
    ];
    const result = scorer.evaluate(baseOrder, events);
    expect(result.fillTsMs).toBe(1001);
    expect(result.markouts["1s"]).not.toBeNull();
    expect(result.markouts["1s"]).toBeLessThan(0); // 0.48 - 0.50 = -0.02
    expect(result.adverseSelection).toBe(true);
  });
});
