import { EarlyBird } from "./early-bird.ts";
import { ReplayRunner, VirtualClock, type TelemetryEvent, type TelemetrySink } from "./bot-core/index.ts";
import { strategies } from "./strategy/index.ts";
import { validateReplayFixture } from "./server/helpers/replay-fixtures.ts";

export type StrategyLabBatchState = "queued" | "running" | "completed" | "failed" | "canceled";
export type StrategyLabRunStatus = "queued" | "running" | "completed" | "failed" | "canceled";
export type StrategyLabVerdict = "win" | "loss" | "flat" | "no_trade" | "blocked" | "failed";

export type StrategyLabBatchRequest = {
  strategies: string[];
  files: string[];
};

export type StrategyLabRunResult = {
  id: string;
  strategy: string;
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
    return Object.keys(strategies).sort();
  }

  async createBatch(request: StrategyLabBatchRequest): Promise<StrategyLabBatch> {
    const selectedStrategies = [...new Set(request.strategies ?? [])];
    const selectedFiles = [...new Set(request.files ?? [])];

    if (selectedStrategies.length === 0) throw new Error("At least one strategy is required");
    if (selectedFiles.length === 0) throw new Error("At least one replay fixture is required");

    const unknown = selectedStrategies.filter(strategy => !strategies[strategy]);
    if (unknown.length > 0) throw new Error(`Unknown strategy: ${unknown.join(", ")}`);

    const totalRuns = selectedStrategies.length * selectedFiles.length;
    if (totalRuns > MAX_BATCH_RUNS) {
      throw new Error(`Strategy Lab batches are capped at ${MAX_BATCH_RUNS} runs; requested ${totalRuns}`);
    }

    const fixtureMetadata = await Promise.all(selectedFiles.map(file => validateReplayFixture(file)));
    const invalid = fixtureMetadata.find(meta => !meta.replayable);
    if (invalid) {
      throw new Error(`Replay fixture is not replayable: ${invalid.label}${invalid.reason ? ` (${invalid.reason})` : ""}`);
    }

    const runs: StrategyLabRunResult[] = [];
    for (const strategy of selectedStrategies) {
      for (const file of selectedFiles) {
        const fixture = fixtureMetadata.find(meta => meta.path === file);
        runs.push({
          id: crypto.randomUUID(),
          strategy,
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
