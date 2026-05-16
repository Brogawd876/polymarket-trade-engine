import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../index';

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
        store.processEvent({
            ts: 1000,
            type: 'MARKET_TICK',
            payload: { slug: 'BTC-5M', asset: { slug: 'BTC', description: 'Bitcoin' }, price: 65000, bid: 64990, ask: 65010 }
        });

        let updated = useStore.getState();
        expect(updated.markets['BTC-5M'].price).toBe(65000);
        expect(updated.priceHistory['BTC-5M']).toHaveLength(1);
        expect(updated.priceHistory['BTC-5M'][0]).toEqual({ time: 1, value: 65000 });

        // Add tick in same second (duplicate timestamp should replace or skip)
        store.processEvent({
            ts: 1500,
            type: 'MARKET_TICK',
            payload: { slug: 'BTC-5M', asset: { slug: 'BTC', description: 'Bitcoin' }, price: 65005, bid: 64995, ask: 65015 }
        });

        updated = useStore.getState();
        expect(updated.priceHistory['BTC-5M']).toHaveLength(1);
        expect(updated.priceHistory['BTC-5M'][0].value).toBe(65005);

        // Add tick in next second
        store.processEvent({
            ts: 2000,
            type: 'MARKET_TICK',
            payload: { slug: 'BTC-5M', asset: { slug: 'BTC', description: 'Bitcoin' }, price: 65010, bid: null, ask: null }
        });

        updated = useStore.getState();
        expect(updated.priceHistory['BTC-5M']).toHaveLength(2);
    });
});
