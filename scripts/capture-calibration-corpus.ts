import { parseArgs } from "util";
import { spawn } from "child_process";
import { mkdirSync, existsSync, writeFileSync, readdirSync, readFileSync } from "fs";
import * as path from "path";
import { gitCommitFromEnv } from "../engine/event-store/events.ts";
import { summarizeCorpusQuality } from "../engine/replay/corpus-quality.ts";
import type { PairManifest } from "../engine/replay/pair-manifest.ts";

const { values } = parseArgs({
  args: Bun.argv,
  options: {
    strategy: { type: "string", default: "fair-value-maker" },
    "rounds-per-capture": { type: "string", default: "1" },
    "target-valid-pairs": { type: "string", default: "20" },
    "max-attempts": { type: "string", default: "30" },
    "slot-offset": { type: "string", default: "1" },
    "strategy-lab-timeout-ms": { type: "string", default: "180000" },
    "capture-gap-ms": { type: "string", default: "0" },
    "out-dir": { type: "string" },
    variants: { type: "string", multiple: true, default: ["late-entry", "late-entry-flow-aware", "fair-value-maker"] },
    "dry-run": { type: "boolean" },
    "skip-capture": { type: "boolean" },
    "reuse-existing-pairs": { type: "string" },
    "stop-after-readiness-pass": { type: "boolean", default: false },
  },
  strict: true,
  allowPositionals: true,
});

async function runProcess(cmd: string, args: string[]): Promise<{ code: number | null }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("close", (code) => resolve({ code }));
    p.on("error", () => resolve({ code: null }));
  });
}

async function main() {
  const timestamp = Date.now();
  const outDir = values["out-dir"] || `data/corpus-runs/${timestamp}`;
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const maxAttempts = parseInt(values["max-attempts"] as string, 10);
  const targetValidPairs = parseInt(values["target-valid-pairs"] as string, 10);
  let slotOffset = parseInt(values["slot-offset"] as string, 10);
  const captureGapMs = parseInt(values["capture-gap-ms"] as string, 10);
  
  let validPairs = 0;
  let invalidPairs = 0;
  let failedCaptures = 0;
  let attempts = 0;
  let skippedPairs = 0;

  const runStartedAtMs = Date.now();
  const pairsDir = "data/pairs";

  if (values["reuse-existing-pairs"]) {
    const reuseDir = values["reuse-existing-pairs"] as string;
    if (existsSync(reuseDir)) {
      const files = readdirSync(reuseDir).filter(f => f.endsWith(".pair.json"));
      for (const f of files) {
        try {
          const m = JSON.parse(readFileSync(path.join(reuseDir, f), "utf8")) as PairManifest;
          if (m.pairValidity === "valid") validPairs++;
          else invalidPairs++;
          skippedPairs++;
        } catch {}
      }
    }
  }

  while (attempts < maxAttempts && validPairs < targetValidPairs) {
    attempts++;
    console.log(`\n=== Capture Attempt ${attempts} / ${maxAttempts} ===`);
    console.log(`Target: ${validPairs} / ${targetValidPairs} valid pairs`);

    if (values["dry-run"]) {
      console.log(`[Dry Run] Simulating capture...`);
      validPairs++;
    } else if (values["skip-capture"]) {
      console.log(`[Skip Capture] Skipping actual capture process...`);
    } else {
      const cmdArgs = [
        "scripts/capture-paired-replay-l2.ts",
        "--strategy", values.strategy as string,
        "--rounds", values["rounds-per-capture"] as string,
        "--slot-offset", slotOffset.toString(),
        "--strategy-lab-timeout-ms", values["strategy-lab-timeout-ms"] as string,
      ];
      
      const res = await runProcess("bun", cmdArgs);
      
      if (res.code !== 0) {
        console.error(`Capture failed with code ${res.code}`);
        failedCaptures++;
      } else {
        // Recount
        validPairs = 0;
        invalidPairs = 0;
        if (existsSync(pairsDir)) {
          const files = readdirSync(pairsDir).filter(f => f.endsWith(".pair.json"));
          for (const f of files) {
            try {
              const m = JSON.parse(readFileSync(path.join(pairsDir, f), "utf8")) as PairManifest;
              if (m.pairValidity === "valid") validPairs++;
              else invalidPairs++;
            } catch {}
          }
        }
      }
    }

    if (captureGapMs > 0 && attempts < maxAttempts && validPairs < targetValidPairs) {
      console.log(`Waiting ${captureGapMs}ms before next capture...`);
      await new Promise(r => setTimeout(r, captureGapMs));
    }
    
    slotOffset++;
  }

  const runEndedAtMs = Date.now();
  
  console.log(`\n=== Corpus Expansion Complete ===`);
  console.log(`Attempts: ${attempts}`);
  console.log(`Valid Pairs: ${validPairs}`);
  
  const summaryJsonPath = path.join(outDir, "corpus-summary.json");
  const summaryMdPath = path.join(outDir, "corpus-summary.md");

  const manifests = [];
  if (existsSync(pairsDir)) {
    const files = readdirSync(pairsDir).filter(f => f.endsWith(".pair.json"));
    for (const f of files) {
      const p = path.join(pairsDir, f);
      manifests.push({ path: p, manifest: JSON.parse(readFileSync(p, "utf8")) });
    }
  }

  const quality = summarizeCorpusQuality(manifests);

  const summary = {
    runStartedAtMs,
    runEndedAtMs,
    gitCommit: gitCommitFromEnv(),
    commands: process.argv,
    attempts,
    validPairs,
    invalidPairs,
    failedCaptures,
    skippedPairs,
    totalReplayEvents: manifests.reduce((acc, m) => acc + m.manifest.replayEventCount, 0),
    totalRawL2Events: manifests.reduce((acc, m) => acc + m.manifest.rawL2EventCount, 0),
    totalMarketTradeEvents: quality.totalRawL2TradeEvents,
    totalCalibrationRecords: 0,
    totalTradePrintBackedRecords: 0,
    variants: values.variants,
    perPairStatus: manifests.map(m => ({ slug: m.manifest.slug, valid: m.manifest.pairValidity })),
    readinessGateResult: null,
    nextRecommendedAction: validPairs >= targetValidPairs ? "Run offline calibration pipeline." : "Continue gathering data.",
  };

  writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2));

  let md = `# Corpus Expansion Summary\n`;
  md += `- Started: ${new Date(runStartedAtMs).toISOString()}\n`;
  md += `- Ended: ${new Date(runEndedAtMs).toISOString()}\n`;
  md += `- Valid Pairs: ${validPairs}\n`;
  md += `- Invalid Pairs: ${invalidPairs}\n`;
  md += `- Failed Captures: ${failedCaptures}\n`;
  md += `- Total Market Trade Events: ${summary.totalMarketTradeEvents}\n`;
  md += `- Total Raw L2 Events: ${summary.totalRawL2Events}\n`;
  md += `- Total Replay Events: ${summary.totalReplayEvents}\n`;
  md += `- Next Recommended Action: ${summary.nextRecommendedAction}\n`;
  
  writeFileSync(summaryMdPath, md);
  console.log(`Summary written to ${outDir}`);
}

main().catch(console.error);
