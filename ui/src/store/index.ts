import { create } from 'zustand';
import { TelemetryEvent, SystemStatus, FeedQuality, PredictiveAggregateSnapshot, LeadLagSnapshot } from '../types/telemetry';

interface FeedState {
    status: "connected" | "stale" | "error" | "forbidden";
    quality: FeedQuality;
    message?: string;
    lastUpdated: number;
}

interface MarketState {
    price: number;
    bid: number | null;
    ask: number | null;
    slotStartMs?: number;
    slotEndMs?: number;
    priceToBeat?: number | null;
    gap?: number | null;
    direction?: "UP" | "DOWN" | "TIE" | null;
    upBid?: number | null;
    upAsk?: number | null;
    downBid?: number | null;
    downAsk?: number | null;
    lastUpdated: number;
}

interface RiskDecision {
    ts: number;
    slug: string;
    approved: boolean;
    reasons: string[];
    intent: any;
}

interface ChartDataPoint {
    time: number; // Unix timestamp in seconds
    value: number;
}

export interface AppState {
    // Connection State
    isConnected: boolean;
    setConnected: (status: boolean) => void;

    // Backend System Status (from REST /api/status)
    systemStatus: SystemStatus | null;
    setSystemStatus: (status: SystemStatus) => void;

    // Latest Telemetry State
    bootInfo: { version: string; mode: string; strategy: string } | null;
    feeds: Record<string, FeedState>;
    markets: Record<string, MarketState>;
    lifecycleStates: Record<string, string>;
    predictiveAggregate: PredictiveAggregateSnapshot | null;
    leadLag: LeadLagSnapshot | null;
    latestRiskDecisions: RiskDecision[];
    eventTimeline: TelemetryEvent[];
    sessionPnl: { pnl: number; loss: number } | null;
    roundPnl: Record<string, number>;
    replayProgress: { totalEvents: number; processedEvents: number; isDone: boolean; virtualTimeMs: number } | null;
    
    // Chart Series (derived from events)
    priceHistory: Record<string, ChartDataPoint[]>;

    // Actions
    processEvent: (event: TelemetryEvent) => void;
    clearEvents: () => void;
}

const MAX_TIMELINE_EVENTS = 100;
const MAX_CHART_POINTS = 1000;

export const useStore = create<AppState>((set) => ({
    isConnected: false,
    setConnected: (isConnected) => set({ isConnected }),

    systemStatus: null,
    setSystemStatus: (status) => set({ systemStatus: status }),

    bootInfo: null,
    feeds: {},
    markets: {},
    lifecycleStates: {},
    predictiveAggregate: null,
    leadLag: null,
    latestRiskDecisions: [],
    eventTimeline: [],
    sessionPnl: null,
    roundPnl: {},
    replayProgress: null,
    priceHistory: {},

    clearEvents: () => set({ eventTimeline: [], priceHistory: {} }),

    processEvent: (event) => set((state) => {
        const nextState = { ...state };
        
        // Add to timeline
        nextState.eventTimeline = [event, ...state.eventTimeline].slice(0, MAX_TIMELINE_EVENTS);

        switch (event.type) {
            case "SYSTEM_BOOT":
                nextState.bootInfo = event.payload;
                break;
            case "FEED_STATUS":
                nextState.feeds = {
                    ...state.feeds,
                    [event.payload.feed]: {
                        status: event.payload.status,
                        quality: event.payload.quality,
                        message: event.payload.message,
                        lastUpdated: event.ts
                    }
                };
                break;
            case "LIFECYCLE_STATE":
                nextState.lifecycleStates = {
                    ...state.lifecycleStates,
                    [event.payload.slug]: event.payload.to
                };
                break;
            case "MARKET_TICK": {
                const {
                    slug,
                    price,
                    bid,
                    ask,
                    slotStartMs,
                    slotEndMs,
                    priceToBeat,
                    gap,
                    direction,
                    upBid,
                    upAsk,
                    downBid,
                    downAsk
                } = event.payload;
                nextState.markets = {
                    ...state.markets,
                    [slug]: {
                        price,
                        bid,
                        ask,
                        slotStartMs,
                        slotEndMs,
                        priceToBeat,
                        gap,
                        direction,
                        upBid,
                        upAsk,
                        downBid,
                        downAsk,
                        lastUpdated: event.ts
                    }
                };
                // Update chart history
                const currentHistory = state.priceHistory[slug] || [];
                const newPoint = { time: Math.floor(event.ts / 1000), value: price };
                // avoid duplicate timestamps by replacing the last one if it matches
                const lastPoint = currentHistory[currentHistory.length - 1];
                let newHistory;
                if (lastPoint && lastPoint.time === newPoint.time) {
                    newHistory = [...currentHistory.slice(0, -1), newPoint];
                } else {
                    newHistory = [...currentHistory, newPoint].slice(-MAX_CHART_POINTS);
                }
                nextState.priceHistory = {
                    ...state.priceHistory,
                    [slug]: newHistory
                };
                break;
            }
            case "PREDICTIVE_AGGREGATE":
                nextState.predictiveAggregate = event.payload;
                break;
            case "LEAD_LAG_UPDATE":
                nextState.leadLag = event.payload;
                break;
            case "RISK_DECISION":
                nextState.latestRiskDecisions = [
                    { ts: event.ts, ...event.payload },
                    ...state.latestRiskDecisions
                ].slice(0, 10);
                break;
            case "ROUND_PNL":
                nextState.roundPnl = {
                    ...state.roundPnl,
                    [event.payload.slug]: event.payload.pnl
                };
                break;
            case "SESSION_PNL":
                nextState.sessionPnl = event.payload;
                break;
            case "REPLAY_PROGRESS":
                nextState.replayProgress = event.payload;
                break;
        }

        return nextState;
    })
}));
