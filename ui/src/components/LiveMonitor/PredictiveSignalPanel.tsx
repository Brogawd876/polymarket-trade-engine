import { useStore } from '../../store';

export function PredictiveSignalPanel() {
    const predictiveAggregate = useStore(state => state.predictiveAggregate);
    const leadLag = useStore(state => state.leadLag);

    return (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Predictive Signals</h2>
            
            <div className="space-y-4">
                {/* Aggregate */}
                <div className="p-3 bg-slate-900/50 rounded border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Aggregate Price</div>
                    <div className="flex items-end justify-between">
                        <span className="text-xl font-bold text-slate-200">
                            {predictiveAggregate ? `$${predictiveAggregate.aggregatePrice.toFixed(4)}` : '---'}
                        </span>
                        <span className={`text-sm ${predictiveAggregate && Math.abs(predictiveAggregate.divergence) > 0.01 ? 'text-amber-400' : 'text-slate-500'}`}>
                            Div: {predictiveAggregate ? `${(predictiveAggregate.divergence * 100).toFixed(2)}%` : '---'}
                        </span>
                    </div>
                </div>

                {/* Lead-Lag */}
                <div className="p-3 bg-slate-900/50 rounded border border-slate-700/50">
                    <div className="text-xs text-slate-400 mb-1">Lead-Lag Timing</div>
                    {leadLag ? (
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                                <span className="text-slate-500 block text-xs">Leader</span>
                                <span className="text-slate-300 font-medium capitalize">{leadLag.leader}</span>
                            </div>
                            <div>
                                <span className="text-slate-500 block text-xs">Confidence</span>
                                <span className="text-slate-300 font-medium">{Math.round(leadLag.confidence * 100)}%</span>
                            </div>
                            <div className="col-span-2">
                                <span className="text-slate-500 block text-xs">Samples Status</span>
                                <span className={leadLag.sufficientSamples ? 'text-emerald-400' : 'text-amber-400'}>
                                    {leadLag.sufficientSamples ? 'Sufficient' : 'Insufficient'}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-slate-500 text-sm italic">Waiting for signal...</div>
                    )}
                </div>
            </div>
        </div>
    );
}
