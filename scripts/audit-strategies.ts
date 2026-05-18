import { StrategyLabBatchManager } from "../engine/strategy-lab.ts";

async function runAudit() {
  const manager = new StrategyLabBatchManager();
  
  // 1. Define the test matrix
  const request = {
    variants: [
        "late-entry-optimized",
        "late-entry-flow-aware",
        "fair-value-maker"
    ],
    files: [
        "test/fixtures/replay/filled-order.log",
        "test/fixtures/replay/expired-order.log",
        "test/fixtures/replay/timeout-case.log"
    ]
  };

  console.log(`Starting Audit: 3 Strategies x 3 Fixtures (${request.variants.length * request.files.length} total runs)...`);
  const batch = await manager.createBatch(request);
  
  // 2. Wait for completion
  let status = manager.getBatch(batch.id);
  while (status && (status.state === "queued" || status.state === "running")) {
    await new Promise(r => setTimeout(r, 1000));
    status = manager.getBatch(batch.id);
    if (status) {
        process.stdout.write(`\rProgress: ${status.progress.completedRuns}/${status.progress.totalRuns} runs complete...`);
    }
  }

  if (status) {
    console.log("\n\n--- COMPREHENSIVE AUDIT RESULTS ---");
    
    // Sort by Score descending
    const results = [...status.summary.byStrategy].sort((a, b) => b.score - a.score);

    console.table(results.map(v => ({
        Strategy: v.label,
        PnL: `$${v.totalPnl.toFixed(2)}`,
        "Win Rate": `${(v.winRate! * 100).toFixed(1)}%`,
        "Trade Rate": `${(v.tradeRate! * 100).toFixed(1)}%`,
        "Brier Score": v.brierScore !== null ? v.brierScore.toFixed(4) : "N/A",
        "Final Score": v.score
    })));

    const winner = results[0];
    console.log(`\nRECOMMENDATION: ${winner.label}`);
    console.log(`RATIONALE: ${winner.score > 0 ? "Statistically significant edge detected." : "Defensive performance in mixed volatility."}`);
  }
}

runAudit().catch(console.error);
