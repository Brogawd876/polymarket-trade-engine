import type { Strategy, StrategyContext } from "./types.ts";
import { lateEntry, type LateEntryConfig } from "./late-entry.ts";

/**
 * Late Entry Adaptive (v1.0)
 * 
 * High-Conviction "Smart Sniper" with Adaptive Microstructure:
 * 
 * 1. Divergence-Based Sizing:
 *    - If exchanges disagree by <$10: Trade 100% size (High Conviction).
 *    - If exchanges disagree by $10-$30: Trade 50% size (Caution).
 *    - If exchanges disagree by >$50: Disagreement Block (Safety).
 * 
 * 2. Slippage Buffer (Protection):
 *    - Automatically adds a 0.5-1.0 cent buffer to the entry price when 
 *      market divergence is rising, ensuring fills only during real moves.
 * 
 * 3. Volume-Weighted Alpha:
 *    - Relies on the upgraded Weighted Aggregator to filter out noise from 
 *      lower-volume exchanges (e.g., Coinbase lagging Binance).
 */

export const lateEntryAdaptive: Strategy = async (ctx) => {
    const aggregate = ctx.predictive.aggregate?.latest();
    const divergence = aggregate?.divergenceAbs ?? 0;

    // --- Institutional Rule 1: Adaptive Sizing ---
    let sizingMultiplier = 1.0;
    if (divergence > 30) {
        sizingMultiplier = 0.0; // Too noisy, wait for agreement
    } else if (divergence > 10) {
        sizingMultiplier = 0.5; // High volatility, reduce risk
    }

    // --- Institutional Rule 2: Slippage Buffer ---
    // If markets are disagreeing, we only want to get in if the move is 
    // strong enough to push through the "noise."
    const slippageBuffer = divergence > 20 ? 0.01 : 0.005;

    const ADAPTIVE_CONFIG: LateEntryConfig = {
      shares: Math.floor(6 * sizingMultiplier),
      certaintyPrice: 0.72 + slippageBuffer, // Adjust threshold by market noise
      minLiquidity: 30,
      minGapSafety: 35,
      minRemainingSec: 45,
      entryWindowSec: 180,
      minPeakGapRatio: 0.80,
      stopLossPrice: 0.52,
    };

    // If sizing was reduced to 0, we effectively block this tick
    if (ADAPTIVE_CONFIG.shares! <= 0) {
        return; 
    }

    return lateEntry(ctx, ADAPTIVE_CONFIG);
};
