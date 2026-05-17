import { EarlyBird } from "./early-bird.ts";
import { ReplayRunner, VirtualClock, type TelemetryEvent, type TelemetrySink } from "./bot-core/index.ts";
import { listStrategyVariants, resolveStrategySelection, type StrategyVariant } from "./strategy/index.ts";
import { validateReplayFixture } from "./server/helpers/replay-fixtures.ts";

export type StrategyLabBatchState = "queued" | "running" | "completed" | "failed" | "canceled";
export type StrategyLabRunStatus = "queued" | "running" | "completed" | "failed" | "canceled";
export type StrategyLabVerdict = "win" | "loss" | "flat" | "no_trade" | "blocked" | "failed";

export type StrategyLabBatchRequest = {
  strategies?: string[];
  variants?: string[];
  files: string[];
};

export type StrategyLabRunResult = {
  id: string;
  strategy: string;
  baseStrategy: string;
  variantLabel: string;
  paperEligible: boolean;
  file: string;
  slug: string | null;
  status: StrategyLabRunStatus;
  pnl: number | null;
  direction: "UP" | "DOWN" | null;
  openPrice: number | null;
  closePrice: number | null;
  counts: {
    intents: number;
    allowed: number;
    blocked: number;
    fills: number;
    problems: number;
    settlements: number;
  };
  verdict: StrategyLabVerdict | null;
  error?: string;
};

export type StrategyLabVariantSummary = {
  strategy: string;
  baseStrategy: string;
  label: string;
  paperEligible: boolean;
  runs: number;
  completed: number;
  failed: number;
  canceled: number;
  wins: number;
  losses: number;
  noTrades: number;
  blockedVerdicts: number;
  tradeCount: number;
  winRate: number | null;
  tradeRate: number | null;
  totalPnl: number;
  avgPnl: number | null;
  bestPnl: number | null;
  worstPnl: number | null;
  blocked: number;
  problems: number;
  score: number;
};

export type StrategyLabRecommendation = {
  strategy: string;
  label: string;
  score: number;
  readyForPaper: boolean;
  rationale: string[];
} | null;

export type StrategyLabBatchSummary = {
  totalRuns: number;
  completed: number;
  failed: number;
  canceled: number;
  winRate: number | null;
  totalPnl: number;
  avgPnl: number | null;
  bestPnl: number | null;
  worstPnl: number | null;
  blocked: number;
  problems: number;
  byStrategy: StrategyLabVariantSummary[];
  recommendation: StrategyLabRecommendation;
};

export type StrategyLabBatch = {
  id: string;
  state: StrategyLabBatchState;
  createdAtMs: number;
  updatedAtMs: number;
  progress: {
    totalRuns: number;
    completedRuns: number;
  };
  runs: StrategyLabRunResult[];
  summary: StrategyLabBatchSummary;
  error?: string;
};

class CollectingTelemetrySink implements TelemetrySink {
  events: TelemetryEvent[] = [];

  push(event: TelemetryEvent): void {
    this.events.push(event);
  }
}

const EMPTY_COUNTS = {
  intents: 0,
  allowed: 0,
  blocked: 0,
  fills: 0,
  problems: 0,
  settlements: 0,
};

const MAX_BATCH_RUNS = 50;

function emptySummary(totalRuns: number): StrategyLabBatchSummary {
  return {
    totalRuns,
    completed: 0,
    failed: 0,
    canceled: 0,
    winRate: null,
    totalPnl: 0,
    avgPnl: null,
    bestPnl: null,
    worstPnl: null,
    blocked: 0,
    problems: 0,
    byStrategy: [],
    recommendation: null,
  };
}

function deriveResultFromEvents(base: StrategyLabRunResult, events: TelemetryEvent[]): StrategyLabRunResult {
  const result: StrategyLabRunResult = {
    ...base,
    counts: { ...EMPTY_COUNTS },
    status: "completed",
    pnl: 0,
    verdict: "flat",
  };

  for (const event of events) {
    switch (event.type) {
      case "SYSTEM_BOOT":
        break;
      case "ORDER_INTENT":
        result.slug = event.payload.slug;
        result.counts.intents += 1;
        break;
      case "RISK_DECISION":
        result.slug = event.payload.slug;
        if (event.payload.approved) result.counts.allowed += 1;
        else result.counts.blocked += 1;
        break;
      case "ORDER_LIFECYCLE":
        result.slug = event.payload.slug;
        if (event.payload.status === "filled" || event.payload.status === "partial_filled") result.counts.fills += 1;
        if (event.payload.status === "failed" || event.payload.status === "canceled" || event.payload.status === "expired") {
          result.counts.problems += 1;
        }
        break;
      case "ROUND_RESOLUTION":
        result.slug = event.payload.slug;
        result.direction = event.payload.direction;
        result.openPrice = event.payload.openPrice;
        result.closePrice = event.payload.closePrice;
        break;
      case "ROUND_PNL":
        result.slug = event.payload.slug;
        result.pnl = event.payload.pnl;
        result.counts.settlements += 1;
        break;
      case "SESSION_PNL":
        result.pnl = event.payload.pnl;
        break;
    }
  }

  const pnl = result.pnl ?? 0;
  if (result.counts.blocked > 0 && result.counts.fills === 0) result.verdict = "blocked";
  else if (result.counts.intents === 0 && result.counts.fills === 0) result.verdict = "no_trade";
  else if (pnl > 0) result.verdict = "win";
  else if (pnl < 0) result.verdict = "loss";
  else result.verdict = "flat";

  result.pnl = parseFloat(pnl.toFixed(4));
  return result;
}

function recomputeSummary(batch: StrategyLabBatch): StrategyLabBatchSummary {
  const completedRuns = batch.runs.filter(run => run.status === "completed");
  const pnlRuns = completedRuns.filter(run => typeof run.pnl === "number") as Array<StrategyLabRunResult & { pnl: number }>;
  const wins = completedRuns.filter(run => run.verdict === "win").length;
  const totalPnl = parseFloat(pnlRuns.reduce((sum, run) => sum + run.pnl, 0).toFixed(4));
  const byStrategy = summarizeByStrategy(batch.runs);

  return {
    totalRuns: batch.runs.length,
    completed: completedRuns.length,
    failed: batch.runs.filter(run => run.status === "failed").length,
    canceled: batch.runs.filter(run => run.status === "canceled").length,
    winRate: completedRuns.length > 0 ? wins / completedRuns.length : null,
    totalPnl,
    avgPnl: pnlRuns.length > 0 ? parseFloat((totalPnl / pnlRuns.length).toFixed(4)) : null,
    bestPnl: pnlRuns.length > 0 ? Math.max(...pnlRuns.map(run => run.pnl)) : null,
    worstPnl: pnlRuns.length > 0 ? Math.min(...pnlRuns.map(run => run.pnl)) : null,
    blocked: batch.runs.reduce((sum, run) => sum + run.counts.blocked, 0),
    problems: batch.runs.reduce((sum, run) => sum + run.counts.problems, 0),
    byStrategy,
    recommendation: recommendStrategy(byStrategy),
  };
}

function summarizeByStrategy(runs: StrategyLabRunResult[]): StrategyLabVariantSummary[] {
  const grouped = new Map<string, StrategyLabRunResult[]>();
  for (const run of runs) {
    const current = grouped.get(run.strategy) ?? [];
    current.push(run);
    grouped.set(run.strategy, current);
  }

  return [...grouped.entries()]
    .map(([strategy, items]) => {
      const completed = items.filter(run => run.status === "completed");
      const pnlRuns = completed.filter(run => typeof run.pnl === "number") as Array<StrategyLabRunResult & { pnl: number }>;
      const wins = completed.filter(run => run.verdict === "win").length;
      const losses = completed.filter(run => run.verdict === "loss").length;
      const noTrades = completed.filter(run => run.verdict === "no_trade").length;
      const blockedVerdicts = completed.filter(run => run.verdict === "blocked").length;
      const tradeCount = completed.filter(run => run.counts.fills > 0 || run.counts.intents > 0).length;
      const totalPnl = parseFloat(pnlRuns.reduce((sum, run) => sum + run.pnl, 0).toFixed(4));
      const failed = items.filter(run => run.status === "failed").length;
      const canceled = items.filter(run => run.status === "canceled").length;
      const blocked = items.reduce((sum, run) => sum + run.counts.blocked, 0);
      const problems = items.reduce((sum, run) => sum + run.counts.problems, 0);
      const tradeRate = completed.length > 0 ? tradeCount / completed.length : null;
      const score = scoreStrategy({
        totalPnl,
        completed: completed.length,
        failed,
        canceled,
        wins,
        losses,
        noTrades,
        blocked,
        problems,
        worstPnl: pnlRuns.length > 0 ? Math.min(...pnlRuns.map(run => run.pnl)) : null,
        tradeRate,
      });

      return {
        strategy,
        baseStrategy: items[0]?.baseStrategy ?? strategy,
        label: items[0]?.variantLabel ?? strategy,
        paperEligible: items.some(run => run.paperEligible),
        runs: items.length,
        completed: completed.length,
        failed,
        canceled,
        wins,
        losses,
        noTrades,
        blockedVerdicts,
        tradeCount,
        winRate: completed.length > 0 ? wins / completed.length : null,
        tradeRate,
        totalPnl,
        avgPnl: pnlRuns.length > 0 ? parseFloat((totalPnl / pnlRuns.length).toFixed(4)) : null,
        bestPnl: pnlRuns.length > 0 ? Math.max(...pnlRuns.map(run => run.pnl)) : null,
        worstPnl: pnlRuns.length > 0 ? Math.min(...pnlRuns.map(run => run.pnl)) : null,
        blocked,
        problems,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || b.totalPnl - a.totalPnl || a.strategy.localeCompare(b.strategy));
}

function scoreStrategy(input: {
  totalPnl: number;
  completed: number;
  failed: number;
  canceled: number;
  wins: number;
  losses: number;
  noTrades: number;
  blocked: number;
  problems: number;
  worstPnl: number | null;
  tradeRate: number | null;
}): number {
  const winRate = input.completed > 0 ? input.wins / input.completed : 0;
  const tradeRate = input.tradeRate ?? 0;
  const worstPenalty = input.worstPnl != null && input.worstPnl < 0 ? Math.abs(input.worstPnl) * 1.5 : 0;
  const score =
    input.totalPnl * 10 +
    winRate * 8 +
    tradeRate * 3 -
    input.losses * 2 -
    input.noTrades * 0.4 -
    input.failed * 8 -
    input.canceled * 5 -
    input.blocked * 1.5 -
    input.problems * 2 -
    worstPenalty;
  return parseFloat(score.toFixed(4));
}

function recommendStrategy(summaries: StrategyLabVariantSummary[]): StrategyLabRecommendation {
  const viable = summaries.filter(summary => summary.completed > 0 && summary.failed === 0 && summary.canceled === 0);
  if (viable.length === 0) return null;

  const winner = viable[0]!;
  const readyForPaper =
    winner.paperEligible &&
    winner.totalPnl > 0 &&
    (winner.tradeRate ?? 0) >= 0.2 &&
    winner.problems === 0 &&
    winner.blocked === 0 &&
    (winner.worstPnl ?? 0) >= -2;

  const rationale = [
    `Ranked #1 by safety-weighted score (${winner.score.toFixed(2)}).`,
    `Total PnL ${winner.totalPnl >= 0 ? "+" : ""}$${winner.totalPnl.toFixed(2)} across ${winner.completed}/${winner.runs} completed runs.`,
    `Trade rate ${winner.tradeRate == null ? "---" : `${Math.round(winner.tradeRate * 100)}%`} with ${winner.problems} problems and ${winner.blocked} blocked decisions.`,
  ];

  if (!readyForPaper) {
    if (!winner.paperEligible) {
      rationale.push("Keep this variant in replay tuning because it is not marked paper-eligible.");
    } else {
      rationale.push("Keep in replay tuning before paper mode because the safety gate did not pass.");
    }
  } else {
    rationale.push("Eligible for a paper-mode smoke run under operator supervision.");
  }

  return {
    strategy: winner.strategy,
    label: winner.label,
    score: winner.score,
    readyForPaper,
    rationale,
  };
}

function cloneBatch(batch: StrategyLabBatch): StrategyLabBatch {
  return structuredClone(batch);
}

export class StrategyLabBatchManager {
  private batches = new Map<string, StrategyLabBatch>();
  private cancelRequested = new Set<string>();
  private currentBots = new Map<string, EarlyBird>();

  listStrategies(): string[] {
    return [...new Set(listStrategyVariants().map(variant => variant.strategy))].sort();
  }

  listVariants(): StrategyVariant[] {
    return listStrategyVariants();
  }

  async createBatch(request: StrategyLabBatchRequest): Promise<StrategyLabBatch> {
    const selectedStrategies = [...new Set(request.variants ?? request.strategies ?? [])];
    const selectedFiles = [...new Set(request.files ?? [])];

    if (selectedStrategies.length === 0) throw new Error("At least one strategy variant is required");
    if (selectedFiles.length === 0) throw new Error("At least one replay fixture is required");

    const resolvedSelections = selectedStrategies.map(selection => {
      try {
        return resolveStrategySelection(selection);
      } catch {
        throw new Error(`Unknown strategy variant: ${selection}`);
      }
    });

    const totalRuns = resolvedSelections.length * selectedFiles.length;
    if (totalRuns > MAX_BATCH_RUNS) {
      throw new Error(`Strategy Lab batches are capped at ${MAX_BATCH_RUNS} runs; requested ${totalRuns}`);
    }

    const fixtureMetadata = await Promise.all(selectedFiles.map(file => validateReplayFixture(file)));
    const invalid = fixtureMetadata.find(meta => !meta.replayable);
    if (invalid) {
      throw new Error(`Replay fixture is not replayable: ${invalid.label}${invalid.reason ? ` (${invalid.reason})` : ""}`);
    }

    const runs: StrategyLabRunResult[] = [];
    for (const resolved of resolvedSelections) {
      for (const file of selectedFiles) {
        const fixture = fixtureMetadata.find(meta => meta.path === file);
        runs.push({
          id: crypto.randomUUID(),
          strategy: resolved.selection,
          baseStrategy: resolved.strategyName,
          variantLabel: resolved.variant.label,
          paperEligible: resolved.variant.paperEligible,
          file,
          slug: fixture?.slug ?? null,
          status: "queued",
          pnl: null,
          direction: null,
          openPrice: null,
          closePrice: null,
          counts: { ...EMPTY_COUNTS },
          verdict: null,
        });
      }
    }

    const now = Date.now();
    const batch: StrategyLabBatch = {
      id: crypto.randomUUID(),
      state: "queued",
      createdAtMs: now,
      updatedAtMs: now,
      progress: { totalRuns, completedRuns: 0 },
      runs,
      summary: emptySummary(totalRuns),
    };
    this.batches.set(batch.id, batch);

    setTimeout(() => {
      void this.runBatch(batch.id);
    }, 0);

    return cloneBatch(batch);
  }

  getBatch(batchId: string): StrategyLabBatch | null {
    const batch = this.batches.get(batchId);
    return batch ? cloneBatch(batch) : null;
  }

  cancelBatch(batchId: string): StrategyLabBatch | null {
    const batch = this.batches.get(batchId);
    if (!batch) return null;

    this.cancelRequested.add(batchId);
    this.currentBots.get(batchId)?.startShutdown("Strategy Lab batch canceled.");
    for (const run of batch.runs) {
      if (run.status === "queued" || run.status === "running") {
        run.status = "canceled";
        run.verdict = "failed";
        run.error = "Canceled";
      }
    }
    batch.state = "canceled";
    batch.updatedAtMs = Date.now();
    batch.progress.completedRuns = batch.runs.filter(run => run.status !== "queued" && run.status !== "running").length;
    batch.summary = recomputeSummary(batch);
    return cloneBatch(batch);
  }

  private async runBatch(batchId: string): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch || batch.state === "canceled") return;

    batch.state = "running";
    batch.updatedAtMs = Date.now();

    for (const run of batch.runs) {
      if (this.cancelRequested.has(batchId) || batch.state === "canceled") break;
      if (run.status !== "queued") continue;

      run.status = "running";
      batch.updatedAtMs = Date.now();

      try {
        const clock = new VirtualClock();
        const sink = new CollectingTelemetrySink();
        const bot = new EarlyBird(run.strategy, 1, false, 1, false, run.file, {
          clock,
          persistState: false,
          telemetry: sink,
        });
        this.currentBots.set(batchId, bot);
        const reader = bot.replayReader;
        if (!reader) throw new Error("Replay reader not initialized");

        const runner = new ReplayRunner(reader, bot, clock, sink);
        await runner.run();

        if (run.status !== "canceled") {
          Object.assign(run, deriveResultFromEvents(run, sink.events));
        }
      } catch (error) {
        if (run.status !== "canceled") {
          run.status = "failed";
          run.verdict = "failed";
          run.error = error instanceof Error ? error.message : String(error);
        }
      } finally {
        this.currentBots.delete(batchId);
        batch.progress.completedRuns = batch.runs.filter(item => item.status !== "queued" && item.status !== "running").length;
        batch.summary = recomputeSummary(batch);
        batch.updatedAtMs = Date.now();
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    if (batch.state !== "canceled") {
      batch.state = batch.runs.some(run => run.status === "failed") ? "failed" : "completed";
      batch.progress.completedRuns = batch.runs.length;
      batch.summary = recomputeSummary(batch);
      batch.updatedAtMs = Date.now();
    }
  }
}
