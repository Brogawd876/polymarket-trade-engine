export type BotAsset = "btc" | "eth" | "xrp" | "sol" | "doge";

export type FeedQuality = "live" | "delayed" | "stale" | "missing";

export interface PredictiveAggregateSnapshot {
  asset: BotAsset;
  timestampMs: number;
  /** Combined/average reference price from all healthy feeds. */
  price: number | null;
  /** Feeds included in this aggregate. */
  feeds: Record<string, {
    price: number;
    quality: FeedQuality;
    /** Time since the latest event was locally received (ms). */
    latestEventAgeMs: number;
    /** Observed source-to-receive delay (ms), where available. */
    arrivalDelayMs: number | null;
  }>;
  /** Absolute difference between highest and lowest feed prices. */
  divergenceAbs: number | null;
  /** Percentage difference (relative to average). */
  divergencePct: number | null;
  /** True if divergence exceeds threshold or NO healthy feeds remain. */
  disagreement: boolean;
}

export type FeedTimingStats = {
  feed: string;
  sampleCount: number;
  latestArrivalDelayMs: number | null;
  trailingAverageArrivalDelayMs: number | null;
};

export interface LeadLagSnapshot {
  asset: BotAsset;
  timestampMs: number;
  feeds: Record<string, FeedTimingStats>;
  /** The feed with the lowest trailing average arrival delay. */
  observedTimingLeader: string | null;
  /** The feed with the second lowest trailing average arrival delay. */
  observedTimingRunnerUp: string | null;
  /** Difference in trailing average delays between leader and runner-up (ms). */
  averageDelaySpreadMs: number | null;
  /** Qualitative measure of how consistently one feed is arriving before the other. */
  leadershipConfidence: "none" | "weak" | "moderate" | "strong";
  /** True if we have enough samples for all configured feeds to make a determination. */
  sufficientSamples: boolean;
}

export type TelemetryEvent = {
    ts: number;
} & (
    | { type: "SYSTEM_BOOT"; payload: { version: string; mode: "live" | "sim" | "replay"; strategy: string } }
    | { type: "FEED_STATUS"; payload: { feed: string; status: "connected" | "stale" | "error" | "forbidden"; quality: FeedQuality; message?: string } }
    | { type: "LIFECYCLE_STATE"; payload: { slug: string; from: string; to: string } }
    | { type: "MARKET_TICK"; payload: { slug: string; asset: BotAsset; price: number; bid: number | null; ask: number | null } }
    | { type: "PREDICTIVE_AGGREGATE"; payload: PredictiveAggregateSnapshot }
    | { type: "LEAD_LAG_UPDATE"; payload: LeadLagSnapshot }
    | { type: "RISK_DECISION"; payload: { slug: string; approved: boolean; reasons: string[]; intent: any } }
    | { type: "ORDER_LIFECYCLE"; payload: { slug: string; orderId: string; status: "placed" | "filled" | "canceled" | "expired" | "failed"; side: "UP" | "DOWN"; action: "buy" | "sell"; price: number; shares: number; error?: string } }
    | { type: "ROUND_PNL"; payload: { slug: string; pnl: number } }
    | { type: "SESSION_PNL"; payload: { pnl: number; loss: number } }
    | { type: "REPLAY_PROGRESS"; payload: { totalEvents: number; processedEvents: number; isDone: boolean; virtualTimeMs: number } }
);

export type EngineStatus = {
  mode: "live" | "sim" | "replay";
  strategy: string;
  activeLifecycles: number;
  isShuttingDown: boolean;
  sessionPnl: number;
  sessionLoss: number;
  summary: string;
};

// Map backend API status to SystemStatus alias
export type SystemStatus = EngineStatus;
