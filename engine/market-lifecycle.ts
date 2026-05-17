import { OrderBook } from "../tracker/orderbook.ts";
import { APIQueue } from "../tracker/api-queue.ts";
import { Logger } from "./logger.ts";
import type { EarlyBirdClient, PlacedOrder } from "./client.ts";
import type { LogColor } from "./log.ts";
import type {
  Strategy,
  StrategyContext,
  OrderRequest,
} from "./strategy/types.ts";
import type { CancelOrderResponse } from "../utils/trading.ts";
import type { WalletTracker } from "./wallet-tracker.ts";
import type { TickerTracker } from "../tracker/ticker";
import { slotFromSlug } from "../utils/slot.ts";
import { Env } from "../utils/config.ts";
import type { UserChannel } from "./user-channel.ts";
import {
  type ResolutionSourceAdapter,
  type VenueDataAdapter,
  type PredictiveFeedAdapter,
  type PredictiveSignalAggregator,
  type LeadLagMonitor,
  type RoundWindow,
  PolymarketVenueAdapter,
  AggregatedRiskGate,
  DEFAULT_SIMULATION_RISK_LIMITS,
  type BotFeedEvent,
  type RiskGate,
  type RiskSnapshot,
  type StrategyIntent,
  type Clock,
  RealClock,
} from "./bot-core/index.ts";
import { 
  type TelemetrySink, 
  NullTelemetrySink 
} from "./telemetry/index.ts";

const DEFAULT_FEED_READINESS_TIMEOUT_MS = 5000;
const DEFAULT_FEED_READINESS_POLL_MS = 100;
const EMERGENCY_SELL_RETRY_DELAY_MS = 350;

function parseEnvInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export type LifecycleState = "INIT" | "RUNNING" | "STOPPING" | "DONE";

export type PendingOrder = {
  orderId: string;
  tokenId: string;
  action: "buy" | "sell";
  orderType?: "GTC" | "FOK";
  intentId?: string;
  price: number;
  shares: number;
  expireAtMs: number;
  placedAtMs: number;
  onFilled?: (filledShares: number) => void;
  onExpired?: () => void | Promise<void>;
  onFailed?: (reason: string) => void | Promise<void>;
};

export type CompletedOrder = {
  action: "buy" | "sell";
  price: number;
  shares: number;
  fee: number;
  tokenId: string;
};

/** Serializable subset of PendingOrder (no callbacks). */
export type PendingOrderSnapshot = Omit<
  PendingOrder,
  "onFilled" | "onExpired" | "onFailed"
>;

type RecoveryOptions = {
  state: "RUNNING" | "STOPPING";
  conditionId: string;
  clobTokenIds: [string, string];
  pendingOrders: PendingOrder[];
  orderHistory: CompletedOrder[];
};

type MarketLifecycleOptions = {
  slug: string;
  apiQueue: APIQueue;
  client: EarlyBirdClient;
  log: (msg: string, color?: LogColor) => void;
  strategyName: string;
  strategy: Strategy;
  tracker: WalletTracker;
  ticker: TickerTracker;
  userChannel: UserChannel;
  recovery?: RecoveryOptions;
  alwaysLog?: boolean;
  /** Optional OrderBook override (used in tests to inject SimOrderBook). */
  orderBook?: OrderBook;
  resolution?: ResolutionSourceAdapter;
  binance?: PredictiveFeedAdapter;
  coinbase?: PredictiveFeedAdapter;
  aggregator?: PredictiveSignalAggregator;
  leadLag?: LeadLagMonitor;
  venue?: VenueDataAdapter;
  riskGate?: RiskGate;
  clock?: Clock;
  feedReadinessTimeoutMs?: number;
  feedReadinessPollMs?: number;
  telemetry?: TelemetrySink;
};

export class MarketLifecycle {
  private _state: LifecycleState = "INIT";
  private _ticking = false;
  private _orderBook: OrderBook;
  private _userChannel: UserChannel;
  private _clock: Clock;
  private _telemetry: TelemetrySink;

  private _clobTokenIds: [string, string] | null = null;
  private _conditionId: string | null = null;

  private _feeRate = 0;
  private _pendingOrders: PendingOrder[] = [];
  private _orderHistory: CompletedOrder[] = [];
  private _buyBlocked = false;
  private _sellBlocked = false;
  private _pnl = 0;
  private _inFlight = 0;
  private _strategyLocks = 0;
  private _marketLogger = new Logger();
  private _marketOpenTimer: any = null;
  private _marketPriceHandle: { cancel: () => void } | null = null;
  private _strategyCleanup: (() => void) | null = null;
  private _feedReadinessDeadlineMs: number | null = null;
  private _setupPromise: Promise<void> | null = null;

  readonly slug: string;
  private readonly apiQueue: APIQueue;
  private readonly client: EarlyBirdClient;
  private readonly _log: (msg: string, color?: LogColor) => void;
  private readonly _strategyName: string;
  private readonly _strategy: Strategy;
  private readonly _tracker: WalletTracker;
  private readonly _ticker: TickerTracker;
  private readonly _alwaysLog: boolean;
  private readonly _resolution?: ResolutionSourceAdapter;
  private readonly _binance?: PredictiveFeedAdapter;
  private readonly _coinbase?: PredictiveFeedAdapter;
  private readonly _aggregator?: PredictiveSignalAggregator;
  private readonly _leadLag?: LeadLagMonitor;
  private readonly _venue: VenueDataAdapter;
  private readonly _riskGate: RiskGate;
  private readonly _feedReadinessTimeoutMs: number;
  private readonly _feedReadinessPollMs: number;

  constructor(opts: MarketLifecycleOptions) {
    this.slug = opts.slug;
    this.apiQueue = opts.apiQueue;
    this.client = opts.client;
    this._log = opts.log;
    this._strategyName = opts.strategyName;
    this._strategy = opts.strategy;
    this._tracker = opts.tracker;
    this._ticker = opts.ticker;
    this._alwaysLog = opts.alwaysLog ?? false;
    this._clock = opts.clock ?? new RealClock();
    this._telemetry = opts.telemetry ?? new NullTelemetrySink();
    this._orderBook = opts.orderBook ?? new OrderBook(this._clock);
    this._userChannel = opts.userChannel;
    this._resolution = opts.resolution;
    this._binance = opts.binance;
    this._coinbase = opts.coinbase;
    this._aggregator = opts.aggregator;
    this._leadLag = opts.leadLag;
    this._riskGate = opts.riskGate ?? new AggregatedRiskGate();
    this._feedReadinessTimeoutMs =
      opts.feedReadinessTimeoutMs ??
      parseEnvInt(
        "FEED_READINESS_TIMEOUT_MS",
        DEFAULT_FEED_READINESS_TIMEOUT_MS,
      );
    this._feedReadinessPollMs =
      opts.feedReadinessPollMs ??
      parseEnvInt("FEED_READINESS_POLL_MS", DEFAULT_FEED_READINESS_POLL_MS);

    // Per-market venue adapter wraps the per-market orderbook
    this._venue =
      opts.venue ??
      new PolymarketVenueAdapter(
        Env.get("MARKET_ASSET"),
        this._orderBook,
        this.apiQueue,
        this._clock,
      );

    const recovery = opts.recovery;
    if (recovery) {
      this._state = recovery.state;
      this._clobTokenIds = recovery.clobTokenIds;
      this._pendingOrders = recovery.pendingOrders;
      this._orderHistory = recovery.orderHistory;
      if (recovery.state === "STOPPING") this._buyBlocked = true;
      this._orderBook.subscribe(recovery.clobTokenIds);
      this._userChannel.subscribe(recovery.conditionId);

      // track pending orders for user channel
      for (const pending of this._pendingOrders) {
        const orderId = pending.orderId;
        this._userChannel.trackOrder(orderId, {
          req: {
            tokenId: pending.tokenId,
            action: pending.action,
            price: pending.price,
            shares: pending.shares,
            orderType: pending.orderType,
          },
          expireAtMs: pending.expireAtMs,
          onFilled: (gross) => {
            const p = this._pendingOrders.find((o) => o.orderId === orderId);
            if (!p) return;
            this._commitFill(p, gross, 0);
          },
        });
      }
    }
  }

  get state(): LifecycleState {
    return this._state;
  }
  get pnl(): number {
    return this._pnl;
  }
  get clobTokenIds(): [string, string] | null {
    return this._clobTokenIds;
  }
  get conditionId(): string | null {
    return this._conditionId;
  }
  get pendingOrders(): PendingOrderSnapshot[] {
    return this._pendingOrders.map(
      ({ onFilled, onExpired, onFailed, ...rest }) => rest,
    );
  }
  get orderHistory(): CompletedOrder[] {
    return this._orderHistory;
  }
  /** Unix ms timestamp when this lifecycle's market slot starts (market opens). */
  get slotStartMs(): number {
    return slotFromSlug(this.slug).startTime;
  }
  /** Unix ms timestamp when this lifecycle's market slot ends. */
  get slotEndMs(): number {
    return slotFromSlug(this.slug).endTime;
  }
  get remainingSecs(): number {
    return (this.slotEndMs - this._clock.nowMs()) / 1000;
  }
  get strategyName(): string {
    return this._strategyName;
  }

  /** Returns orderbook snapshot for a tokenId owned by this lifecycle. */
  getBookSnapshot(tokenId: string) {
    if (!this._clobTokenIds) return null;
    let side: "UP" | "DOWN" | null = null;
    if (tokenId === this._clobTokenIds[0]) side = "UP";
    else if (tokenId === this._clobTokenIds[1]) side = "DOWN";
    if (!side) return null;
    const askInfo = this._orderBook.bestAskInfo(side);
    const bidInfo = this._orderBook.bestBidInfo(side);
    return {
      bestAsk: askInfo?.price ?? null,
      bestAskLiquidity: askInfo?.liquidity ?? null,
      bestBid: bidInfo?.price ?? null,
      bestBidLiquidity: bidInfo?.liquidity ?? null,
    };
  }

  /**
   * Signal graceful shutdown. INIT lifecycles are marked DONE immediately.
   * RUNNING lifecycles transition to STOPPING on next tick.
   */
  shutdown(): void {
    if (this._state === "INIT") {
      this._setState("DONE");
      return;
    }
    if (this._state === "RUNNING") {
      this._buyBlocked = true;
      this._setState("STOPPING");
    }
    // STOPPING already â€” no-op
  }

  destroy(): void {
    if (this._orderHistory.length > 0 || this._alwaysLog) {
      this._marketLogger.endSlot(this.slug);
    }
    this._marketLogger.destroy();
    this._marketPriceHandle?.cancel();
    if (this._marketOpenTimer) this._clock.clearTimeout(this._marketOpenTimer);
    this._venue.stop();
    this._orderBook.destroy();
    for (const pending of this._pendingOrders) {
      this._userChannel.untrackOrder(pending.orderId);
    }
    this._userChannel.destroy();
    this._log(`[${this.slug}] destroy()`, "dim");
  }

  private _setState(next: LifecycleState): void {
    if (this._state === next) return;
    const from = this._state;
    this._log(`[${this.slug}] state: ${from} â†’ ${next}`, "dim");
    this._state = next;
    this._telemetry.push({
      ts: this._clock.nowMs(),
      type: "LIFECYCLE_STATE",
      payload: { slug: this.slug, from, to: next }
    });
  }

  async tick(): Promise<void> {
    if (this._ticking || this._state === "DONE") return;
    this._ticking = true;
    try {
      await this._step();
      
      // Heartbeat market tick
      if (this._state === "RUNNING" || this._state === "INIT") {
        const slotStartMs = this.slotStartMs;
        const marketResult = this.apiQueue.marketResult.get(slotStartMs);
        const priceToBeat = marketResult?.openPrice ?? null;
        const currentPrice = this._ticker.price ?? 0;
        const gap =
          priceToBeat !== null && currentPrice
            ? parseFloat((currentPrice - priceToBeat).toFixed(2))
            : null;
        const direction =
          gap === null ? null : gap > 0 ? "UP" : gap < 0 ? "DOWN" : "TIE";
        const upBid = this._orderBook.bestBidPrice("UP");
        const upAsk = this._orderBook.bestAskPrice("UP");
        const downBid = this._orderBook.bestBidPrice("DOWN");
        const downAsk = this._orderBook.bestAskPrice("DOWN");

        this._telemetry.push({
          ts: this._clock.nowMs(),
          type: "MARKET_TICK",
          payload: {
            slug: this.slug,
            asset: Env.get("MARKET_ASSET"),
            price: currentPrice,
            bid: upBid,
            ask: upAsk,
            slotStartMs,
            slotEndMs: this.slotEndMs,
            priceToBeat,
            gap,
            direction,
            upBid,
            upAsk,
            downBid,
            downAsk,
          }
        });
        
        if (this._aggregator) {
            this._telemetry.push({
                ts: this._clock.nowMs(),
                type: "PREDICTIVE_AGGREGATE",
                payload: this._aggregator.latest()
            });
        }
        if (this._leadLag) {
            this._telemetry.push({
                ts: this._clock.nowMs(),
                type: "LEAD_LAG_UPDATE",
                payload: this._leadLag.latest()
            });
        }
      }
    } catch (e) {
      this._log(`[${this.slug}] tick error: ${e}`, "red");
    } finally {
      this._ticking = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Core engine
  // ---------------------------------------------------------------------------

  private async _step(): Promise<void> {
    switch (this._state) {
      case "INIT":
        return this._handleInit();
      case "RUNNING":
        return this._handleRunning();
      case "STOPPING":
        return this._handleStopping();
    }
  }

  async setup(): Promise<void> {
    if (this._setupPromise) return this._setupPromise;

    this._setupPromise = (async () => {
      const slot = slotFromSlug(this.slug);
      const round: RoundWindow = {
        slug: this.slug,
        asset: Env.get("MARKET_ASSET"),
        window: Env.get("MARKET_WINDOW"),
        startTimeMs: slot.startTime,
        endTimeMs: slot.endTime,
      };

      // Use recovery state if available to avoid refetch
      const existing = this._conditionId
        ? {
            conditionId: this._conditionId,
            clobTokenIds: this._clobTokenIds!,
            feeRateBps: this._feeRate,
          }
        : undefined;

      this._log(`[${this.slug}] calling venue.initRound`, "dim");
      const metadata = await this._venue.initRound(round, existing);
      this._log(
        `[${this.slug}] venue.initRound returned ${metadata ? "metadata" : "null"}`,
        "dim",
      );
      if (!metadata) {
        this._setupPromise = null; // Allow retry on next tick if failed
        return;
      }

      this._conditionId = metadata.conditionId;
      this._clobTokenIds = metadata.clobTokenIds;
      this._feeRate = metadata.feeRateBps;

      this._orderBook.subscribe(metadata.clobTokenIds);
    })();

    return this._setupPromise;
  }  private async _handleInit(): Promise<void> {
    await this.setup();
    if (!this._clobTokenIds) return;

    const slot = slotFromSlug(this.slug);
    const delayMs = Math.max(0, slot.startTime - this._clock.nowMs());
    if (!this._marketOpenTimer) {
      this._marketOpenTimer = this._clock.setTimeout(() => {
        this._marketPriceHandle = this.apiQueue.queueMarketPrice(slot);
      }, delayMs);
    }

    // Start venue events
    await this._venue.start();

    if (!this._orderBook.isReady() || !this._userChannel.isReady()) {
      return;
    }

    const readiness = this._checkRequiredFeedsReadiness();
    if (!readiness.ready) {
      const now = this._clock.nowMs();
      if (!this._feedReadinessDeadlineMs) {
        this._feedReadinessDeadlineMs = now + this._feedReadinessTimeoutMs;
      }

      if (now < this._feedReadinessDeadlineMs) {
        return; // Wait for next tick
      }

      const reason = readiness.reasons.join("; ");
      this._buyBlocked = true;
      this._sellBlocked = true;
      this._log(
        `[${this.slug}] Required feeds not ready after ${this._feedReadinessTimeoutMs}ms: ${reason}. No-trading round.`,
        "yellow",
      );
      this._marketLogger.log({
        type: "info",
        msg: "required feeds not ready; no-trading round",
        reason,
      });
      this._setState("DONE");
      return;
    }

    this._userChannel.subscribe(this._conditionId!);
    this._marketLogger.setSnapshotProvider(() =>
      this._orderBook.getSnapshotData(),
    );
    this._marketLogger.setTickerProvider(() => ({
      assetPrice: this._ticker.price,
      binancePrice: this._ticker.binancePrice,
      coinbasePrice: this._ticker.coinbasePrice,
      okxPrice: this._ticker.okxPrice,
      bybitPrice: this._ticker.bybitPrice,
      divergence: this._ticker.divergence,
    }));
    this._marketLogger.setMarketResultProvider(() => {
      const data = this.apiQueue.marketResult.get(slot.startTime);
      if (!data?.openPrice) return {};
      const assetPrice = this._ticker.price;
      const gap = assetPrice
        ? parseFloat((assetPrice - data.openPrice).toFixed(2))
        : undefined;
      return { openPrice: data.openPrice, gap, priceToBeat: data.openPrice };
    });
    this._marketLogger.startSlot(
      this.slug,
      this._clock.nowMs(),
      this.slotEndMs,
      this._strategyName,
    );

    const ctx: StrategyContext = {
      slug: this.slug,
      slotStartMs: this.slotStartMs,
      slotEndMs: this.slotEndMs,
      clobTokenIds: this._clobTokenIds,
      orderBook: this._orderBook,
      log: this._log,
      getOrderById: this.client.getOrderById.bind(this.client),
      postOrders: this._postOrders.bind(this),
      cancelOrders: this._cancelOrders.bind(this),
      emergencySells: this._emergencySells.bind(this),
      blockBuys: () => {
        this._buyBlocked = true;
      },
      blockSells: () => {
        this._sellBlocked = true;
      },
      pendingOrders: this._pendingOrders,
      orderHistory: this._orderHistory,
      hold: () => {
        this._strategyLocks++;
        let released = false;
        return () => {
          if (!released) {
            released = true;
            this._strategyLocks--;
          }
        };
      },
      ticker: this._ticker,
      getMarketResult: () => {
        const slot = slotFromSlug(this.slug);
        return this.apiQueue.marketResult.get(slot.startTime);
      },
      resolution: this._resolution,
      venue: this._venue,
      predictive: {
        binance: this._binance,
        coinbase: this._coinbase,
        aggregate: this._aggregator,
        leadLag: this._leadLag,
      },
      clock: this._clock,
    };

    const cleanup = await this._strategy(ctx);
    if (cleanup) this._strategyCleanup = cleanup;
    this._setState("RUNNING");
  }

  private _checkRequiredFeedsReadiness(): { ready: true; reasons: [] } | { ready: false; reasons: string[] } {
    const reasons = this._requiredFeedReadinessReasons(this._clock.nowMs());
    if (reasons.length === 0) return { ready: true, reasons: [] };
    return { ready: false, reasons };
  }

  /**
   * Generic tick for RUNNING: check pending order expiries and fire callbacks.
   * Fills arrive asynchronously via the user channel's onFilled callback.
   * Transitions to STOPPING when the slot ends or all orders drain.
   */
  private async _handleRunning(): Promise<void> {
    if (this._clock.nowMs() >= this.slotEndMs) {
      this._setState("STOPPING");
      this._log(
        `[${this.slug}] Market closed â€” transitioning to STOPPING`,
        "yellow",
      );
      return;
    }

    await this._checkExpiries();

    // If no pending orders remain, no placements in flight, no strategy holds,
    // and no unfilled positions that a stop-loss may still sell, we're done
    if (
      this._pendingOrders.length === 0 &&
      this._inFlight === 0 &&
      this._strategyLocks === 0 &&
      !this._hasUnfilledPositions()
    ) {
      this._setState("STOPPING");
    }
  }

  /**
   * STOPPING: cancel pending buys, drain sells, emergency sell on timeout.
   */
  private async _handleStopping(): Promise<void> {
    this._strategyCleanup?.();
    this._strategyCleanup = null;

    // Cancel any remaining buys (in case shutdown was called externally)
    await this._cancelPendingBuys();

    const pendingSells = this._pendingOrders.filter((o) => o.action === "sell");

    const remaining = this.remainingSecs;

    if (remaining <= 0) {
      // Slot expired â€” cancel whatever is left
      if (pendingSells.length > 0) {
        this._log(
          `[${this.slug}] Slot expired with ${pendingSells.length} unfilled SELL order(s) â€” cancelling`,
          "yellow",
        );
        const response = await this._cancelOrders(
          pendingSells.map((o) => o.orderId),
        );
        // Force-remove any not_canceled (slot is over, nothing we can do)
        for (const id of Object.keys(response.not_canceled)) {
          this._removePendingOrder(id);
        }
      }
      await this._waitForResolution();
      this._computePnl();
      await this._autoRedeem();
      this._setState("DONE");
      return;
    }

    // Check expiries for remaining sells
    await this._checkExpiries();

    if (this._pendingOrders.length === 0 && this._inFlight === 0) {
      if (this._hasUnfilledPositions()) {
        await this._waitForResolution();
        this._computePnl();
        await this._autoRedeem();
      } else {
        this._computePnl();
      }
      this._setState("DONE");
    }
  }

  /**
   * Cancel any orders that have passed their expireAtMs.
   * Fills arrive via user channel callbacks â€” this only handles expiry.
   */
  private async _checkExpiries(): Promise<void> {
    const now = this._clock.nowMs();
    for (const pending of this._pendingOrders) {
      if (now < pending.expireAtMs) continue;
      // Defer expiry for orders that have MATCHED but are awaiting MINED.
      // Cancelling here would race against the in-flight settlement â€” the
      // trade would be dropped and onFilled never fires.
      if (this._userChannel.isMatched(pending.orderId)) continue;
      // Read partial fill from channel BEFORE cancel (order still tracked here).
      const partialShares = this._userChannel.getMatchedSoFar(pending.orderId);
      // _cancelOrders untracks from channel BEFORE the API call (race-safe).
      await this._cancelOrders([pending.orderId], "expired");
      if (partialShares > 0) {
        this._commitFill(pending, partialShares, 0, "partial_filled");
      } else if (pending.onExpired) {
        this._marketLogger.log(this._createOrderEntry(pending, "expired"));
        void pending.onExpired();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy-facing order APIs
  // ---------------------------------------------------------------------------

  /**
   * Fire-and-forget order placement. Returns immediately â€” do NOT await the
   * result to know if an order was placed. Use `onFilled` to react to a fill
   * and `onExpired` to react to a cancellation or failed placement.
   * Buys retry up to BUY_MAX_RETRIES times on balance errors; sells retry until slot end.
   */
  private _postOrders(requests: OrderRequest[]): void {
    const buys = requests.filter(
      (o) => o.req.action === "buy" && !this._buyBlocked,
    );
    const sells = requests.filter(
      (o) => o.req.action === "sell" && !this._sellBlocked,
    );

    const maxRetries = parseInt(process.env.BUY_MAX_RETRIES ?? "30", 10);
    const retryDelayMs = parseInt(process.env.BUY_RETRY_DELAY_MS ?? "500", 10);

    if (buys.length > 0) this._placeWithRetry(buys, retryDelayMs, maxRetries);
    if (sells.length > 0) this._placeWithRetry(sells, 500, Infinity);
  }

  private async _cancelOrders(
    orderIds: string[],
    status: "canceled" | "expired" = "canceled",
  ): Promise<CancelOrderResponse> {
    // Skip orders that have MATCHED but are awaiting MINED â€” cancelling them
    // would unlock the wallet here while the pending settlement still fires
    // onFilled later, double-counting the tracker.
    const cancellable = orderIds.filter(
      (id) => !this._userChannel.isMatched(id),
    );
    // untrack order to avoid "CANCELLATION" event in processOrderEvent
    for (const id of cancellable) this._userChannel.untrackOrder(id);

    const response = await this.client.cancelOrders(cancellable);
    for (const id of response.canceled) {
      const pending = this._pendingOrders.find((o) => o.orderId === id);
      if (pending) {
        this._trackerUnlock(pending);
        this._marketLogger.log(this._createOrderEntry(pending, status));
        this._emitOrderLifecycle(pending, status, {
          orderId: id,
          intentId: pending.intentId,
        });
      }
      this._removePendingOrder(id);
    }
    return response;
  }

  private async _emergencySells(orderIds: string[]): Promise<void> {
    const sells = orderIds
      .map((id) =>
        this._pendingOrders.find(
          (o) => o.orderId === id && o.action === "sell",
        ),
      )
      .filter((o): o is PendingOrder => !!o);

    if (sells.length === 0) return;

    // Cancel all in batch
    const response = await this._cancelOrders(sells.map((o) => o.orderId));
    const canceledSells = sells.filter((s) =>
      response.canceled.includes(s.orderId),
    );

    if (canceledSells.length === 0) return;

    await Promise.all(
      canceledSells.map((sell) => this._emergencySellLoop(sell)),
    );
  }

  /**
   * Places a GTC sell at the current best bid and retries on rejection until
   * the order fills or the slot ends. Each retry reads a fresh best bid so the
   * price tracks the market.
   */
  private async _emergencySellLoop(sell: PendingOrder): Promise<void> {
    this._inFlight++;
    return (async () => {
      while (this._clock.nowMs() < this.slotEndMs) {
        const side = sell.tokenId === this._clobTokenIds![0] ? "UP" : "DOWN";
        const bestBid =
          this._orderBook.bestBidPrice(side as "UP" | "DOWN") ?? sell.price;

        let filled = false;
        let failed = false;

        await new Promise<void>((resolve) => {
          this._placeWithRetry([
            {
              req: {
                tokenId: sell.tokenId,
                action: "sell" as const,
                price: bestBid,
                shares: sell.shares,
                orderType: "GTC" as const,
              },
              expireAtMs: this._clock.nowMs() + 2000,
              onFilled: (_filledShares) => {
                filled = true;
                resolve();
              },
              onFailed: (reason) => {
                if (!reason.includes("not enough balance")) failed = true;
                resolve();
              },
              onExpired: () => {
                // GTC expired after 2s â€” retry with fresh bid
                failed = true;
                resolve();
              },
            },
          ]);
        });

        if (filled) break;

        // If blocked by risk gate synchronously, we must yield the event loop
        // to prevent an infinite microtask spin before we hit the delay below
        if (failed) {
          await new Promise<void>((resolve) => this._clock.setTimeout(resolve, 500));
        }

        if (!failed) break; // unexpected stop (e.g. sell blocked but no failure callback)

        const remainingMs = this.slotEndMs - this._clock.nowMs();
        if (remainingMs <= 0) break;
        await new Promise<void>((resolve) =>
          this._clock.setTimeout(
            () => resolve(),
            Math.min(EMERGENCY_SELL_RETRY_DELAY_MS, Math.max(1, remainingMs)),
          ),
        );
      }
    })()
      .catch((e) =>
        this._log(`[${this.slug}] _emergencySellLoop error: ${e}`, "red"),
      )
      .finally(() => {
        this._inFlight--;
      });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Commit a fill: update tracker, record in history, remove from pending, log, fire callback.
   */
  private _commitFill(
    pending: PendingOrder,
    shares: number,
    fee: number,
    status: "filled" | "partial_filled" = "filled",
  ): void {
    if (pending.action === "buy") {
      this._tracker.onBuyFilled(
        pending.orderId,
        pending.tokenId,
        pending.price,
        shares,
      );
    } else {
      this._tracker.onSellFilled(
        pending.orderId,
        pending.tokenId,
        pending.price,
        shares,
      );
    }
    this._orderHistory.push({
      action: pending.action,
      price: pending.price,
      shares,
      fee,
      tokenId: pending.tokenId,
    });
    this._removePendingOrder(pending.orderId);
    this._marketLogger.log(
      this._createOrderEntry(pending, "filled", { shares }),
    );
    
    this._emitOrderLifecycle(pending, status, {
      orderId: pending.orderId,
      intentId: pending.intentId,
      shares,
    });

    if (pending.onFilled) pending.onFilled(shares);
  }

  /**
   * Fire-and-forget: places orders and retries any that fail with a balance
   * error (350 ms apart) until the slot ends or all orders are placed.
   */
  private _placeWithRetry(
    items: Array<OrderRequest>,
    retryDelayMs = 350,
    maxRetries = Infinity,
  ): void {
    this._inFlight++;
    (async () => {
      let remaining = [...items];
      let retryCount = 0;
      while (remaining.length > 0) {
        const intents = new Map<OrderRequest, StrategyIntent>();
        // Stop retrying if the relevant block flag was set after this loop started
        const beforeBlock = remaining.length;
        remaining = remaining.filter((item) => {
          if (item.req.action === "buy" && this._buyBlocked) return false;
          if (item.req.action === "sell" && this._sellBlocked) return false;
          return true;
        });
        if (remaining.length === 0) {
          // log if blocked, take 0 item assuming all item kinds are same from postOrder
          if (beforeBlock > 0) {
            const kind = items[0]!.req.action === "buy" ? "buy" : "sell";
            this._log(
              `[${this.slug}] Retry stopped: ${kind} is blocked`,
              "yellow",
            );
          }
          break;
        }

        // Pre-flight: drop orders past their expiry
        remaining = remaining.filter((item) => {
          if (this._clock.nowMs() >= item.expireAtMs) {
            this._emitOrderLifecycle(item.req, "expired", {
              error: "order expired before placement",
            });
            if (item.onFailed) item.onFailed("order expired before placement");
            return false;
          }
          return true;
        });
        if (remaining.length === 0) break;

        remaining = remaining.filter((item) => {
          const intent = this._createOrderIntent(item);
          intents.set(item, intent);

          this._telemetry.push({
            ts: this._clock.nowMs(),
            type: "ORDER_INTENT",
            payload: {
              slug: this.slug,
              intent,
            },
          });

          const decision = this._riskGate.evaluate(intent, this._createRiskSnapshot());
          
          this._telemetry.push({
            ts: this._clock.nowMs(),
            type: "RISK_DECISION",
            payload: {
                slug: this.slug,
                approved: decision.approved,
                reasons: decision.reasons,
                intent
            }
          });

          if (decision.approved) return true;

          const reason = decision.reasons.join("; ");
          const side = this._side(item.req.tokenId);
          this._log(
            `[${this.slug}] Risk gate blocked ${item.req.action.toUpperCase()} ${side} @ ${item.req.price}: ${reason}`,
            "yellow",
          );
          this._marketLogger.log(
            this._createOrderEntry(item.req, "failed", { reason }),
          );
          item.onFailed?.(reason);
          return false;
        });
        if (remaining.length === 0) break;

        // Pre-flight: skip network call for orders the tracker knows will fail
        const retryNext: typeof remaining = [];
        remaining = remaining.filter((item) => {
          const ok =
            item.req.action === "buy"
              ? this._tracker.canPlaceBuy(item.req.price, item.req.shares)
              : this._tracker.canPlaceSell(item.req.tokenId, item.req.shares);
          if (!ok) retryNext.push(item);
          return ok;
        });
        if (remaining.length === 0) {
          if (retryCount === 0) {
            // log if balance too low, take 0 item assuming all item kinds are same from postOrder
            const kind = retryNext[0]!.req.action === "buy" ? "buy" : "sell";
            this._log(
              `[${this.slug}] Retry stopped: wallet balance too low to place ${kind}`,
              "yellow",
            );
          }
          remaining = retryNext;
          retryCount++;
          if (retryCount >= maxRetries) {
            for (const item of remaining) {
              if (item.onFailed) item.onFailed("not enough balance");
            }
            break;
          }
          await new Promise<void>((resolve) =>
            this._clock.setTimeout(() => resolve(), retryDelayMs),
          );
          continue;
        }

        const placed = await this.client.postMultipleOrders(
          remaining.map((r) => ({
            ...r.req,
            tickSize: this._orderBook.getTickSize(r.req.tokenId),
            feeRateBps: this._orderBook.getFeeRate(r.req.tokenId),
            negRisk: false,
          })),
        );

        for (let i = 0; i < placed.length; i++) {
          const p = placed[i];
          const item = remaining[i]!;
          if (!p || !p.orderId) {
            if (
              p?.errorMsg?.includes("not enough balance") &&
              this._clock.nowMs() < this.slotEndMs &&
              retryCount < maxRetries
            ) {
              // Parse actual balance from CLOB error and adjust shares
              const balMatch = p.errorMsg.match(
                /balance:\s*(\d+).*?order amount:\s*(\d+)/,
              );
              if (balMatch) {
                const actualBalance = parseInt(balMatch[1]!, 10);
                const orderAmount = parseInt(balMatch[2]!, 10);
                if (actualBalance > 0 && actualBalance < orderAmount) {
                  item.req.shares = actualBalance / 1e6;
                }
              }
              retryNext.push(item);
            } else {
              const reason = p?.errorMsg ?? "unknown";
              const intent = intents.get(item);
              const side =
                item.req.tokenId === this._clobTokenIds?.[0] ? "UP" : "DOWN";
              this._log(
                `[${this.slug}] Order placement failed (${item.req.action.toUpperCase()} ${side} @ ${item.req.price}): ${reason}`,
                "red",
              );
              this._emitOrderLifecycle(item.req, "failed", {
                intentId: intent?.id,
                error: reason,
              });
              if (item.onFailed) item.onFailed(reason);
            }
            continue;
          }
          this._trackerLock(item, p);
          this._pendingOrders.push({
            orderId: p.orderId,
            tokenId: item.req.tokenId,
            action: item.req.action,
            orderType: item.req.orderType,
            intentId: intents.get(item)?.id,
            price: item.req.price,
            shares: item.req.shares,
            expireAtMs: item.expireAtMs,
            placedAtMs: this._clock.nowMs(),
            onFilled: item.onFilled,
            onExpired: item.onExpired,
            onFailed: item.onFailed,
          });
          this._marketLogger.log(this._createOrderEntry(item.req, "placed"));
          
          this._emitOrderLifecycle(item.req, "placed", {
            orderId: p.orderId,
            intentId: intents.get(item)?.id,
          });

          // Wrap the OrderRequest with fill accounting and register with the user channel.
          // The channel calls wrapped.onFilled when the order is fully settled on-chain.
          const orderId = p.orderId;
          const wrapped: OrderRequest = {
            req: item.req,
            expireAtMs: item.expireAtMs,
            onFilled: (gross) => {
              const pending = this._pendingOrders.find(
                (o) => o.orderId === orderId,
              );
              if (!pending) return;
              let fee = 0;
              if (pending.orderType === "FOK" && this._feeRate > 0) {
                fee =
                  gross * this._feeRate * pending.price * (1 - pending.price);
              }
              const net =
                pending.action === "buy" && fee > 0
                  ? gross - fee / pending.price
                  : gross;
              this._commitFill(pending, net, fee);
            },
            onFailed: (reason) => {
              const pending = this._pendingOrders.find(
                (o) => o.orderId === orderId,
              );
              if (!pending) return;
              this._removePendingOrder(orderId);
              this._trackerUnlock(pending);
              this._marketLogger.log(
                this._createOrderEntry(pending, "failed", { reason }),
              );
              
              this._emitOrderLifecycle(pending, "failed", {
                orderId,
                intentId: pending.intentId,
                error: reason,
              });

              item.onFailed?.(reason);
            },
          };
          this._userChannel.trackOrder(orderId, wrapped);
        }

        if (retryNext.length === 0) break;
        remaining = retryNext;
        retryCount++;
        if (retryCount % 5 === 0) {
          const summary = retryNext
            .map((r) => {
              const side =
                r.req.tokenId === this._clobTokenIds?.[0] ? "UP" : "DOWN";
              return `${r.req.action.toUpperCase()} ${side} @ ${r.req.price} (shares: ${r.req.shares})`;
            })
            .join(", ");
          const errors = placed
            ?.filter((p) => p?.errorMsg)
            .map((p) => p!.errorMsg)
            .join("; ");
          this._log(
            `[${this.slug}] Balance not ready â€” retrying (attempt ${retryCount}): ${summary} | error: ${errors || "pre-flight rejected"}`,
            "yellow",
          );
        }
        await new Promise<void>((resolve) =>
          this._clock.setTimeout(() => resolve(), retryDelayMs),
        );
      }
    })()
      .catch((e) =>
        this._log(`[${this.slug}] _placeWithRetry error: ${e}`, "red"),
      )
      .finally(() => {
        this._inFlight--;
      });
  }

  private _removePendingOrder(orderId: string): void {
    const idx = this._pendingOrders.findIndex((o) => o.orderId === orderId);
    if (idx !== -1) this._pendingOrders.splice(idx, 1);
  }

  private async _cancelPendingBuys(): Promise<void> {
    const buys = this._pendingOrders.filter((o) => o.action === "buy");
    if (buys.length === 0) return;

    this._log(
      `[${this.slug}] Cancelling ${buys.length} pending BUY order(s)`,
      "yellow",
    );
    await this._cancelOrders(buys.map((o) => o.orderId));
  }

  private _side(tokenId: string): "UP" | "DOWN" {
    return tokenId === this._clobTokenIds?.[0] ? "UP" : "DOWN";
  }

  private _emitOrderLifecycle(
    order: {
      action: "buy" | "sell";
      tokenId: string;
      price: number;
      shares: number;
    },
    status:
      | "placed"
      | "filled"
      | "partial_filled"
      | "canceled"
      | "expired"
      | "failed",
    opts: {
      orderId?: string;
      intentId?: string;
      shares?: number;
      error?: string;
    } = {},
  ): void {
    this._telemetry.push({
      ts: this._clock.nowMs(),
      type: "ORDER_LIFECYCLE",
      payload: {
        slug: this.slug,
        orderId: opts.orderId,
        intentId: opts.intentId,
        status,
        side: this._side(order.tokenId),
        action: order.action,
        price: order.price,
        shares: opts.shares ?? order.shares,
        error: opts.error,
      },
    });
  }

  private _roundWindow(): RoundWindow {
    return {
      slug: this.slug,
      asset: Env.get("MARKET_ASSET"),
      window: Env.get("MARKET_WINDOW"),
      startTimeMs: this.slotStartMs,
      endTimeMs: this.slotEndMs,
    };
  }

  private _createOrderIntent(item: OrderRequest): StrategyIntent {
    const now = this._clock.nowMs();
    return {
      id: `${this.slug}-${item.req.action}-${now}-${crypto.randomUUID()}`,
      slug: this.slug,
      strategyName: this._strategyName,
      createdAtMs: now,
      reason: "strategy requested order placement",
      triggerEventIds: [],
      round: this._roundWindow(),
      action: item.req.action,
      side: this._side(item.req.tokenId),
      tokenId: item.req.tokenId,
      price: item.req.price,
      shares: item.req.shares,
      orderType: item.req.orderType,
      expireAtMs: item.expireAtMs,
    };
  }

  private _createRiskSnapshot(): RiskSnapshot {
    return {
      nowMs: this._clock.nowMs(),
      productionEnabled: Env.get("PROD"),
      resolution: this._resolution?.latest() ?? null,
      venue: this._venue.latest(),
      predictiveFeeds: [
        this._binance?.latest() ?? null,
        this._coinbase?.latest() ?? null,
      ].filter((event): event is NonNullable<typeof event> => event !== null),
      predictiveAggregate: this._aggregator?.latest() ?? null,
      leadLag: this._leadLag?.latest() ?? null,
      openExposureUsd: this._openExposureUsd(),
      sessionPnlUsd: this._pnl,
      clobTokenIds: this._clobTokenIds ?? undefined,
    };
  }
  private async _waitForRequiredFeeds(): Promise<
    | { ready: true; reasons: [] }
    | { ready: false; reasons: string[] }
  > {
    const timeoutMs = Math.max(0, this._feedReadinessTimeoutMs);
    const pollMs = Math.max(1, this._feedReadinessPollMs);
    const deadlineMs = this._clock.nowMs() + timeoutMs;

    while (true) {
      const reasons = this._requiredFeedReadinessReasons(this._clock.nowMs());
      if (reasons.length === 0) return { ready: true, reasons: [] };
      if (timeoutMs === 0 || this._clock.nowMs() >= deadlineMs) {
        return { ready: false, reasons };
      }

      await new Promise<void>((resolve) =>
        this._clock.setTimeout(
          () => resolve(),
          Math.min(pollMs, Math.max(1, deadlineMs - this._clock.nowMs())),
        ),
      );
    }
  }

  private _requiredFeedReadinessReasons(nowMs: number): string[] {
    const snapshot = this._createRiskSnapshot();
    const reasons: string[] = [];
    this._appendFeedReadinessReason(
      "resolution",
      snapshot.resolution,
      nowMs,
      reasons,
    );
    this._appendFeedReadinessReason("venue", snapshot.venue, nowMs, reasons);
    return reasons;
  }

  private _appendFeedReadinessReason(
    label: "resolution" | "venue",
    event: BotFeedEvent | null,
    nowMs: number,
    reasons: string[],
  ): void {
    if (!event) {
      reasons.push(`${label} feed is missing`);
      return;
    }
    if (event.quality === "stale" || event.quality === "missing") {
      reasons.push(`${label} feed quality is ${event.quality}`);
    }
    const maxFreshnessMs =
      DEFAULT_SIMULATION_RISK_LIMITS.maxFeedFreshnessMs;
    if (event.freshnessMs !== null && event.freshnessMs > maxFreshnessMs) {
      reasons.push(`${label} feed is stale by freshness threshold`);
    }
    if (nowMs - event.clock.receivedAtMs > maxFreshnessMs) {
      reasons.push(`${label} feed is stale by received age threshold`);
    }
  }

  private _openExposureUsd(): number {
    const pendingBuyExposure = this._pendingOrders
      .filter((o) => o.action === "buy")
      .reduce((sum, o) => sum + o.price * o.shares, 0);

    const positions = new Map<
      string,
      { boughtShares: number; boughtCost: number; soldShares: number }
    >();

    for (const order of this._orderHistory) {
      const current = positions.get(order.tokenId) ?? {
        boughtShares: 0,
        boughtCost: 0,
        soldShares: 0,
      };
      if (order.action === "buy") {
        current.boughtShares += order.shares;
        current.boughtCost += order.price * order.shares;
      } else {
        current.soldShares += order.shares;
      }
      positions.set(order.tokenId, current);
    }

    let heldExposure = 0;
    for (const position of positions.values()) {
      if (position.boughtShares <= 0) continue;
      const heldShares = Math.max(
        0,
        position.boughtShares - position.soldShares,
      );
      const averageEntryPrice =
        position.boughtCost / position.boughtShares;
      heldExposure += heldShares * averageEntryPrice;
    }

    return pendingBuyExposure + heldExposure;
  }

  private _createOrderEntry(
    order: {
      action: "buy" | "sell";
      tokenId: string;
      price: number;
      shares: number;
    },
    status: "placed" | "filled" | "failed" | "expired" | "canceled",
    opts?: { shares?: number; reason?: string },
  ) {
    return {
      type: "order" as const,
      action: order.action,
      side: this._side(order.tokenId),
      price: order.price,
      shares: opts?.shares ?? order.shares,
      status,
      reason: opts?.reason,
    };
  }

  /** Lock tracker reservation for a pending order (buy or sell). */
  private _trackerLock(req: OrderRequest, order: PlacedOrder): void {
    const side = this._side(req.req.tokenId);
    const label = `[${this.slug}] ${req.req.action.toUpperCase()} ${side} @ ${req.req.price}`;
    if (req.req.action === "buy") {
      this._tracker.lockForBuy(
        order.orderId,
        req.req.price,
        req.req.shares,
        label,
      );
    } else {
      this._tracker.lockForSell(
        order.orderId,
        req.req.tokenId,
        req.req.shares,
        label,
      );
    }
  }

  /** Unlock tracker reservation for a pending order (buy or sell). */
  private _trackerUnlock(pending: PendingOrder): void {
    const side = this._side(pending.tokenId);
    const label = `[${this.slug}] ${pending.action.toUpperCase()} ${side} @ ${pending.price}`;
    if (pending.action === "buy")
      this._tracker.unlockBuy(pending.orderId, label);
    else this._tracker.unlockSell(pending.orderId, label);
  }

  private _hasUnfilledPositions(): boolean {
    const held = new Map<string, number>();
    for (const o of this._orderHistory) {
      const cur = held.get(o.tokenId) ?? 0;
      if (o.action === "buy") held.set(o.tokenId, cur + o.shares);
      else held.set(o.tokenId, cur - o.shares);
    }
    for (const shares of held.values()) {
      if (shares > 0) return true;
    }
    return false;
  }

  private async _autoRedeem(): Promise<void> {
    if (!this._conditionId) return; // belt-and-suspenders

    this._log(`[${this.slug}] Redeeming positions...`, "dim");
    try {
      await this.client.redeemPositions(this._conditionId, true);
      this._log(`[${this.slug}] Redemption successful`, "green");
    } catch (e) {
      this._log(`[${this.slug}] Redemption failed: ${e}`, "red");
    }
  }

  private async _waitForResolution(): Promise<void> {
    const slot = slotFromSlug(this.slug).startTime;
    if (!this._marketPriceHandle) {
      this._marketPriceHandle = this.apiQueue.queueMarketPrice(slotFromSlug(this.slug));
    }

    const timeoutMs = 15000; // 15s timeout
    const startMs = this._clock.nowMs();

    while (true) {
      const data = this.apiQueue.marketResult.get(slot);
      if (data?.closePrice) return;

      if (this._clock.nowMs() - startMs > timeoutMs) {
        this._log(`[${this.slug}] Timed out waiting for resolution after ${timeoutMs}ms.`, "yellow");
        return;
      }

      await new Promise<void>((resolve) =>
        this._clock.setTimeout(() => resolve(), 1000),
      );
    }
  }

  private _computePnl(): void {
    let pnl = 0;
    const held = new Map<string, number>();

    for (const o of this._orderHistory) {
      if (o.action === "sell") pnl += o.price * o.shares;
      else pnl -= o.price * o.shares;
      pnl -= o.fee ?? 0;

      const cur = held.get(o.tokenId) ?? 0;
      if (o.action === "buy") held.set(o.tokenId, cur + o.shares);
      else held.set(o.tokenId, cur - o.shares);
    }

    const slot = slotFromSlug(this.slug).startTime;
    const data = this.apiQueue.marketResult.get(slot);

    if (data?.closePrice) {
      const resolvedUp = data.closePrice > data.openPrice;
      const upToken = this._clobTokenIds![0];
      let unfilledShares = 0;
      let payout = 0;

      for (const [tokenId, shares] of held) {
        if (shares <= 0) continue;
        unfilledShares += shares;
        const isUp = tokenId === upToken;
        const payoutPerShare =
          (resolvedUp && isUp) || (!resolvedUp && !isUp) ? 1.0 : 0.0;
        payout += shares * payoutPerShare;
      }
      pnl += payout;

      this._tracker.onResolution(held, payout);
      this._pnl = parseFloat(pnl.toFixed(4));
      this._log(
        `[${this.slug}] Resolved ${resolvedUp ? "UP" : "DOWN"}. PnL: ${this._pnl >= 0 ? "+" : ""}$${this._pnl.toFixed(2)}`,
        this._pnl >= 0 ? "green" : "red",
      );
      this._marketLogger.log({
        type: "resolution",
        direction: resolvedUp ? "UP" : "DOWN",
        openPrice: data.openPrice,
        closePrice: data.closePrice,
        unfilledShares,
        payout,
        pnl: this._pnl,
      });
      this._telemetry.push({
        ts: this._clock.nowMs(),
        type: "ROUND_RESOLUTION",
        payload: {
          slug: this.slug,
          openPrice: data.openPrice,
          closePrice: data.closePrice,
          direction: resolvedUp ? "UP" : "DOWN",
        },
      });
    } else {
      this._pnl = parseFloat(pnl.toFixed(4));
      this._log(
        `[${this.slug}] Settled. PnL: ${this._pnl >= 0 ? "+" : ""}$${this._pnl.toFixed(2)}`,
        this._pnl >= 0 ? "green" : "red",
      );
    }
    
    this._telemetry.push({
      ts: this._clock.nowMs(),
      type: "ROUND_PNL",
      payload: { slug: this.slug, pnl: this._pnl }
    });
  }
}
