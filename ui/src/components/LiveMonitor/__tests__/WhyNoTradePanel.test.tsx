/**
 * WhyNoTradePanel unit tests.
 *
 * Verifies:
 *   1. Renders empty-state message when no data is available
 *   2. Shows BLOCKED status and reasons from a RISK_DECISION event
 *   3. Shows feed disagreement and stale feed flags from PREDICTIVE_AGGREGATE
 *   4. Shows session block reason from operatorStatus.blockReason
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useStore } from '../../../store';
import { WhyNoTradePanel } from '../WhyNoTradePanel';

function renderPanel() {
    return render(<WhyNoTradePanel />);
}

const MOCK_RISK_DECISION_BLOCKED = {
    ts: Date.now(),
    slug: 'btc-1234-1235',
    approved: false,
    reasons: [
        'STALE_RESOLUTION_FEED: resolution price age 8500ms > 500ms',
        'DISAGREEMENT: predictive feeds disagree (divergence 0.05%)',
    ],
    intent: {
        id: 'intent-1',
        slug: 'btc-1234-1235',
        strategyName: 'late-entry',
        createdAtMs: Date.now(),
        reason: 'momentum crossover',
        triggerEventIds: [],
        round: {
            slug: 'btc-1234-1235',
            asset: 'btc' as const,
            window: '5m',
            startTimeMs: Date.now() - 120_000,
            endTimeMs: Date.now() + 180_000,
        },
        action: 'buy' as const,
        side: 'UP' as const,
        price: 0.52,
        shares: 10,
        orderType: 'FOK' as const,
    },
};

const MOCK_PREDICTIVE_AGGREGATE = {
    asset: 'btc' as const,
    timestampMs: Date.now(),
    price: 78135.5,
    feeds: {
        binance: { price: 78135.5, quality: 'live' as const, latestEventAgeMs: 200, arrivalDelayMs: 12 },
        coinbase: { price: 78099.0, quality: 'stale' as const, latestEventAgeMs: 8200, arrivalDelayMs: null },
    },
    divergenceAbs: 36.5,
    divergencePct: 0.047,
    disagreement: true,
};

describe('WhyNoTradePanel', () => {
    beforeEach(() => {
        useStore.setState({
            latestRiskDecisions: [],
            predictiveAggregate: null,
            leadLag: null,
            decisionSnapshots: [],
            operatorStatus: null,
        });
    });

    it('shows no-data empty state when nothing has been received', () => {
        renderPanel();
        expect(screen.getByText(/no trade decision data yet/i)).toBeInTheDocument();
    });

    it('shows BLOCKED badge and blockers when a blocked risk decision exists', () => {
        useStore.setState({
            latestRiskDecisions: [MOCK_RISK_DECISION_BLOCKED],
        });
        renderPanel();

        // Status badge
        expect(screen.getByText(/blocked/i)).toBeInTheDocument();
        // Both blockers
        expect(screen.getByText(/STALE_RESOLUTION_FEED/)).toBeInTheDocument();
        expect(screen.getByText(/DISAGREEMENT/)).toBeInTheDocument();
    });

    it('shows last intent action, side, price, shares', () => {
        useStore.setState({
            latestRiskDecisions: [MOCK_RISK_DECISION_BLOCKED],
        });
        renderPanel();

        expect(screen.getByText(/BUY/i)).toBeInTheDocument();
        expect(screen.getAllByText(/UP/i).length).toBeGreaterThan(0);
        // Price displayed as currency
        expect(screen.getByText(/0\.52/)).toBeInTheDocument();
    });

    it('shows feed disagreement and stale feed flag', () => {
        useStore.setState({
            predictiveAggregate: MOCK_PREDICTIVE_AGGREGATE,
        });
        renderPanel();

        // Disagreement section
        expect(screen.getByText(/YES/i)).toBeInTheDocument();
        // Stale feed "coinbase"
        expect(screen.getByText(/coinbase/i)).toBeInTheDocument();
        expect(screen.getAllByText(/stale/i).length).toBeGreaterThan(0);
    });

    it('shows "All feeds live" when no stale feeds', () => {
        useStore.setState({
            predictiveAggregate: {
                ...MOCK_PREDICTIVE_AGGREGATE,
                feeds: {
                    binance: { price: 78135.5, quality: 'live', latestEventAgeMs: 100, arrivalDelayMs: 10 },
                    coinbase: { price: 78130.0, quality: 'live', latestEventAgeMs: 150, arrivalDelayMs: 15 },
                },
                disagreement: false,
            },
        });
        renderPanel();

        expect(screen.getByText(/all feeds live/i)).toBeInTheDocument();
    });

    it('shows session block reason from operatorStatus.blockReason', () => {
        useStore.setState({
            operatorStatus: {
                backend: 'reachable',
                telemetry: 'disconnected',
                sessionState: 'idle',
                engineMode: 'idle',
                engineStatus: null,
                blockReason: 'Max session loss limit exceeded',
                activeReplayFile: null,
                activePreset: null,
            },
        });
        renderPanel();

        expect(screen.getByText(/session blocked/i)).toBeInTheDocument();
        expect(screen.getByText(/max session loss limit exceeded/i)).toBeInTheDocument();
    });
});
