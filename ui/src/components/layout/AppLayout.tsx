import { NavLink, Outlet } from 'react-router-dom';
import { Activity, BarChart2, Settings, FileText, PlayCircle, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useTelemetry } from '../../hooks/useTelemetry';
import { useStore } from '../../store';

export function AppLayout() {
    useTelemetry(); // Start telemetry connection on layout mount
    const isConnected = useStore((state) => state.isConnected);
    const bootInfo = useStore((state) => state.bootInfo);
    const operatorStatus = useStore((state) => state.operatorStatus);
    const connectionError = useStore((state) => state.connectionError);

    const navItems = [
        { path: '/', label: 'Live Monitor', icon: Activity },
        { path: '/controls', label: 'Control Center', icon: Settings },
        { path: '/replay', label: 'Replay Lab', icon: PlayCircle },
        { path: '/strategy', label: 'Strategy Lab', icon: BarChart2 },
        { path: '/readiness', label: 'Live Readiness', icon: ShieldCheck },
        { path: '/analytics', label: 'Analytics', icon: BarChart2 },
        { path: '/logs', label: 'Diagnostics', icon: FileText },
        { path: '/settings', label: 'Settings', icon: Settings },
    ];

    const displayMode = operatorStatus?.engineMode === 'idle'
        ? 'IDLE'
        : bootInfo?.mode || operatorStatus?.engineStatus?.mode || 'UNKNOWN';

    return (
        <div className="flex h-screen w-full bg-transparent text-slate-100 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 glass-panel border-r border-slate-700/50 flex flex-col z-10 relative">
                <div className="p-4 border-b border-slate-700/50">
                    <h1 className="text-xl font-bold neon-text-emerald tracking-tight">Operator Deck</h1>        
                    <div className="flex items-center mt-2 space-x-2 text-xs">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(248,113,113,0.8)] animate-pulse'}`} />
                        <span className="text-slate-400 font-medium">{isConnected ? 'Connected' : 'Disconnected'}</span>    
                    </div>
                </div>
                <nav className="flex-1 p-4 space-y-1.5">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-300 ${
                                    isActive
                                        ? 'bg-emerald-500/15 neon-text-emerald border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                                        : 'text-slate-400 hover:bg-slate-700/30 hover:text-slate-200 hover:translate-x-1'
                                }`
                            }
                        >
                            <item.icon className="w-4 h-4" />
                            <span className="text-sm font-medium">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="p-4 border-t border-slate-700/50 text-xs text-slate-400">
                    {operatorStatus ? (
                        <>
                            <div>Mode: <span className="neon-text-emerald uppercase font-bold">{displayMode}</span></div>  
                            <div className="mt-1">Engine: <span className="text-slate-200">{bootInfo?.version || '0.0.1'}</span></div>
                        </>
                    ) : (
                        <div>Engine not identified</div>
                    )}
                </div>
            </aside>
            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-transparent flex flex-col relative">
                {/* Connection / Auth Error Banner */}
                {connectionError && (
                    <div
                        role="alert"
                        className="flex items-center gap-3 px-4 py-2.5 bg-amber-900/40 border-b border-amber-700/60 text-amber-300 text-sm"
                    >
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="font-medium">Connection error:</span>
                        <span className="opacity-90">{connectionError}</span>
                    </div>
                )}
                <div className="flex-1 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
