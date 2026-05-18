import { describe, expect, test } from "bun:test";
import { LiveReadinessManager, stableConfigHash, type ExperimentRequest } from "../../engine/live-readiness.ts";
import type { StrategyLabBatch } from "../../engine/strategy-lab.ts";

function completedBatch(id: string, strategy = "simulation"): StrategyLabBatch {
  return {
    id,
    state: "completed",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    progress: { totalRuns: 1, completedRuns: 1 },
    runs: [],
    summary: {
      totalRuns: 1,
      completed: 1,
      failed: 0,
      canceled: 0,
      winRate: 1,
      totalPnl: 1,
      avgPnl: 1,
      bestPnl: 1,
      worstPnl: 1,
      blocked: 0,
      problems: 0,
      byStrategy: [],
      recommendation: {
        strategy,
        label: strategy,
        score: 20,
        readyForPaper: true,
        rationale: ["Test recommendation."],
      },
    },
  };
}

class FakeStrategyLab {
  batches = new Map<string, StrategyLabBatch>();

  async createBatch(_request: { variants?: string[]; files: string[] }) {
    const batch = completedBatch(`batch-${this.batches.size + 1}`);
    this.batches.set(batch.id, batch);
    return batch;
  }

  getBatch(id: string) {
    return this.batches.get(id) ?? null;
  }
}

describe("LiveReadinessManager", () => {
  test("lists built-in strategy modules with live disabled by default", async () => {
    const manager = new LiveReadinessManager(new FakeStrategyLab() as any);
    const modules = await manager.listModules();
    expect(modules.some(module => module.id === "simulation")).toBe(true);
    expect(modules.every(module => module.liveEligible === false)).toBe(true);
  });

  test("rejects unsafe custom strategy module validation", async () => {
    const manager = new LiveReadinessManager(new FakeStrategyLab() as any);
    const result = await manager.validateModule({
      id: "unsafe",
      sourceCode: "export const module = { evaluate() { return process.env.SECRET; } };",
    });
    expect(result.success).toBe(false);
    expect(result.errors.join(" ")).toMatch(/process\.env/);
  });

  test("creates an experiment recommendation from completed train and holdout batches", async () => {
    const manager = new LiveReadinessManager(new FakeStrategyLab() as any);
    const request: ExperimentRequest = {
      variants: ["simulation"],
      files: ["logs/train.log"],
      holdoutFiles: ["logs/holdout.log"],
    };
    const experiment = await manager.createExperiment(request);

    for (let attempt = 0; attempt < 20; attempt++) {
      const current = manager.getExperiment(experiment.id);
      if (current?.state === "completed") {
        expect(current.recommendation?.readyForPaper).toBe(true);
        expect(current.recommendation?.rationale.some(item => item.includes("holdout"))).toBe(true);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Timed out waiting for fake experiment");
  });

  test("tiny-live promotion requires a paper candidate and paper approval", () => {
    const manager = new LiveReadinessManager(new FakeStrategyLab() as any);
    const report = manager.evaluatePromotion({
      id: "draft",
      moduleId: "simulation",
      label: "Draft",
      config: {},
      configHash: stableConfigHash({}),
      riskProfile: "simulation",
      notes: "",
      promotionStatus: "draft",
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });

    expect(report.tinyLiveEligible).toBe(false);
    expect(report.reasons.length).toBeGreaterThan(0);
  });
});
