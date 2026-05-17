import { useMemo, useState } from 'react';
import { BarChart3, Filter, FileText, Search } from 'lucide-react';
import { useLogs } from '../hooks/useLogs';
import { useAnalyticsStore } from '../store/analytics';
import { uniqueStrategies } from '../utils/analytics/aggregate';
import { parseSlugInfo } from '../utils/analytics/parse';

export default function Analytics() {
    const allRuns = useLogs();
    const { asset, duration, strategy, setAsset, setDuration, setStrategy } = useAnalyticsStore();
    
    const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

    const runs = useMemo(
        () => allRuns.filter((r) => {
            const info = parseSlugInfo(r.slug);
            return info.asset === asset && info.duration === duration;
        }),
        [allRuns, asset, duration]
    );

    const strategies = useMemo(() => uniqueStrategies(runs), [runs]);

    const filteredRuns = useMemo(
        () => strategy === "All"
            ? runs
            : runs.filter((r) => r.strategy === strategy),
        [runs, strategy]
    );

    return (
        <div className="p-6 h-full flex flex-col overflow-y-auto">
            <header className="mb-6 flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-indigo-400" />
                        Run Analysis
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">Historical performance and strategy backtest results</p>
                </div>

                <div className="flex gap-3">
                    <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700">
                        {['BTC', 'ETH', 'XRP', 'SOL', 'DOGE'].map((a) => (
                            <button
                                key={a}
                                onClick={() => setAsset(a as any)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                    asset === a 
                                    ? 'bg-indigo-500 text-white shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {a}
                            </button>
                        ))}
                    </div>

                    <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700">
                        {['5m', '15m'].map((d) => (
                            <button
                                key={d}
                                onClick={() => setDuration(d as any)}
                                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                                    duration === d 
                                    ? 'bg-indigo-500 text-white shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-12 gap-6">
                {/* Filters & Stats Bar */}
                <div className="col-span-12 flex flex-wrap items-center gap-4 bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
                    <div className="flex items-center gap-2 text-slate-400 text-sm border-r border-slate-700 pr-4">
                        <Filter className="w-4 h-4" />
                        <span>Filters:</span>
                    </div>

                    <select 
                        value={strategy}
                        onChange={(e) => setStrategy(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    >
                        <option value="All">All Strategies</option>
                        {strategies.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <div className="ml-auto flex items-center gap-6">
                        <div className="text-center">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Runs</div>
                            <div className="text-xl font-bold text-slate-200">{filteredRuns.length}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Win Rate</div>
                            <div className="text-xl font-bold text-emerald-400">
                                {filteredRuns.length > 0 
                                    ? ((filteredRuns.filter(r => r.outcome === 'win').length / filteredRuns.filter(r => r.outcome !== 'skip').length) * 100 || 0).toFixed(1) + '%'
                                    : '---'}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Net PnL</div>
                            <div className={`text-xl font-bold ${
                                (filteredRuns.reduce((acc, r) => acc + (r.resolution?.pnl || 0), 0)) >= 0 
                                ? 'text-emerald-400' 
                                : 'text-red-400'
                            }`}>
                                ${filteredRuns.reduce((acc, r) => acc + (r.resolution?.pnl || 0), 0).toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Charts Area */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-6 min-h-[400px] flex items-center justify-center">
                         <div className="text-center">
                            <BarChart3 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                            <h3 className="text-slate-300 font-medium">Performance Charts</h3>
                            <p className="text-slate-500 text-sm max-w-xs mt-2">Charts from legacy analysis are being integrated with Tailwind & Lightweight Charts.</p>
                         </div>
                    </div>
                </div>

                {/* Sidebar - Run List */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 flex flex-col h-[600px]">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-400" />
                                Historical Runs
                            </h2>
                            <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                {filteredRuns.length} items
                            </span>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-1">
                            {filteredRuns.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                    <Search className="w-8 h-8 text-slate-700 mb-2" />
                                    <p className="text-slate-500 text-xs italic">No logs found matching filters</p>
                                </div>
                            ) : (
                                filteredRuns.map((run) => (
                                    <button
                                        key={run.filename}
                                        onClick={() => setSelectedSlug(run.slug)}
                                        className={`w-full text-left p-3 rounded-lg transition-all group ${
                                            selectedSlug === run.slug 
                                            ? 'bg-indigo-500/10 border border-indigo-500/30' 
                                            : 'hover:bg-slate-700/30 border border-transparent'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                run.outcome === 'win' ? 'bg-emerald-500/20 text-emerald-400' :
                                                run.outcome === 'loss' ? 'bg-red-500/20 text-red-400' :
                                                'bg-slate-700 text-slate-400'
                                            }`}>
                                                {run.outcome.toUpperCase()}
                                            </span>
                                            <span className="text-[10px] text-slate-500 font-mono">
                                                {new Date(run.startTime).toLocaleDateString()} {new Date(run.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div className="text-xs font-medium text-slate-200 truncate">{run.slug}</div>
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-[10px] text-slate-500 font-mono uppercase">{run.strategy}</span>
                                            <span className={`text-xs font-bold ${
                                                (run.resolution?.pnl || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'
                                            }`}>
                                                {run.resolution ? `${(run.resolution.pnl >= 0 ? '+' : '')}${run.resolution.pnl.toFixed(2)}` : '---'}
                                            </span>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
