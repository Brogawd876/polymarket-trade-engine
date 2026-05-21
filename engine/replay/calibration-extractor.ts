import type { StrategyLabBatch } from "../strategy-lab.ts";
import type { PairManifest } from "./pair-manifest.ts";

export type CalibrationRecord = {
  schemaVersion: 1;
  pairManifestPath: string;
  slug: string;
  strategy: string;
  variantName?: string;

  tokenId?: string;
  side?: "UP" | "DOWN" | "unknown";

  quoteTsMs?: number;
  fillTsMs?: number;
  decisionTsMs?: number;
  timeToCloseMs?: number;

  quotedPrice?: number;
  fillPrice?: number;
  bestBid?: number | null;
  bestAsk?: number | null;
  mid?: number | null;
  spread?: number | null;

  predictedProbability?: number | null;
  calibratedProbability?: null;

  markout1s?: number | null;
  markout5s?: number | null;
  markout30s?: number | null;
  settlementMarkout?: number | null;

  conservativeFillVerdict?: string;
  adverseSelection?: boolean | null;
  pnlContribution?: number | null;

  dataQuality: {
    hasMarketTradeEvidence: boolean;
    hasBookEvidence: boolean;
    hasMarkout1s: boolean;
    hasMarkout5s: boolean;
    hasMarkout30s: boolean;
    missingReasons: string[];
  };
};

export function extractCalibrationRecords(
  batch: StrategyLabBatch,
  manifests: Map<string, PairManifest>
): CalibrationRecord[] {
  const records: CalibrationRecord[] = [];

  for (const run of batch.runs) {
    if (run.status !== "completed") continue;
    
    // Find corresponding manifest
    const manifest = [...manifests.values()].find(m => m.slug === run.slug);
    const pairManifestPath = manifest ? `data/pairs/${manifest.slug}.pair.json` : "unknown";

    const evidenceList = run.execution.conservativeFill.evidence || [];

    for (const evidence of evidenceList) {
      const missingReasons: string[] = [];
      if (evidence.markouts["1s"] === null) missingReasons.push("missing_markout_1s");
      if (evidence.markouts["5s"] === null) missingReasons.push("missing_markout_5s");
      if (evidence.markouts["30s"] === null) missingReasons.push("missing_markout_30s");

      records.push({
        schemaVersion: 1,
        pairManifestPath,
        slug: run.slug || "unknown",
        strategy: run.strategy,
        variantName: run.variantLabel,

        tokenId: evidence.tokenId,
        side: evidence.side,

        fillTsMs: evidence.placedTsMs, // We use placed time as the fill time approximation in replay
        
        fillPrice: evidence.price,
        bestBid: null,
        bestAsk: null,
        mid: null,
        spread: null,

        predictedProbability: null,
        calibratedProbability: null,

        markout1s: evidence.markouts["1s"],
        markout5s: evidence.markouts["5s"],
        markout30s: evidence.markouts["30s"],
        settlementMarkout: null,

        conservativeFillVerdict: evidence.verdict,
        adverseSelection: evidence.adverseSelection,
        pnlContribution: null, // Detailed PnL per fill is not yet computed in strategy lab

        dataQuality: {
          hasMarketTradeEvidence: evidence.verdict === "trade_through_fill" || evidence.verdict === "probable_fill",
          hasBookEvidence: true,
          hasMarkout1s: evidence.markouts["1s"] !== null,
          hasMarkout5s: evidence.markouts["5s"] !== null,
          hasMarkout30s: evidence.markouts["30s"] !== null,
          missingReasons,
        }
      });
    }
  }

  return records;
}
