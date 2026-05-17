import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';
import { TelemetryEvent } from '../../types/telemetry';

describe('Telemetry Store', () => {
    beforeEach(() => {
        useStore.setState({
            isConnected: false,
            systemStatus: null,
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
            roundResolutions: {},
            replayProgress: null,
            priceHistory: {},
        });
    });

    it('processes SYSTEM_BOOT event', () => {
        const store = useStore.getState();
        store.processEvent({
            ts: 1000,
            type: 'SYSTEM_BOOT',
            payload: { version: '1.0.0', mode: 'sim', strategy: 'test' }
        });

        const updated = useStore.getState();
        expect(updated.bootInfo).toEqual({ version: '1.0.0', mode: 'sim', strategy: 'test' });
        expect(updated.eventTimeline).toHaveLength(1);
    });

    it('processes MARKET_TICK and maintains price history', () => {
        const store = useStore.getState();
        // The asset is now correctly typed as BotAsset = "btc" | "eth" ...
        store.processEvent({
            ts: 1000,
            type: 'MARKET_TICK',
            payload: {
                slug: 'BTC-5M',
                asset: 'btc',
                price: 65000,
                bid: 0.52,
                ask: 0.53,
                slotStartMs: 1778977500000,
                slotEndMs: 1778977800000,
                priceToBeat: 64950,
                gap: 50,
                direction: 'UP',
                upBid: 0.52,
                upAsk: 0.53,
                downBid: 0.47,
                downAsk: 0.48
            }
        });

        let updated = useStore.getState();
        expect(updated.markets['BTC-5M'].price).toBe(65000);
        expect(updated.markets['BTC-5M'].priceToBeat).toBe(64950);
        expect(updated.markets['BTC-5M'].direction).toBe('UP');
        expect(updated.markets['BTC-5M'].upBid).toBe(0.52);
        expect(updated.markets['BTC-5M'].downAsk).toBe(0.48);
        expect(updated.priceHistory['BTC-5M']).toHaveLength(1);
        expect(updated.priceHistory['BTC-5M'][0]).toEqual({ time: 1, value: 65000 });

        // Add tick in same second (duplicate timestamp should replace or skip)
        store.processEvent({
            ts: 1500,
            type: 'MARKET_TICK',
            payload: { slug: 'BTC-5M', asset: 'btc', price: 65005, bid: 64995, ask: 65015 }
        });

        updated = useStore.getState();
        expect(updated.priceHistory['BTC-5M']).toHaveLength(1);
        expect(updated.priceHistory['BTC-5M'][0].value).toBe(65005);

        // Add tick in next second
        store.processEvent({
            ts: 2000,
            type: 'MARKET_TICK',
            payload: { slug: 'BTC-5M', asset: 'btc', price: 65010, bid: null, ask: null }
        });

        updated = useStore.getState();
        expect(updated.priceHistory['BTC-5M']).toHaveLength(2);
    });

    it('processes PREDICTIVE_AGGREGATE event with correct backend shape', () => {
        const store = useStore.getState();
        const event: TelemetryEvent = {
            ts: 12345,
            type: 'PREDICTIVE_AGGREGATE',
            payload: {
                asset: 'btc',
                timestampMs: 12345,
                price: 65000,
                feeds: {
                    'binance': { price: 65001, quality: 'live', latestEventAgeMs: 10, arrivalDelayMs: 5 }
                },
                divergenceAbs: 1.5,
                divergencePct: 0.0001,
                disagreement: false
            }
        };
        store.processEvent(event);
        const updated = useStore.getState();
        expect(updated.predictiveAggregate?.price).toBe(65000);
        expect(updated.predictiveAggregate?.divergencePct).toBe(0.0001);
    });

    it('processes LEAD_LAG_UPDATE event with correct backend shape', () => {
        const store = useStore.getState();
        const event: TelemetryEvent = {
            ts: 12345,
            type: 'LEAD_LAG_UPDATE',
            payload: {
                asset: 'btc',
                timestampMs: 12345,
                feeds: {
                    'binance': { feed: 'binance', sampleCount: 100, latestArrivalDelayMs: 5, trailingAverageArrivalDelayMs: 6 }
                },
                observedTimingLeader: 'binance',
                observedTimingRunnerUp: 'coinbase',
                averageDelaySpreadMs: 10,
                leadershipConfidence: 'strong',
                sufficientSamples: true
            }
        };
        store.processEvent(event);
        const updated = useStore.getState();
        expect(updated.leadLag?.observedTimingLeader).toBe('binance');
        expect(updated.leadLag?.leadershipConfidence).toBe('strong');
    });

    it('processes FEED_STATUS event with string union quality', () => {
        const store = useStore.getState();
        const event: TelemetryEvent = {
            ts: 12345,
            type: 'FEED_STATUS',
            payload: {
                feed: 'binance',
                status: 'connected',
                quality: 'live'
            }
        };
        store.processEvent(event);
        const updated = useStore.getState();
        expect(updated.feeds['binance'].quality).toBe('live');
    });

    it('processes ROUND_RESOLUTION event', () => {
        const store = useStore.getState();
        store.processEvent({
            ts: 3000,
            type: 'ROUND_RESOLUTION',
            payload: {
                slug: 'btc-updown-5m-1778978400',
                openPrice: 78166.35,
                closePrice: 78170.42,
                direction: 'UP'
            }
        });

        const updated = useStore.getState();
        expect(updated.roundResolutions['btc-updown-5m-1778978400']).toEqual({
            openPrice: 78166.35,
            closePrice: 78170.42,
            direction: 'UP'
        });
    });
});

