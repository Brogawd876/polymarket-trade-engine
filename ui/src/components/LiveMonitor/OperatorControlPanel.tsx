import { useState, useEffect } from 'react';
import { useStore } from '../../store';
import { PlayCircle, Square, RotateCcw, AlertTriangle, Play } from 'lucide-react';

const API_BASE = "http://127.0.0.1:3000/api/operator";

export function OperatorControlPanel() {
    const operatorStatus = useStore(state => state.operatorStatus);
    const isConnected = useStore(state => state.isConnected);
    const [replayFiles, setReplayFiles] = useState<string[]>([]);
    const [selectedReplay, setSelectedReplay] = useState<string>('');
    const [simRounds, setSimRounds] = useState<number>(0); // 0 means unlimited
    const [strategy, setStrategy] = useState<string>('simulation');
    
    // Fetch replay files on mount
    useEffect(() => {
        fetch(`${API_BASE}/replay-fixtures`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setReplayFiles(data);
                    if (data.length > 0) setSelectedReplay(data[0]);
                }
            })
            .catch(err => console.error("Failed to fetch replay fixtures", err));
    }, []);

    const handleStartSim = async () => {
        try {
            const res = await fetch(`${API_BASE}/simulation/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    strategy,
                    rounds: simRounds > 0 ? simRounds : undefined
                })
            });
            const data = await res.json();
            if (!data.success) {
                alert(`Start failed: ${data.error}`);
            }
        } catch (e: any) {
            alert(`Start failed: ${e.message}`);
        }
    };

    const handleStartReplay = async () => {
        try {
            const res = await fetch(`${API_BASE}/replay/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: `logs/${selectedReplay}`
                })
            });
            const data = await res.json();
            if (!data.success) {
                alert(`Replay start failed: ${data.error}`);
            }
        } catch (e: any) {
            alert(`Replay start failed: ${e.message}`);
        }
    };

    const handleStop = async () => {
        try {
            await fetch(`${API_BASE}/session/stop`, { method: 'POST' });
        } catch (e: any) {
            alert(`Stop failed: ${e.message}`);
        }
    };

    const handleReset = async () => {
        if (!confirm("Are you sure you want to clear the paper simulation state?")) return;
        try {
            const res = await fetch(`${API_BASE}/simulation/reset-state`, { method: 'POST' });
            const data = await res.json();
            if (!data.success) {
                alert(`Reset failed: ${data.error}`);
            } else {
                // Refresh status
                fetch("http://127.0.0.1:3000/api/operator/status")
                    .then(r => r.json())
                    .then(useStore.getState().setOperatorStatus);
            }
        } catch (e: any) {
            alert(`Reset failed: ${e.message}`);
        }
    };

    if (!isConnected) {
        return (
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 opacity-50">
                <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2 text-amber-500" />
                    Operator Controls (Disconnected)
                </h2>
                <div className="text-sm text-slate-400">
                    Cannot reach backend control server on port 3000. Start the engine in --idle mode.
                </div>
            </div>
        );
    }

    const isRunning = operatorStatus?.sessionState === "running" || operatorStatus?.sessionState === "starting";
    const isBlocked = operatorStatus?.blockReason != null;

    return (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-slate-200">Operator Controls</h2>
                <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${
                    operatorStatus?.sessionState === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                    operatorStatus?.sessionState === 'starting' ? 'bg-blue-500/20 text-blue-400' :
                    operatorStatus?.sessionState === 'stopping' ? 'bg-amber-500/20 text-amber-400' :
                    operatorStatus?.sessionState === 'failed' ? 'bg-red-500/20 text-red-400' :
                    'bg-slate-700 text-slate-300'
                }`}>
                    {operatorStatus?.sessionState || 'Unknown'}
                </span>
            </div>

            {isBlocked && (
                <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-sm text-red-200">
                    <strong className="block text-red-400 mb-1">Startup Blocked / Failed</strong>
                    {operatorStatus.blockReason}
                    {operatorStatus.blockReason?.includes("SESSION_LOSS_EXCEEDED") && (
                        <div className="mt-2">
                            <button 
                                onClick={handleReset}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors flex items-center"
                            >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Reset Paper Session
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Simulation Controls */}
                <div className="space-y-3 p-3 bg-slate-900/50 rounded border border-slate-700/50">
                    <h3 className="font-medium text-slate-300">Paper Simulation</h3>
                    <div className="flex space-x-2">
                        <select
                            id="strategy-select"
                            name="strategy"
                            className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 flex-1"
                            value={strategy}
                            onChange={e => setStrategy(e.target.value)}
                            disabled={isRunning}
                        >
                            <option value="simulation">simulation</option>
                            <option value="late-entry">late-entry</option>
                        </select>
                        <input
                            id="sim-rounds-input"
                            name="simRounds"
                            type="number"
                            className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200 w-24"
                            placeholder="Rounds (0=all)"
                            value={simRounds}
                            onChange={e => setSimRounds(parseInt(e.target.value) || 0)}
                            disabled={isRunning}
                            min="0"
                        />
                    </div>
                    <button
                        id="start-sim-button"
                        onClick={handleStartSim}
                        disabled={isRunning}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors flex items-center justify-center"
                    >
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Start Simulation
                    </button>
                </div>

                {/* Replay Controls */}
                <div className="space-y-3 p-3 bg-slate-900/50 rounded border border-slate-700/50">
                    <h3 className="font-medium text-slate-300">Historical Replay</h3>
                    <select
                        id="replay-file-select"
                        name="replayFile"
                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-200"
                        value={selectedReplay}
                        onChange={e => setSelectedReplay(e.target.value)}
                        disabled={isRunning || replayFiles.length === 0}
                    >
                        {replayFiles.map(f => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                    <button
                        id="start-replay-button"
                        onClick={handleStartReplay}
                        disabled={isRunning || !selectedReplay}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium transition-colors flex items-center justify-center"
                    >
                        <Play className="w-4 h-4 mr-2" />
                        Start Replay
                    </button>
                </div>            </div>

            {/* Active Session Controls */}
            {isRunning && (
                <div className="mt-4 p-3 bg-amber-900/20 border border-amber-700/50 rounded flex items-center justify-between">
                    <div>
                        <div className="text-sm font-bold text-amber-500 uppercase">Session Active</div>
                        <div className="text-xs text-slate-400">
                            {operatorStatus?.engineMode === 'replay' 
                                ? `Replaying: ${operatorStatus.activeReplayFile}`
                                : `Strategy: ${operatorStatus?.engineStatus?.strategy}`}
                        </div>
                    </div>
                    <button 
                        onClick={handleStop}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors flex items-center"
                    >
                        <Square className="w-4 h-4 mr-2" />
                        Stop Session
                    </button>
                </div>
            )}
            
            {/* Reset state when not running and not blocked (blocked already shows the button) */}
            {!isRunning && !isBlocked && (
                <div className="mt-4 flex justify-end">
                    <button 
                        onClick={handleReset}
                        className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors flex items-center"
                    >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset Paper State
                    </button>
                </div>
            )}
        </div>
    );
}
