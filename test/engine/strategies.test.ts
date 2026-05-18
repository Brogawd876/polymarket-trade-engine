import { describe, expect, test } from "bun:test";
import { calculateSettlementAnchoredFairValue, fairValueMaker } from "../../engine/strategy/fair-value-maker.ts";
import { lateEntry } from "../../engine/strategy/late-entry.ts";
import { VirtualClock } from "../../engine/bot-core/replay-runner.ts";
import type { StrategyContext } from "../../engine/strategy/types.ts";

describe("Strategy Logic Verification", () => {
  function settlementContext(clock: VirtualClock, opts: { stale?: boolean; settlement?: number; predictive?: number } = {}) {
    const settlement = opts.settlement ?? 100_000;
    const predictive = opts.predictive ?? 100_100;
    const resolution = {
      id: "chainlink-1",
      role: "resolution" as const,
      source: "chainlink-polygon-btc-usd",
      sourceType: "chainlink_polygon",
      asset: "btc" as const,
      kind: "live" as const,
      price: settlement,
      priceToBeat: settlement,
      roundId: "1",
      clock: { sourceTimestampMs: clock.nowMs() - (opts.stale ? 100000 : 0), receivedAtMs: clock.nowMs() - (opts.stale ? 100000 : 0), processedAtMs: clock.nowMs(), monotonicReceivedNs: 1n },
      quality: (opts.stale ? "stale" : "live") as any,
      stalenessStatus: (opts.stale ? "stale" : "fresh") as any,
      freshnessMs: 0,
      lagMs: 0,
    };

    return {
      resolution: {
        latest: () => resolution,
        latestAnchor: () => ({ ...resolution, kind: "open" }),
        subscribe: () => () => {},
      },
      predictive: {
        aggregate: {
          latest: () => ({
            asset: "btc",
            timestampMs: clock.nowMs(),
            price: predictive,
            settlementAnchor: {
              price: settlement,
              roundId: "1",
              updatedAtMs: clock.nowMs(),
              localReceivedAtMs: clock.nowMs(),
              lagMs: 0,
              isStale: false,
              quality: "live",
              source: "chainlink-polygon-btc-usd",
              sourceType: "chainlink_polygon",
            },
            predictiveTape: {
              compositePrice: predictive,
              feeds: {},
              divergenceAbs: 0,
              divergencePct: 0,
              disagreement: false,
            },
            marketPrice: {
              yesBestBid: null,
              yesBestAsk: null,
              yesMidpoint: null,
              noBestBid: null,
              noBestAsk: null,
              noMidpoint: null,
              yesSpread: null,
              noSpread: null,
              executable: false,
              source: null,
            },
            feeds: {},
            divergenceAbs: 0,
            divergencePct: 0,
            disagreement: false,
          }),
        },
      },
    } as Partial<StrategyContext>;
  }

  test("fair-value-maker places limit orders based on probability", async () => {
    const clock = new VirtualClock();
    
    // Mock StrategyContext
    const postedOrders: any[] = [];
    const ctx: Partial<StrategyContext> = {
      clock,
      ...settlementContext(clock, { settlement: 100_000, predictive: 100_043 }),
      slotEndMs: 1000000,
      clobTokenIds: ["up-id", "down-id"],
      orderHistory: [],
      pendingOrders: [],
      quant: {
        latest: () => ({
          asset: "btc",
          timestampMs: clock.nowMs(),
          sigma: 0.20,
          probabilityUp: 0.65 // Theoretical probability 65%
        }),
        subscribe: () => () => {}
      } as any,
      postOrders: async (orders) => {
        postedOrders.push(...orders);
        return [];
      },
      cancelOrders: async () => ({ canceled: [], not_canceled: {} }),
      log: () => {}
    };

    // Start strategy
    const cleanup = await fairValueMaker(ctx as StrategyContext);
    
    // 1. Initial tick
    clock.setNowMs(1000);
    
    expect(postedOrders.length).toBeGreaterThan(0);
    
    const upOrder = postedOrders.find(o => o.req.tokenId === "up-id");
    expect(upOrder.req.price).toBeCloseTo(0.64, 1);
    
    const downOrder = postedOrders.find(o => o.req.tokenId === "down-id");
    expect(downOrder.req.price).toBeCloseTo(0.34, 1);

    if (cleanup) cleanup();
  });

  test("fair-value-maker skews quotes based on inventory", async () => {
    const clock = new VirtualClock();
    const postedOrders: any[] = [];
    
    const ctx: Partial<StrategyContext> = {
      clock,
      ...settlementContext(clock, { settlement: 100_000, predictive: 100_000 }),
      slotEndMs: 1000000,
      clobTokenIds: ["up-id", "down-id"],
      orderHistory: [
        { tokenId: "up-id", action: "buy", shares: 50, price: 0.5, ts: 0, status: "filled", id: "1" }
      ],
      pendingOrders: [],
      quant: {
        latest: () => ({
          asset: "btc",
          timestampMs: clock.nowMs(),
          sigma: 0.20,
          probabilityUp: 0.50 
        }),
        subscribe: () => () => {}
      } as any,
      postOrders: async (orders) => {
        postedOrders.push(...orders);
        return [];
      },
      cancelOrders: async () => ({ canceled: [], not_canceled: {} }),
      log: () => {}
    };

    await fairValueMaker(ctx as StrategyContext);
    clock.setNowMs(1000);

    const upOrder = postedOrders.find(o => o.req.tokenId === "up-id");
    expect(upOrder.req.price).toBeGreaterThan(0.45);
    expect(upOrder.req.price).toBeLessThan(0.48);
    
    const downOrder = postedOrders.find(o => o.req.tokenId === "down-id");
    expect(downOrder.req.price).toBeGreaterThan(0.50);
  });

  test("fair-value-maker blocks normal fair value when Chainlink is stale", () => {
    const clock = new VirtualClock();
    clock.setNowMs(1000);
    const ctx: Partial<StrategyContext> = {
      clock,
      slotEndMs: 1000000,
      ...settlementContext(clock, { stale: true }),
    };

    const result = calculateSettlementAnchoredFairValue(ctx as StrategyContext, 0.2);

    expect(result.probabilityUp).toBeNull();
    expect(result.noTradeReason).toContain("Chainlink resolution feed");
  });

  test("fair-value-maker uses predictive tape for S but Chainlink settlement anchor for K", () => {
    const clock = new VirtualClock();
    clock.setNowMs(1000);
    const ctx: Partial<StrategyContext> = {
      clock,
      slotEndMs: 1000000,
      ...settlementContext(clock, { settlement: 100_000, predictive: 101_000 }),
    };

    const highPredictive = calculateSettlementAnchoredFairValue(ctx as StrategyContext, 0.2);
    const shiftedSettlement = calculateSettlementAnchoredFairValue({
      ...ctx,
      ...settlementContext(clock, { settlement: 102_000, predictive: 101_000 }),
    } as StrategyContext, 0.2);

    expect(highPredictive.settlementAnchorPrice).toBe(100_000);
    expect(highPredictive.predictiveCompositePrice).toBe(101_000);
    expect(highPredictive.probabilityUp).toBeGreaterThan(shiftedSettlement.probabilityUp ?? 1);
  });

  test("late-entry (Flow Aware) respects imbalance guard", async () => {
    const clock = new VirtualClock();
    const placed: any[] = [];
    
    const ctx: Partial<StrategyContext> = {
      clock,
      slotEndMs: 1000000,
      clobTokenIds: ["up-id", "down-id"],
      orderHistory: [],
      pendingOrders: [],
      ticker: { divergence: 0, assetPrice: 70000 } as any,
      priceToBeat: 60000,
      hold: () => () => {},
      getMarketResult: () => ({ openPrice: 60000, closePrice: 0, direction: "UP", slug: "1" }),
      orderBook: {
        bestAskInfo: () => ({ price: 0.50, liquidity: 100 }),
        bestBidInfo: () => ({ price: 0.49, liquidity: 100 }),
        getTokenId: (side: any) => side === "UP" ? "up-id" : "down-id"
      } as any,
      orderFlow: {
        latest: () => ({
          imbalanceUp: -0.5, 
          cvd10s: { up: 0, down: 1000 },
          recentWhales: [],
          sentiment: "bearish"
        })
      } as any,
      postOrders: async (orders: any) => {
        placed.push(...orders);
        return [];
      },
      log: () => {}
    };

    const config = { certaintyPrice: 0.4, minImbalance: 0.3 };
    
    await lateEntry(ctx as StrategyContext, config);
    clock.setNowMs(1000);

    // Should NOT trade because imbalance is -0.5 and we need +0.3
    expect(placed.length).toBe(0);

    // Change imbalance to bullish
    (ctx.orderFlow!.latest as any) = () => ({
        imbalanceUp: 0.8,
        cvd10s: { up: 1000, down: 0 },
        recentWhales: [],
        sentiment: "bullish"
    });

    clock.setNowMs(2000);
    expect(placed.length).toBeGreaterThan(0);
  });
});
