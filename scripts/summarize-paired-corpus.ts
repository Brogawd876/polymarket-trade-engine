import { readdirSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";
import { type PairManifest } from "../engine/replay/pair-manifest.ts";

function main() {
  const args = process.argv.slice(2);
  let pairsDir = "data/pairs";
  let outPath = "AI_WORKSPACE/PHASE8G_PAIRED_CORPUS_REPORT.md";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pairs") pairsDir = args[++i] || pairsDir;
    else if (args[i] === "--out") outPath = args[++i] || outPath;
  }

  const files = readdirSync(pairsDir).filter(f => f.endsWith(".pair.json"));
  const manifests: PairManifest[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(path.join(pairsDir, file), "utf-8");
      manifests.push(JSON.parse(content) as PairManifest);
    } catch (e) {
      console.error(`Failed to read/parse ${file}:`, e);
    }
  }

  let totalCaptures = manifests.length;
  let validPairs = 0;
  let invalidPairs = 0;
  let completeCoverage = 0;
  let incompleteCoverage = 0;
  let usableEvidence = 0;
  let noFills = 0;
  let insufficientData = 0;
  let missingMapping = 0;
  let failedSL = 0;

  for (const m of manifests) {
    if (m.pairValidity === "valid") validPairs++;
    else invalidPairs++;

    if (m.coverageVerdict === "complete") completeCoverage++;
    else incompleteCoverage++;

    switch (m.strategyLabEvidenceVerdict) {
      case "usable": usableEvidence++; break;
      case "unavailable_no_fills": noFills++; break;
      case "unavailable_insufficient_data": insufficientData++; break;
      case "unavailable_missing_mapping": missingMapping++; break;
      default: failedSL++; break;
    }
  }

  const md = [
    `# Phase 8G Paired Corpus Report`,
    ``,
    `## Aggregate Counts`,
    `- **Total captures attempted:** ${totalCaptures}`,
    `- **Total valid pairs:** ${validPairs}`,
    `- **Invalid pairs:** ${invalidPairs}`,
    `- **Complete coverage count:** ${completeCoverage}`,
    `- **Partial/Missing/Unknown coverage count:** ${incompleteCoverage}`,
    `- **Usable evidence count:** ${usableEvidence}`,
    `- **Unavailable (No Fills) count:** ${noFills}`,
    `- **Unavailable (Insufficient Data) count:** ${insufficientData}`,
    `- **Unavailable (Missing Mapping) count:** ${missingMapping}`,
    `- **Failed SL Evaluation count:** ${failedSL}`,
    ``,
    `## Corpus Summary Table`,
    ``,
    `| Slug | Strategy | Validity | Coverage | SL Verdict | Replay Ev | L2 Ev (Book/Trade) | Errors/Warnings |`,
    `|------|----------|----------|----------|------------|-----------|---------------------|-----------------|`
  ];

  for (const m of manifests) {
    md.push(`| ${m.slug} | ${m.strategy} | ${m.pairValidity} | ${m.coverageVerdict} | ${m.strategyLabEvidenceVerdict} | ${m.replayEventCount} | ${m.rawL2EventCount} (${m.rawL2BookEventCount}/${m.rawL2TradeEventCount}) | ${m.parseErrors.length + m.validationErrors.length} / ${m.validationWarnings.length} |`);
  }

  md.push(``, `## Interpretation`);
  md.push(`- **What the corpus proves:** The evaluation plumbing works correctly to pair live shadows with L2 data.`);
  md.push(`- **What it does not prove:** Any profitability claim. We are still establishing the data foundation.`);
  md.push(`- **Data missing:** We need to ensure strategies are actually taking trades so we have sufficient usable evidence for markout reporting.`);
  
  md.push(``, `## Next Recommendation`);
  md.push(`Proceed to run Strategy Lab paired corpus batch over these generated datasets, or capture more if usable evidence is low.`);

  writeFileSync(outPath, md.join("\n"));
  console.log(`Wrote summary to ${outPath}`);
}

main();
