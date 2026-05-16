import { useStore } from '../../store';

export function SystemStatusPanel() {
    const systemStatus = useStore(state => state.systemStatus);
    const bootInfo = useStore(state => state.bootInfo);

    return (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">System Status</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="text-slate-400 block">Mode</span>
                    <span className="text-slate-200 uppercase font-medium">{bootInfo?.mode || systemStatus?.mode || 'Unknown'}</span>
                </div>
                <div>
                    <span className="text-slate-400 block">Status</span>
                    <span className={`uppercase font-medium ${systemStatus?.isShuttingDown ? 'text-amber-400' : (systemStatus ? 'text-emerald-400' : 'text-slate-500')}`}>
                        {systemStatus?.isShuttingDown ? 'Shutting Down' : (systemStatus ? 'Running' : 'Unknown')}
                    </span>
                </div>
                <div>
                    <span className="text-slate-400 block">Strategy</span>
                    <span className="text-slate-200 font-medium">{bootInfo?.strategy || systemStatus?.strategy || 'None'}</span>
                </div>
                <div>
                    <span className="text-slate-400 block">Active Lifecycles</span>
                    <span className="text-slate-200 font-medium">{systemStatus?.activeLifecycles || 0}</span>
                </div>
            </div>
        </div>
    );
}
