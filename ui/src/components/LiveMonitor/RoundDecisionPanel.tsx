import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';

function formatCurrency(value: number | null | undefined, digits = 2) {
    return value == null ? '---' : `$${value.toFixed(digits)}`;
}

function formatCountdown(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function RoundDecisionPanel() {
    const markets = useStore(state => state.markets);
    const lifecycleStates = useStore(state => state.lifecycleStates);
    const roundResolutions = useStore(state => state.roundResolutions);
    const [nowMs, setNowMs] = useState(Date.now());

    useEffect(() => {
        const handle = setInterval(() => setNowMs(Date.now()), 250);
        return () => clearInterval(handle);
    }, []);

    const current = useMemo(() => {
        const entries = Object.entries(markets);
        if (entries.length === 0) return null;
        return entries.reduce((latest, entry) =>
            entry[1].lastUpdated > latest[1].lastUpdated ? entry : latest
        );
    }, [markets]);

    const slug = current?.[0] ?? null;
    const market = current?.[1] ?? null;
    const lifecycleState = slug ? lifecycleStates[slug] : null;
    const resolution = slug ? roundResolutions[slug] : null;
    const remainingMs = market?.slotEndMs ? market.slotEndMs - nowMs : 0;
    const marketOpenMs = market?.slotEndMs ? market.slotEndMs - 300_000 : null;
    const msUntilOpen = marketOpenMs ? marketOpenMs - nowMs : 0;
    const isPreOpen = msUntilOpen > 0;
    const isEnded = !!market?.slotEndMs && remainingMs <= 0;
    const direction = market?.direction ?? null;
    const displayedResult = resolution?.direction ?? (market?.priceToBeat == null ? null : direction);
    const directionClass =
        displayedResult === 'UP' ? 'text-emerald-400' :
        displayedResult === 'DOWN' ? 'text-red-400' :
        'text-slate-400';
    const roundState =
        resolution ? `RESOLVED ${resolution.direction}` :
        lifecycleState === 'STOPPING' ? 'CLOSING' :
        isEnded ? 'ENDED / AWAITING RESOLUTION' :
        market?.priceToBeat == null ? 'WAITING FOR OPEN' :
        'LIVE';
    const countdownLabel =
        resolution ? 'Resolved' :
        isEnded ? 'Ended' :
        isPreOpen ? 'Market Opens In' :
        'Closes In';
    const countdownValue =
        resolution ? 'FINAL' :
        market?.slotEndMs ? formatCountdown(isPreOpen ? msUntilOpen : remainingMs) : '---';
    const resultLabel = resolution ? 'Final Result' : 'Current Result';
    const resultText = displayedResult ?? (market?.priceToBeat == null ? 'WAITING' : '---');

    return (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-200">Round Decision</h2>
                {slug && <span className="text-xs text-slate-400 font-mono">{slug}</span>}
            </div>

            {market ? (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 bg-slate-900/50 rounded border border-slate-700/50">
                            <div className="text-xs text-slate-400 mb-1">Round State</div>
                            <div className={`text-lg font-bold ${resolution ? directionClass : 'text-slate-100'}`}>
                                {roundState}
                            </div>
                        </div>
                        <div className="p-3 bg-slate-900/50 rounded border border-slate-700/50">
                            <div className="text-xs text-slate-400 mb-1">{countdownLabel}</div>
                            <div className="text-2xl font-bold text-slate-100 font-mono">
                                {countdownValue}
                            </div>
                        </div>
                        <div className="p-3 bg-slate-900/50 rounded border border-slate-700/50">
                            <div className="text-xs text-slate-400 mb-1">{resultLabel}</div>
                            <div className={`text-2xl font-bold ${directionClass}`}>
                                {resultText}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                            <span className="text-slate-500 block text-xs">BTC Now</span>
                            <span className="text-slate-200 font-semibold">{formatCurrency(market.price)}</span>
                        </div>
                        <div>
                            <span className="text-slate-500 block text-xs">Price To Beat</span>
                            <span className="text-slate-200 font-semibold">
                                {market.priceToBeat == null ? 'Waiting for open' : formatCurrency(market.priceToBeat)}
                            </span>
                        </div>
                        <div>
                            <span className="text-slate-500 block text-xs">Gap</span>
                            <span className={market.gap != null && market.gap >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                                {market.gap == null ? '---' : `${market.gap >= 0 ? '+' : ''}${formatCurrency(market.gap)}`}
                            </span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-slate-500 text-sm italic">Waiting for market ticks...</div>
            )}
        </div>
    );
}
