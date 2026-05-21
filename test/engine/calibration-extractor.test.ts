import { expect, test, describe } from "bun:test";
import { extractCalibrationRecords } from "../../engine/replay/calibration-extractor.ts";
import type { StrategyLabBatch, StrategyLabRunResult } from "../../engine/strategy-lab.ts";
import type { PairManifest } from "../../engine/replay/pair-manifest.ts";

describe("CalibrationExtractor", () => {
  test("generates records from a minimal valid Strategy Lab result", () => {
    const run: StrategyLabRunResult = {
      id: "run-1",
      strategy: "test-strat",
      baseStrategy: "test-strat",
      variantLabel: "Test Variant",
      paperEligible: false,
      file: "test.log",
      slug: "test-slug",
      status: "completed",
      pnl: 0,
      direction: "UP",
      openPrice: null,
      closePrice: null,
      counts: { intents: 1, allowed: 1, blocked: 0, fills: 1, problems: 0, settlements: 1 },
      verdict: "win",
      brierScore: null,
      logLoss: null,
      execution: {
        fillRate: 1,
        cancelRate: 0,
        takerFeeSpend: 0,
        makerRebateEstimate: 0,
        grossEdgeCapture: null,
        turnover: 100,
        maxDrawdown: 0,
        markouts: { oneSecond: null, fiveSecond: null, thirtySecond: null, settlement: null, samples: 0, unavailableCount: 0, unavailableReasons: {} },
        conservativeFill: {
          conservativeFillEvidenceAvailable: true,
          conservativeFillEvidenceSource: "raw_l2_event_store",
          conservativeFillVerdictCounts: { no_fill: 0, touch_only: 0, probable_fill: 1, trade_through_fill: 0, unknown_insufficient_data: 0 },
          conservativeFillUnavailableReasons: {},
          conservativeMarkout1sAvg: 0.01,
          conservativeMarkout5sAvg: 0.02,
          conservativeMarkout30sAvg: 0.03,
          conservativeAdverseSelectionRate: 0,
          usableEvidenceCount: 1,
          evaluatedFillCount: 1,
          eligibleFillCount: 1,
          evidence: [
            {
              orderId: "ord-1",
              tokenId: "token-1",
              action: "buy",
              side: "UP",
              price: 0.5,
              shares: 100,
              placedTsMs: 1000,
              verdict: "probable_fill",
              markouts: { "1s": 0.01, "5s": 0.02, "30s": 0.03 },
              adverseSelection: false,
            }
          ]
        }
      }
    };

    const batch: StrategyLabBatch = {
      id: "batch-1",
      state: "completed",
      createdAtMs: 0,
      updatedAtMs: 0,
      progress: { totalRuns: 1, completedRuns: 1 },
      runs: [run],
      summary: {} as any
    };

    const manifests = new Map<string, PairManifest>();
    manifests.set("test-slug", {
      slug: "test-slug",
      pairValidity: "valid",
      coverage: "complete",
      replayLogPath: "test.log",
      rawL2LogPath: "test.l2",
      events: {} as any,
      recorderStopReason: "completed"
    });

    const records = extractCalibrationRecords(batch, manifests);
    expect(records.length).toBe(1);
    expect(records[0]!.slug).toBe("test-slug");
    expect(records[0]!.strategy).toBe("test-strat");
    expect(records[0]!.variantName).toBe("Test Variant");
    expect(records[0]!.fillPrice).toBe(0.5);
    expect(records[0]!.dataQuality.hasMarketTradeEvidence).toBe(true);
    expect(records[0]!.dataQuality.hasMarkout1s).toBe(true);
    expect(records[0]!.dataQuality.missingReasons.length).toBe(0);
  });

  test("handles missing markouts", () => {
    const run: StrategyLabRunResult = {
      id: "run-2",
      strategy: "test",
      baseStrategy: "test",
      variantLabel: "Test",
      paperEligible: false,
      file: "test2.log",
      slug: "test-slug-2",
      status: "completed",
      pnl: 0, direction: null, openPrice: null, closePrice: null,
      counts: { intents: 0, allowed: 0, blocked: 0, fills: 0, problems: 0, settlements: 0 },
      verdict: "flat",
      brierScore: null, logLoss: null,
      execution: {
        fillRate: 0, cancelRate: 0, takerFeeSpend: 0, makerRebateEstimate: 0, grossEdgeCapture: null, turnover: 0, maxDrawdown: 0,
        markouts: { oneSecond: null, fiveSecond: null, thirtySecond: null, settlement: null, samples: 0, unavailableCount: 0, unavailableReasons: {} },
        conservativeFill: {
          conservativeFillEvidenceAvailable: true,
          conservativeFillEvidenceSource: "raw_l2_event_store",
          conservativeFillVerdictCounts: { no_fill: 0, touch_only: 0, probable_fill: 0, trade_through_fill: 0, unknown_insufficient_data: 0 },
          conservativeFillUnavailableReasons: {},
          conservativeMarkout1sAvg: null, conservativeMarkout5sAvg: null, conservativeMarkout30sAvg: null, conservativeAdverseSelectionRate: null,
          usableEvidenceCount: 1, evaluatedFillCount: 1, eligibleFillCount: 1,
          evidence: [
            {
              orderId: "ord-2", tokenId: "token-2", action: "buy", side: "DOWN", price: 0.1, shares: 10, placedTsMs: 2000,
              verdict: "no_fill",
              markouts: { "1s": null, "5s": null, "30s": null },
              adverseSelection: null,
            }
          ]
        }
      }
    };
    const batch: StrategyLabBatch = {
      id: "batch-2", state: "completed", createdAtMs: 0, updatedAtMs: 0,
      progress: { totalRuns: 1, completedRuns: 1 },
      runs: [run], summary: {} as any
    };
    const records = extractCalibrationRecords(batch, new Map());
    expect(records.length).toBe(1);
    expect(records[0]!.dataQuality.hasMarketTradeEvidence).toBe(false);
    expect(records[0]!.dataQuality.hasMarkout1s).toBe(false);
    expect(records[0]!.dataQuality.missingReasons).toContain("missing_markout_1s");
    expect(records[0]!.dataQuality.missingReasons).toContain("missing_markout_5s");
    expect(records[0]!.dataQuality.missingReasons).toContain("missing_markout_30s");
  });
});
