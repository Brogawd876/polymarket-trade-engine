import { SystemStatusPanel } from './SystemStatusPanel';
import { FeedHealthPanel } from './FeedHealthPanel';
import { PredictiveSignalPanel } from './PredictiveSignalPanel';
import { RiskPanel } from './RiskPanel';
import { EventTimelinePanel } from './EventTimelinePanel';
import { SessionSummaryPanel } from './SessionSummaryPanel';
import { PriceChartPanel } from './PriceChartPanel';

export function LiveMonitor() {
    return (
        <div className="p-6 h-full flex flex-col overflow-y-auto">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-slate-100">Live Monitor</h1>
                <p className="text-sm text-slate-400 mt-1">Real-time telemetry and control plane</p>
            </header>

            <div className="grid grid-cols-12 gap-6 pb-6">
                {/* Top Row - Status & Key metrics */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    <SystemStatusPanel />
                    <FeedHealthPanel />
                    <SessionSummaryPanel />
                </div>

                {/* Center / Main - Charts & Core Signals */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    <PriceChartPanel />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <PredictiveSignalPanel />
                        <RiskPanel />
                    </div>
                </div>

                {/* Bottom Row - Logs */}
                <div className="col-span-12">
                    <EventTimelinePanel />
                </div>
            </div>
        </div>
    );
}
