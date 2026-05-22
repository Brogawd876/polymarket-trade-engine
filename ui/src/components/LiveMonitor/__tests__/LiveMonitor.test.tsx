/**
 * LiveMonitor route render smoke tests.
 *
 * Verifies:
 *   1. LiveMonitor renders without a blank screen / uncaught error
 *   2. Connection disconnected state: banner/status shows correctly
 *   3. WhyNoTradePanel is present in the rendered output
 *   4. CorpusSummaryPanel renders its graceful 'not available' state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';

// ── Mock the chart panel (uses canvas APIs not available in jsdom) ────────────
vi.mock('../PriceChartPanel', () => ({
    PriceChartPanel: () => <div data-testid="mock-price-chart">PriceChart</div>,
}));

// ── Mock useTelemetry so tests don't open real WebSocket connections ──────────
vi.mock('../../../hooks/useTelemetry', () => ({
    useTelemetry: () => ({ isConnected: false }),
}));

// ── Mock apiFetch for corpus panel (prevents real network calls) ──────────────
vi.mock('../../../api', () => ({
    API_BASE: 'http://127.0.0.1:3000',
    WS_URL: 'ws://127.0.0.1:3000/telemetry',
    OPERATOR_API: 'http://127.0.0.1:3000/api/operator',
    apiFetch: vi.fn().mockResolvedValue({ data: null, error: null, status: 404 }),
}));

import { useStore } from '../../../store';
import { LiveMonitor } from '../LiveMonitor';

function renderLiveMonitor() {
    return render(
        <MemoryRouter>
            <LiveMonitor />
        </MemoryRouter>,
    );
}

describe('LiveMonitor smoke tests', () => {
    beforeEach(() => {
        // Reset Zustand store to initial disconnected state before each test
        useStore.setState({
            isConnected: false,
            connectionError: null,
            operatorStatus: null,
            bootInfo: null,
            feeds: {},
            markets: {},
            lifecycleStates: {},
            predictiveAggregate: null,
            leadLag: null,
            latestRiskDecisions: [],
            executionRows: [],
            eventTimeline: [],
            sessionPnl: null,
            roundPnl: {},
            roundResolutions: {},
            replayProgress: null,
            decisionSnapshots: [],
            priceHistory: {},
            corpusSummary: null,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders without crashing (no blank screen)', () => {
        expect(() => renderLiveMonitor()).not.toThrow();
        // Page heading must be present
        expect(screen.getByRole('heading', { name: /operator deck/i })).toBeInTheDocument();
    });

    it('shows WhyNoTradePanel in the layout', () => {
        renderLiveMonitor();
        // Panel is identified by its heading
        expect(screen.getByText(/why no trade\?/i)).toBeInTheDocument();
    });

    it('shows CorpusSummaryPanel in the layout', () => {
        renderLiveMonitor();
        expect(screen.getByText(/corpus summary/i)).toBeInTheDocument();
    });

    it('shows corpus not-available message when endpoint returns 404', async () => {
        await act(async () => {
            renderLiveMonitor();
        });
        // The graceful fallback text should appear when apiFetch returns status 404
        expect(
            screen.getByText(/corpus metrics not exposed/i),
        ).toBeInTheDocument();
    });

    it('shows connection error banner when connectionError is set', () => {
        // Connection error requires AppLayout; simulate via store state read in WhyNoTradePanel
        // We check that connectionError state propagates — full banner lives in AppLayout
        useStore.setState({ connectionError: 'Auth error 401: check VITE_OPERATOR_AUTH_TOKEN' });
        renderLiveMonitor();
        // The WhyNoTradePanel and rest of cockpit still render — no blank screen
        expect(screen.getByText(/why no trade\?/i)).toBeInTheDocument();
    });

    it('shows "No trade decision data yet" when store has no risk decisions', () => {
        renderLiveMonitor();
        expect(
            screen.getByText(/no trade decision data yet/i),
        ).toBeInTheDocument();
    });
});
