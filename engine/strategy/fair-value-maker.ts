import type { Strategy, StrategyContext } from "./types.ts";
import { Env } from "../../utils/config.ts";

export interface FairValueMakerConfig {
  shares?: number;
  /** Fixed profit margin buffer (e.g. 0.01 = 1 cent) */
  margin?: number;
  /** Inventory skew factor. Higher values make the bot more aggressive at offloading inventory. */
  inventorySkew?: number;
  /** Maximum inventory (in shares) allowed for one side. */
  maxInventory?: number;
  /** Minimum probability edge required to place any order. */
  minEdge?: number;
}

const DEFAULT_CONFIG: Required<FairValueMakerConfig> = {
  shares: 10,
  margin: 0.01,
  inventorySkew: 0.05, // Skew price by 5% of fair value per maxInventory unit
  maxInventory: 100,
  minEdge: 0.005,
};

/**
 * Fair Value Maker Strategy
 * 
 * Implements the "Market Maker" approach from the research paper:
 * 1. Calculates fair value probability via Black-Scholes digital option model.
 * 2. Places resting limit orders (Maker) to capture rebates and avoid taker fees.
 * 3. skews quotes based on current inventory to manage risk.
 */
export const fairValueMaker: Strategy = async (ctx) => {
  const config = { ...DEFAULT_CONFIG, ...(ctx.strategyConfig as FairValueMakerConfig) };
  
  const releaseLock = ctx.hold();

  const tickInterval = ctx.clock.setInterval(() => {
    const quant = ctx.quant?.latest();
    const probUp = quant?.probabilityUp;
    const sigma = quant?.sigma;
    
    const remainingSecs = (ctx.slotEndMs - ctx.clock.nowMs()) / 1000;
    
    if (remainingSecs <= 0) {
        ctx.clock.clearInterval(tickInterval);
        releaseLock();
        return;
    }
    const remFloor = Math.floor(remainingSecs);
    if (remFloor % 30 === 0 && ctx.clock.nowMs() % 1000 === 0) {
      ctx.log(`[fair-value] P(UP)=${probUp.toFixed(4)} Sigma=${sigma.toFixed(4)} Rem=${remFloor}s`, "dim");
    }
    if (remainingSecs < 10) {
      // Too close to expiry, stop quoting to avoid getting picked off
      ctx.cancelOrders(ctx.pendingOrders.map(o => o.orderId));
      return;
    }

    // 1. Determine current inventory
    const upTokenId = ctx.clobTokenIds[0];
    const downTokenId = ctx.clobTokenIds[1];
    
    let inventoryUp = 0;
    for (const h of ctx.orderHistory) {
      if (h.tokenId === upTokenId) {
        inventoryUp += (h.action === "buy" ? h.shares : -h.shares);
      }
    }
    
    // 2. Calculate Skewed Fair Value
    // Formula: P_skew = P_fair - (inventory / maxInventory) * skewFactor
    const skew = (inventoryUp / config.maxInventory) * config.inventorySkew;
    const adjustedProbUp = Math.max(0.01, Math.min(0.99, probUp - skew));

    // 3. Define Quotes
    // We want to buy UP at adjustedProbUp - margin
    // We want to buy DOWN at (1 - adjustedProbUp) - margin
    const bidPriceUp = parseFloat((adjustedProbUp - config.margin).toFixed(2));
    const bidPriceDown = parseFloat(((1 - adjustedProbUp) - config.margin).toFixed(2));

    // 4. Update Orders
    const existingUp = ctx.pendingOrders.find(o => o.tokenId === upTokenId && o.action === "buy");
    const existingDown = ctx.pendingOrders.find(o => o.tokenId === downTokenId && o.action === "buy");

    const ordersToPost = [];

    // Use a 1-cent tolerance to avoid churn
    const TOLERANCE = 0.01;
    const EPSILON = 0.0001;

    if (bidPriceUp > 0.01 && bidPriceUp < 0.99) {
      if (!existingUp || Math.abs(existingUp.price - bidPriceUp) > (TOLERANCE + EPSILON)) {
        if (existingUp) {
          ctx.log(`[fair-value] Replacing UP quote: ${existingUp.price} -> ${bidPriceUp} (P=${probUp.toFixed(3)})`, "dim");
          ctx.cancelOrders([existingUp.orderId]);
        }
        if (inventoryUp < config.maxInventory) {
          ordersToPost.push({
            req: {
              tokenId: upTokenId,
              action: "buy" as const,
              price: bidPriceUp,
              shares: config.shares,
              orderType: "GTC" as const
            },
            expireAtMs: ctx.clock.nowMs() + 10000
          });
        }
      }
    }

    if (bidPriceDown > 0.01 && bidPriceDown < 0.99) {
      if (!existingDown || Math.abs(existingDown.price - bidPriceDown) > (TOLERANCE + EPSILON)) {
        if (existingDown) {
          ctx.log(`[fair-value] Replacing DOWN quote: ${existingDown.price} -> ${bidPriceDown}`, "dim");
          ctx.cancelOrders([existingDown.orderId]);
        }
        if (inventoryUp > -config.maxInventory) {
          ordersToPost.push({
            req: {
              tokenId: downTokenId,
              action: "buy" as const,
              price: bidPriceDown,
              shares: config.shares,
              orderType: "GTC" as const
            },
            expireAtMs: ctx.clock.nowMs() + 10000
          });
        }
      }
    }
    if (ordersToPost.length > 0) {
      ctx.log(`[fair-value] Posting ${ordersToPost.length} orders. Bids: UP=${bidPriceUp} DOWN=${bidPriceDown}`, "cyan");
      ctx.postOrders(ordersToPost);
    }

  }, 1000); // 1s quote refresh

  return () => ctx.clock.clearInterval(tickInterval);
};
