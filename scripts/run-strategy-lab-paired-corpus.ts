import { readdirSync, readFileSync, existsSync } from "fs";
import * as path from "path";
import { type PairManifest } from "../engine/replay/pair-manifest.ts";
import { StrategyLabBatchManager } from "../engine/strategy-lab.ts";

import { shouldTimeout } from "./paired-corpus-utils.ts";

async function main() {
  const args = process.argv.slice(2);
  let pairsDir = "data/pairs";
  let variants = ["late-entry", "late-entry-flow-aware", "fair-value-maker"];
  let timeoutMs = 120000;
  let allowPartial = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pairs") pairsDir = args[++i] || pairsDir;
    else if (args[i] === "--timeout-ms") timeoutMs = parseInt(args[++i] || String(timeoutMs), 10);
    else if (args[i] === "--allow-partial") allowPartial = true;
    else if (args[i] === "--variants") {
      variants = [];
      while (i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
        variants.push(args[++i] as string);
      }
    }
  }

  if (!existsSync(pairsDir)) {
    console.error(`Pairs directory not found: ${pairsDir}`);
    process.exit(1);
  }

  const files = readdirSync(pairsDir).filter(f => f.endsWith(".pair.json"));
  const validManifests: PairManifest[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(path.join(pairsDir, file), "utf-8");
      const manifest = JSON.parse(content) as PairManifest;
      if (manifest.pairValidity === "valid") {
        validManifests.push(manifest);
      }
    } catch (e) {
      console.error(`Failed to read/parse ${file}:`, e);
    }
  }

  if (validManifests.length === 0) {
    console.log("No valid paired manifests found to run.");
    process.exit(0);
  }

  const replayFiles = validManifests.map(m => m.replayLogPath);
  const l2Files = Object.fromEntries(validManifests.map(m => [m.replayLogPath, m.rawL2LogPath]));

  console.log(`Running Strategy Lab on ${validManifests.length} valid pairs for variants: ${variants.join(", ")}`);
  
  const manager = new StrategyLabBatchManager();
  
  const initialBatch = await manager.createBatch({
    variants,
    files: replayFiles,
    l2Files,
  });

  let batch = initialBatch;
  const startMs = Date.now();
  let timedOut = false;

  while (batch.state === "queued" || batch.state === "running") {
    if (shouldTimeout(startMs, timeoutMs)) {
      timedOut = true;
      manager.cancelBatch(batch.id);
      batch = manager.getBatch(batch.id) ?? batch;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
    batch = manager.getBatch(batch.id) ?? batch;
    process.stdout.write(`\r[Strategy Lab] ${batch.progress.completedRuns} / ${batch.progress.totalRuns} runs completed...`);
  }

  if (timedOut) {
    console.log(`\n\n[ERROR] Strategy Lab Batch Timed Out!`);
    console.log(`Completed runs: ${batch.progress.completedRuns} / ${batch.progress.totalRuns}`);
    if (!allowPartial) process.exit(1);
  } else {
    console.log(`\n\nStrategy Lab Batch Completed. State: ${batch.state}`);
  }
  
  console.log(`\n--- Aggregate Summary ---`);
  console.log(`Total Runs: ${batch.summary.totalRuns}`);
  console.log(`Total PnL: $${batch.summary.totalPnl}`);
  console.log(`Win Rate: ${batch.summary.winRate ? (batch.summary.winRate * 100).toFixed(1) + "%" : "N/A"}`);

  console.log(`\n--- Fill Evidence Summary ---`);
  for (const vSummary of batch.summary.byStrategy) {
    console.log(`\nVariant: ${vSummary.label}`);
    console.log(`  PnL: $${vSummary.totalPnl}`);
    console.log(`  Trades: ${vSummary.tradeCount}`);
    console.log(`  Conservative Fill Evidence:`);
    console.log(`    Usable Fills: ${vSummary.conservativeFill.usableEvidenceCount} / ${vSummary.conservativeFill.evaluatedFillCount}`);
    console.log(`    No Fill: ${vSummary.conservativeFill.noFillCount}`);
    console.log(`    Insufficient Data: ${vSummary.conservativeFill.unknownInsufficientDataCount}`);
    console.log(`    Markout 5s Avg: ${vSummary.conservativeFill.avgMarkout5s ?? "N/A"}`);
    console.log(`    Adverse Selection Rate: ${vSummary.conservativeFill.adverseSelectionRate ? (vSummary.conservativeFill.adverseSelectionRate * 100).toFixed(1) + "%" : "N/A"}`);
  }
}

main().catch(console.error);
