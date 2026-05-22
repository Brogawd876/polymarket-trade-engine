/**
 * WhyNoTradePanel — "Why no trade?" diagnostic panel.
 *
 * Surfaces the full picture of why the engine held or blocked a trade:
 *   - Risk gate decision + blockers
 *   - Feed disagreement + per-feed stale flags
 *   - Execution quality (spread, slippage, liquidity)
 *   - Signal quality (P(UP), σ, lead-lag confidence)
 *   - Session-level block reason from operator status
 *   - Last intent details
 *
 * All data is read from the Zustand store — no new network calls.
 * The panel must NEVER claim profitability or edge.
 */

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, HelpCircle, Wifi, WifiOff } from 'lucide-react';
import { useStore } from '../../store';

function fmt(v: number | null | undefined, digits = 4): string {
    return v == null ? '---' : v.toFixed(digits);
}

function fmtPct(v: number | null | undefined, digits = 2): string {
    return v == null ? '---' : `${(v * 100).toFixed(digits)}%`;
}

function fmtCurrency(v: number | null | undefined): string {
    return v == null ? '---' : `$${v.toFixed(4)}`;
}

function StatusBadge({ approved }: { approved: boolean | null }) {
    if (approved === null) return (
        <span className="flex items-center gap-1 text-slate-400 text-xs font-bold uppercase">
            <HelpCircle className="w-3.5 h-3.5" /> No Decision
        </span>
    );
    return approved ? (
        <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold uppercase">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
        </span>
    ) : (
        <span className="flex items-center gap-1 text-red-400 text-xs font-bold uppercase">
            <XCircle className="w-3.5 h-3.5" /> Blocked
        </span>
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
            {title}
        </div>
    );
}

function DataRow({ label, value, valueClass = 'text-slate-200' }: {
    label: string;
    value: React.ReactNode;
    valueClass?: string;
}) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-0.5">
            <span className="text-slate-500 text-xs shrink-0">{label}</span>
            <span className={`text-xs font-mono font-medium ${valueClass}`}>{value}</span>
        </div>
    );
}

export function WhyNoTradePanel() {
    const latestRiskDecisions = useStore(state => state.latestRiskDecisions);
    const predictiveAggregate = useStore(state => state.predictiveAggregate);
    const leadLag = useStore(state => state.leadLag);
    const decisionSnapshots = useStore(state => state.decisionSnapshots);
    const operatorStatus = useStore(state => state.operatorStatus);

    const latest = latestRiskDecisions[0] ?? null;
    const latestSnapshot = useMemo(() => decisionSnapshots[0] ?? null, [decisionSnapshots]);

    // Per-feed stale detection: any feed with quality !== 'live' is flagged
    const staleFeeds = useMemo(() => {
        if (!predictiveAggregate?.feeds) return [];
        return Object.entries(predictiveAggregate.feeds)
            .filter(([, f]) => f.quality !== 'live')
            .map(([name, f]) => ({ name, quality: f.quality, ageMs: f.latestEventAgeMs }));
    }, [predictiveAggregate]);

    const riskApproved: boolean | null = latest?.approved ?? null;
    const riskReasons: string[] = latest?.reasons ?? latestSnapshot?.risk.reasons ?? [];
    const disagreement = predictiveAggregate?.disagreement ?? latestSnapshot?.feeds.predictiveDisagreement ?? null;
    const divergencePct = predictiveAggregate?.divergencePct ?? latestSnapshot?.feeds.divergencePct ?? null;
    const spread = latestSnapshot?.orderbook.spread ?? null;
    const slippage = latestSnapshot?.orderbook.slippageEstimatePct ?? null;
    const targetLiquidity = latestSnapshot?.orderbook.targetLiquidity ?? null;
    const probabilityUp = latestSnapshot?.quant.probabilityUp ?? null;
    const sigma = latestSnapshot?.quant.sigma ?? null;
    const leadLagConf = leadLag?.leadershipConfidence ?? latestSnapshot?.feeds.leadLagConfidence ?? null;
    const sessionBlock = operatorStatus?.blockReason ?? null;
    const intent = latest?.intent ?? null;

    const hasAnyData = latest !== null || latestSnapshot !== null || predictiveAggregate !== null || sessionBlock !== null;

    return (
        <div
            id="why-no-trade-panel"
            className="glass-panel p-4 rounded-lg"
        >
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Why No Trade?</h2>

            {!hasAnyData ? (
                <div className="text-slate-500 text-sm italic">
                    No trade decision data yet. Decisions will appear after the engine evaluates at least one round.
                </div>
            ) : (
                <div className="space-y-4">
                    {/* ── Session-level block ── */}
                    {sessionBlock && (
                        <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-700/40 rounded-md">
                            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                            <div>
                                <div className="text-xs font-bold text-red-400 uppercase tracking-wide mb-0.5">
                                    Session Blocked
                                </div>
                                <div className="text-sm text-red-300">{sessionBlock}</div>
                            </div>
                        </div>
                    )}

                    {/* ── Risk Gate ── */}
                    <div className="p-3 glass-panel p-3 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                            <SectionHeader title="Risk Gate" />
                            <StatusBadge approved={riskApproved} />
                        </div>
                        {riskReasons.length > 0 ? (
                            <ul className="space-y-1">
                                {riskReasons.map((r, i) => (
                                    <li key={i} className="flex items-start gap-1.5 text-xs">
                                        <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                                        <span className="text-slate-300">{r}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : riskApproved !== null ? (
                            <div className="text-xs text-slate-500 italic">No blockers recorded.</div>
                        ) : null}
                        {intent && (
                            <div className="pt-2 border-t border-slate-700/50">
                                <SectionHeader title="Last Intent" />
                                <div className="grid grid-cols-2 gap-x-4">
                                    <DataRow label="Action" value={intent.action.toUpperCase()} />
                                    <DataRow
                                        label="Side"
                                        value={intent.side ?? '---'}
                                        valueClass={intent.side === 'UP' ? 'text-emerald-400' : intent.side === 'DOWN' ? 'text-red-400' : 'text-slate-400'}
                                    />
                                    <DataRow label="Price" value={fmtCurrency(intent.price)} />
                                    <DataRow label="Shares" value={fmt(intent.shares, 4)} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Feed Disagreement ── */}
                    <div className="p-3 glass-panel p-3 rounded-lg space-y-2">
                        <SectionHeader title="Feed Disagreement" />
                        <div className="grid grid-cols-2 gap-x-4">
                            <DataRow
                                label="Disagreement"
                                value={disagreement == null ? '---' : disagreement ? 'YES' : 'NO'}
                                valueClass={disagreement ? 'text-red-400' : 'text-emerald-400'}
                            />
                            <DataRow
                                label="Divergence"
                                value={divergencePct == null ? '---' : `${divergencePct.toFixed(4)}%`}
                                valueClass={divergencePct != null && Math.abs(divergencePct) > 0.01 ? 'text-amber-400' : 'text-slate-400'}
                            />
                        </div>
                        {staleFeeds.length > 0 && (
                            <div className="pt-1 space-y-1">
                                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Stale Feeds</div>
                                {staleFeeds.map(f => (
                                    <div key={f.name} className="flex items-center gap-2 text-xs">
                                        <WifiOff className="w-3 h-3 text-amber-400 shrink-0" />
                                        <span className="text-slate-300 font-medium">{f.name}</span>
                                        <span className="text-amber-400 uppercase">{f.quality}</span>
                                        <span className="text-slate-500">{f.ageMs != null ? `${(f.ageMs / 1000).toFixed(1)}s ago` : ''}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {staleFeeds.length === 0 && predictiveAggregate && (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                                <Wifi className="w-3 h-3" />
                                All feeds live
                            </div>
                        )}
                    </div>

                    {/* ── Execution Quality ── */}
                    {latestSnapshot && (
                        <div className="p-3 glass-panel p-3 rounded-lg space-y-1">
                            <SectionHeader title="Execution Quality" />
                            <div className="grid grid-cols-2 gap-x-4">
                                <DataRow
                                    label="Spread"
                                    value={fmtCurrency(spread)}
                                    valueClass={spread != null && spread > 0.05 ? 'text-amber-400' : 'text-slate-200'}
                                />
                                <DataRow
                                    label="Slippage Est."
                                    value={fmtPct(slippage)}
                                    valueClass={slippage != null && slippage > 0.01 ? 'text-amber-400' : 'text-slate-200'}
                                />
                                <DataRow
                                    label="Target Liquidity"
                                    value={targetLiquidity == null ? '---' : targetLiquidity.toFixed(2)}
                                    valueClass={targetLiquidity != null && targetLiquidity < 1 ? 'text-red-400' : 'text-slate-200'}
                                />
                                <DataRow
                                    label="Bid"
                                    value={fmtCurrency(latestSnapshot.orderbook.bid)}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Signal Quality ── */}
                    <div className="p-3 glass-panel p-3 rounded-lg space-y-1">
                        <SectionHeader title="Signal Quality" />
                        <div className="grid grid-cols-2 gap-x-4">
                            <DataRow label="P(UP)" value={fmtPct(probabilityUp)} valueClass="text-sky-400" />
                            <DataRow label="Realized Vol (σ)" value={fmtPct(sigma)} />
                            <DataRow
                                label="Lead-Lag Conf."
                                value={leadLagConf ?? '---'}
                                valueClass={
                                    leadLagConf === 'strong' ? 'text-emerald-400' :
                                    leadLagConf === 'moderate' ? 'text-sky-400' :
                                    leadLagConf === 'weak' ? 'text-amber-400' :
                                    'text-slate-400'
                                }
                            />
                            <DataRow
                                label="Sufficient Samples"
                                value={leadLag == null ? '---' : leadLag.sufficientSamples ? 'Yes' : 'No'}
                                valueClass={leadLag?.sufficientSamples ? 'text-emerald-400' : 'text-amber-400'}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
