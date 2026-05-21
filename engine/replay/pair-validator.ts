import { readFileSync, existsSync } from "fs";
import { type PairManifest } from "./pair-manifest.ts";
import { StrategyLabBatchManager } from "../strategy-lab.ts";
import { getSlug } from "../../utils/slot.ts";

export async function validatePair(
  slug: string,
  replayLogPath: string,
  rawL2LogPath: string,
  strategy: string,
  metadata: Partial<PairManifest> = {}
): Promise<PairManifest> {
  const parseErrors: string[] = [];
  const validationErrors: string[] = [];
  const validationWarnings: string[] = [];

  let replayEventCount = 0;
  let rawL2EventCount = 0;
  let rawL2BookEventCount = 0;
  let rawL2TradeEventCount = 0;
  let replayFirstEventTsMs: number | null = null;
  let replayLastEventTsMs: number | null = null;
  let rawL2FirstEventTsMs: number | null = null;
  let rawL2LastEventTsMs: number | null = null;

  // Read Replay Log
  if (!existsSync(replayLogPath)) {
    validationErrors.push(`Replay log not found: ${replayLogPath}`);
  } else {
    try {
      const replayContent = readFileSync(replayLogPath, "utf-8");
      const lines = replayContent.split("\n").filter(l => l.trim().length > 0);
      replayEventCount = lines.length;
      if (lines.length > 0) {
        try {
          const firstEvent = JSON.parse(lines[0]!);
          if (firstEvent.ts) replayFirstEventTsMs = firstEvent.ts;
        } catch (e) {
          parseErrors.push(`Failed to parse first replay event: ${e}`);
        }
        try {
          const lastEvent = JSON.parse(lines[lines.length - 1]!);
          if (lastEvent.ts) replayLastEventTsMs = lastEvent.ts;
        } catch (e) {
          parseErrors.push(`Failed to parse last replay event: ${e}`);
        }
      } else {
        validationErrors.push("Replay log is empty");
      }
    } catch (e) {
      parseErrors.push(`Failed to read replay log: ${e}`);
    }
  }

  // Read Raw L2 Log
  if (!existsSync(rawL2LogPath)) {
    validationErrors.push(`Raw L2 log not found: ${rawL2LogPath}`);
  } else {
    try {
      const rawL2Content = readFileSync(rawL2LogPath, "utf-8");
      const lines = rawL2Content.split("\n").filter(l => l.trim().length > 0);
      rawL2EventCount = lines.length;
      
      let firstTs: number | null = null;
      let lastTs: number | null = null;

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          const type = event.eventType;
          if (type === "market_book_snapshot" || type === "market_book_delta") {
            rawL2BookEventCount++;
          } else if (type === "market_trade") {
            rawL2TradeEventCount++;
          }
          if (event.receivedTsMs) {
            if (firstTs === null) firstTs = event.receivedTsMs;
            lastTs = event.receivedTsMs;
          }
        } catch (e) {
          parseErrors.push(`Failed to parse raw L2 event: ${e}`);
          break; // Stop parsing on first error to prevent log spam
        }
      }
      rawL2FirstEventTsMs = firstTs;
      rawL2LastEventTsMs = lastTs;

      if (rawL2EventCount === 0) {
        validationErrors.push("Raw L2 log is empty");
      }
    } catch (e) {
      parseErrors.push(`Failed to read raw L2 log: ${e}`);
    }
  }

  let coverageVerdict: "complete" | "partial" | "missing" | "unknown" = "unknown";
  let coverageLeadMs: number | null = null;
  let coverageTailMs: number | null = null;

  if (replayEventCount === 0 || rawL2EventCount === 0) {
    coverageVerdict = "missing";
  } else if (replayFirstEventTsMs !== null && replayLastEventTsMs !== null && rawL2FirstEventTsMs !== null && rawL2LastEventTsMs !== null) {
    coverageLeadMs = replayFirstEventTsMs - rawL2FirstEventTsMs;
    coverageTailMs = rawL2LastEventTsMs - replayLastEventTsMs;

    if (rawL2FirstEventTsMs <= replayFirstEventTsMs && rawL2LastEventTsMs >= replayLastEventTsMs) {
      coverageVerdict = "complete";
    } else {
      coverageVerdict = "partial";
    }
  }

  let strategyLabEvidenceVerdict: "usable" | "unavailable_no_fills" | "unavailable_missing_mapping" | "unavailable_missing_l2" | "failed" = "failed";

  if (validationErrors.length === 0 && parseErrors.length === 0) {
    try {
      const manager = new StrategyLabBatchManager();
      const batch = await manager.createBatch({
        strategies: [strategy],
        files: [replayLogPath],
        l2Files: { [replayLogPath]: rawL2LogPath }
      });

      // Wait for batch to complete
      let waitLimit = 600; // 60 seconds max
      let finishedBatch = manager.getBatch(batch.id);
      while (finishedBatch && (finishedBatch.state === "running" || finishedBatch.state === "queued") && waitLimit > 0) {
        await new Promise(r => setTimeout(r, 100));
        finishedBatch = manager.getBatch(batch.id);
        waitLimit--;
      }

      if (finishedBatch && finishedBatch.state === "completed") {
        const run = finishedBatch.runs[0];
        if (run && run.status === "completed") {
          const cFill = run.execution.conservativeFill;
          if (!cFill.conservativeFillEvidenceAvailable) {
            strategyLabEvidenceVerdict = "unavailable_missing_l2";
          } else if (cFill.eligibleFillCount === 0) {
            strategyLabEvidenceVerdict = "unavailable_no_fills";
          } else if (cFill.conservativeFillUnavailableReasons.unmatched_intent_id || 
                     cFill.conservativeFillUnavailableReasons.ambiguous_intent_mapping || 
                     cFill.conservativeFillUnavailableReasons.missing_intent_mapping) {
            strategyLabEvidenceVerdict = "unavailable_missing_mapping";
            validationWarnings.push("Fills occurred but mapping was incomplete or ambiguous.");
          } else if (cFill.usableEvidenceCount > 0) {
            strategyLabEvidenceVerdict = "usable";
          } else {
            // Fills existed, mapping worked, but no fills were scored as usable (e.g. unknown insufficient data, or touch_only)
            // Still usable evidence (even if verdict is 0), but we can call it usable.
            strategyLabEvidenceVerdict = "usable";
          }
        } else if (run && run.status === "failed") {
          // @ts-ignore - we don't have full type definition but it might have an error property
          validationErrors.push(`Run failed: ${run.error || run.execution?.error || "unknown"}`);
        }
      } else {
        validationErrors.push(`Strategy Lab batch failed or timed out. State: ${finishedBatch ? finishedBatch.state : "missing"}`);
      }
    } catch (e: any) {
      validationErrors.push(`Strategy Lab validation threw: ${e.message}`);
    }
  }

  return {
    slug,
    replayLogPath,
    rawL2LogPath,
    strategy,
    slotStartMs: metadata.slotStartMs ?? 0,
    slotEndMs: metadata.slotEndMs ?? 0,
    captureStartedAtMs: metadata.captureStartedAtMs ?? 0,
    captureEndedAtMs: metadata.captureEndedAtMs ?? 0,
    runtimeStartedAtMs: metadata.runtimeStartedAtMs ?? 0,
    runtimeEndedAtMs: metadata.runtimeEndedAtMs ?? 0,
    recorderStartedAtMs: metadata.recorderStartedAtMs ?? 0,
    recorderEndedAtMs: metadata.recorderEndedAtMs ?? 0,
    runtimeExitCode: metadata.runtimeExitCode ?? null,
    recorderExitCode: metadata.recorderExitCode ?? null,
    replayEventCount,
    rawL2EventCount,
    rawL2BookEventCount,
    rawL2TradeEventCount,
    replayFirstEventTsMs,
    replayLastEventTsMs,
    rawL2FirstEventTsMs,
    rawL2LastEventTsMs,
    coverageLeadMs,
    coverageTailMs,
    parseErrors,
    validationErrors,
    validationWarnings,
    coverageVerdict,
    strategyLabEvidenceVerdict,
    gitCommit: metadata.gitCommit ?? "unknown",
    commands: metadata.commands ?? [],
    validatedAtMs: Date.now(),
    createdAtMs: metadata.createdAtMs ?? Date.now(),
  };
}
