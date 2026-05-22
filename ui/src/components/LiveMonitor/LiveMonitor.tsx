import { SessionCommandBar } from './SessionCommandBar';
import { SystemStatusPanel } from './SystemStatusPanel';
import { FeedHealthPanel } from './FeedHealthPanel';
import { PredictiveSignalPanel } from './PredictiveSignalPanel';
import { EventTimelinePanel } from './EventTimelinePanel';
import { SessionSummaryPanel } from './SessionSummaryPanel';
import { PriceChartPanel } from './PriceChartPanel';
import { RoundDecisionPanel } from './RoundDecisionPanel';
import { MarketBookPanel } from './MarketBookPanel';
import { ExecutionBlotterPanel } from './ExecutionBlotterPanel';
import { WhyNoTradePanel } from './WhyNoTradePanel';
import { CorpusSummaryPanel } from './CorpusSummaryPanel';

export function LiveMonitor() {
    return (
        <div className="p-6 h-full flex flex-col overflow-y-auto">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Operator Deck</h1>
                    <p className="text-sm text-slate-400 mt-1">Real-time telemetry and control plane</p>
                </div>
            </header>

            {/* Compact Session Command Strip */}
            <SessionCommandBar />

            <div className="grid grid-cols-12 gap-6 pb-6">
                {/* Left column — Status & Key metrics */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    <SystemStatusPanel />
                    <RoundDecisionPanel />
                    <MarketBookPanel />
                    <FeedHealthPanel />
                    <SessionSummaryPanel />
                </div>

                {/* Center / Main — Charts & Core Signals */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    <PriceChartPanel />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <PredictiveSignalPanel />
                        {/* WhyNoTradePanel replaces the basic RiskPanel for detailed diagnostics */}
                        <WhyNoTradePanel />
                    </div>
                </div>

                {/* Bottom Row — Execution & Events */}
                <div className="col-span-12">
                    <ExecutionBlotterPanel />
                </div>
                <div className="col-span-12">
                    <EventTimelinePanel />
                </div>

                {/* Corpus & Replay Quality — always rendered, graceful 404 fallback */}
                <div className="col-span-12">
                    <CorpusSummaryPanel />
                </div>
            </div>
        </div>
    );
}
