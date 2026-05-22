/**
 * CorpusSummaryPanel — Replay/Corpus quality snapshot.
 *
 * Polls GET /api/operator/corpus-summary every 30 seconds.
 * If the endpoint returns 404 (not yet wired on this backend version),
 * shows a graceful "not available" notice rather than an error.
 *
 * Shows: valid/invalid pairs, record type breakdown,
 * data quality flags, readiness decision, and blockers.
 */

import { useEffect } from 'react';
import { Database, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { useStore, type CorpusSummary } from '../../store';
import { apiFetch } from '../../api';

const POLL_INTERVAL_MS = 30_000;

function MetricBox({ label, value, sub, warn = false }: {
    label: string;
    value: string | number;
    sub?: string;
    warn?: boolean;
}) {
    return (
        <div className="p-2.5 bg-slate-950/40 rounded border border-slate-700/50">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</div>
            <div className={`text-base font-bold font-mono ${warn ? 'text-amber-400' : 'text-slate-100'}`}>
                {value}
            </div>
            {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
        </div>
    );
}

function ReadinessBadge({ decision }: { decision: CorpusSummary['readinessDecision'] }) {
    if (decision === 'READY') {
        return (
            <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold uppercase">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ready
            </span>
        );
    }
    if (decision === 'BLOCKED') {
        return (
            <span className="flex items-center gap-1 text-red-400 text-xs font-bold uppercase">
                <XCircle className="w-3.5 h-3.5" /> Blocked
            </span>
        );
    }
    return (
        <span className="flex items-center gap-1 text-slate-400 text-xs font-bold uppercase">
            <AlertTriangle className="w-3.5 h-3.5" /> Unknown
        </span>
    );
}

export function CorpusSummaryPanel() {
    const corpusSummary = useStore(state => state.corpusSummary);
    const setCorpusSummary = useStore(state => state.setCorpusSummary);

    useEffect(() => {
        let isMounted = true;

        const poll = async () => {
            const result = await apiFetch<CorpusSummary>('/api/operator/corpus-summary');
            if (!isMounted) return;

            if (result.status === 404) {
                // Endpoint not yet wired — leave corpusSummary null (graceful not-available)
                return;
            }
            if (result.data) {
                setCorpusSummary({ ...result.data, fetchedAt: Date.now() });
            }
        };

        poll();
        const handle = setInterval(poll, POLL_INTERVAL_MS);
        return () => {
            isMounted = false;
            clearInterval(handle);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!corpusSummary) {
        return (
            <div
                id="corpus-summary-panel"
                className="bg-slate-800 p-4 rounded-lg border border-slate-700"
            >
                <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-slate-500" />
                    <h2 className="text-lg font-semibold text-slate-200">Corpus Summary</h2>
                </div>
                <div className="text-slate-500 text-sm italic">
                    Corpus metrics not exposed by this backend
                    (<code className="text-slate-400 font-mono text-xs">/api/operator/corpus-summary</code> not found).
                    Run the corpus pipeline and wire the endpoint to see readiness data here.
                </div>
            </div>
        );
    }

    const totalRecords = corpusSummary.tradePrintBackedRecords + corpusSummary.touchOnlyRecords;
    const tradePrintPct = totalRecords > 0
        ? ((corpusSummary.tradePrintBackedRecords / totalRecords) * 100).toFixed(1)
        : '0.0';

    return (
        <div
            id="corpus-summary-panel"
            className="bg-slate-800 p-4 rounded-lg border border-slate-700"
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-400" />
                    <h2 className="text-lg font-semibold text-slate-200">Corpus Summary</h2>
                </div>
                <ReadinessBadge decision={corpusSummary.readinessDecision} />
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
                <MetricBox label="Valid Pairs" value={corpusSummary.validPairs} />
                <MetricBox
                    label="Invalid Pairs"
                    value={corpusSummary.invalidPairs}
                    warn={corpusSummary.invalidPairs > 0}
                />
                <MetricBox label="Total Records" value={totalRecords} />
                <MetricBox
                    label="Trade-Print-Backed"
                    value={corpusSummary.tradePrintBackedRecords}
                    sub={`${tradePrintPct}% of records`}
                />
                <MetricBox
                    label="Touch-Only"
                    value={corpusSummary.touchOnlyRecords}
                    warn={corpusSummary.touchOnlyRecords > corpusSummary.tradePrintBackedRecords}
                />
                <MetricBox label="Calibration Records" value={corpusSummary.calibrationRecords} />
            </div>

            {(corpusSummary.missingLabels > 0 || corpusSummary.missingFeatures > 0) && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <MetricBox
                        label="Missing Labels"
                        value={corpusSummary.missingLabels}
                        warn={corpusSummary.missingLabels > 0}
                    />
                    <MetricBox
                        label="Missing Features"
                        value={corpusSummary.missingFeatures}
                        warn={corpusSummary.missingFeatures > 0}
                    />
                </div>
            )}

            {corpusSummary.blockers.length > 0 && (
                <div className="pt-3 border-t border-slate-700/50">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                        Readiness Blockers
                    </div>
                    <ul className="space-y-1">
                        {corpusSummary.blockers.map((b, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs">
                                <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                                <span className="text-slate-300">{b}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {corpusSummary.fetchedAt && (
                <div className="mt-3 text-[10px] text-slate-600 text-right">
                    Updated {new Date(corpusSummary.fetchedAt).toLocaleTimeString()}
                </div>
            )}
        </div>
    );
}
