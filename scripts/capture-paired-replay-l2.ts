import { spawn, type ChildProcess } from "child_process";
import { getSlug, getSlotTS } from "../utils/slot.ts";
import { validatePair } from "../engine/replay/pair-validator.ts";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import * as path from "path";
import { gitCommitFromEnv } from "../engine/event-store/events.ts";

function execProcess(
  cmd: string, 
  args: string[], 
  onStdout?: (data: string) => void,
  onStderr?: (data: string) => void
): { process: ChildProcess; promise: Promise<{ code: number | null; signal: string | null }> } {
  const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] }); // Enable stdin
  const promise = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    p.stdout.on("data", (b) => {
      const s = b.toString();
      if (onStdout) onStdout(s);
      else process.stdout.write(s);
    });
    p.stderr.on("data", (b) => {
      const s = b.toString();
      if (onStderr) onStderr(s);
      else process.stderr.write(s);
    });
    p.on("close", (code, signal) => resolve({ code, signal }));
    p.on("error", () => resolve({ code: null, signal: null }));
  });
  return { process: p, promise };
}

async function main() {
  const args = process.argv.slice(2);
  let strategy = "late-entry";
  let rounds = 1;
  let slotOffset = 1;
  let strategyLabTimeoutMs = 120000;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--strategy") strategy = args[++i] || strategy;
    else if (arg === "--rounds") rounds = parseInt(args[++i] || "1", 10);
    else if (arg === "--slot-offset") slotOffset = parseInt(args[++i] || "1", 10);
    else if (arg === "--strategy-lab-timeout-ms") strategyLabTimeoutMs = parseInt(args[++i] || "120000", 10);
    else if (arg === "--prod" || arg === "--live") {
      console.error("Live/prod flags are forbidden in this capture script.");
      process.exit(1);
    }
  }

  if (process.env.POLY_PROD === "true" || process.env.LIVE_TRADING === "true") {
    console.error("Live/prod environment variables are forbidden in this capture script.");
    process.exit(1);
  }

  const slug = getSlug(slotOffset);
  const slot = getSlotTS(slotOffset);
  
  console.log(`[Orchestrator] Resolved target slug: ${slug}`);
  console.log(`[Orchestrator] Slot window: ${new Date(slot.startTime).toISOString()} to ${new Date(slot.endTime).toISOString()}`);

  const rawL2Dir = path.join("data", "raw-l2");
  if (!existsSync(rawL2Dir)) mkdirSync(rawL2Dir, { recursive: true });
  
  const pairsDir = path.join("data", "pairs");
  if (!existsSync(pairsDir)) mkdirSync(pairsDir, { recursive: true });

  const replayLogPath = path.join("logs", `early-bird-${slug}.log`);
  const rawL2LogPath = path.join(rawL2Dir, `raw-l2-${slug}.ndjson`);
  const manifestPath = path.join(pairsDir, `${slug}.pair.json`);

  const captureStartedAtMs = Date.now();

  console.log(`[Orchestrator] Starting Raw L2 Recorder (saving to ${rawL2LogPath})...`);
  const recorderStartedAtMs = Date.now();
  let recorderReady = false;
  
  const recorderCmd = ["bun", "scripts/record-raw-l2.ts", "--slug", slug, "--out", rawL2LogPath, "--duration-ms", "600000"];
  const recorder = execProcess(recorderCmd[0]!, recorderCmd.slice(1), (data) => {
    process.stdout.write(`[Recorder] ${data}`);
    if (data.includes("Recorder is running")) {
      recorderReady = true;
    }
  }, (data) => process.stderr.write(`[Recorder ERR] ${data}`));

  let waitAttempts = 0;
  while (!recorderReady && waitAttempts < 100) {
    await new Promise(r => setTimeout(r, 100));
    waitAttempts++;
  }

  if (!recorderReady) {
    console.error(`[Orchestrator] Recorder failed to become ready within 10 seconds. Aborting.`);
    recorder.process.kill("SIGINT");
    process.exit(1);
  }

  console.log(`[Orchestrator] Recorder ready. Starting bot runtime...`);
  const runtimeStartedAtMs = Date.now();
  const runtimeCmd = ["bun", "index.ts", "--strategy", strategy, "--rounds", rounds.toString(), "--slot-offset", slotOffset.toString(), "--always-log"];
  const runtime = execProcess(runtimeCmd[0]!, runtimeCmd.slice(1), (data) => {
    process.stdout.write(`[Bot] ${data}`);
  }, (data) => process.stderr.write(`[Bot ERR] ${data}`));

  const { code: runtimeExitCode } = await runtime.promise;
  const runtimeEndedAtMs = Date.now();
  console.log(`[Orchestrator] Bot runtime exited with code ${runtimeExitCode}`);

  console.log(`[Orchestrator] Waiting 2 seconds for L2 tail buffer...`);
  await new Promise(r => setTimeout(r, 2000));

  console.log(`[Orchestrator] Attempting clean recorder shutdown via stdin...`);
  recorder.process.stdin?.write("stop\n");
  
  // Give it 3 seconds to stop cleanly via stdin
  let recorderDone = false;
  const timeout = setTimeout(() => {
    if (!recorderDone) {
      console.log(`[Orchestrator] Recorder clean shutdown timed out. Sending SIGINT...`);
      recorder.process.kill("SIGINT");
    }
  }, 3000);

  const { code: recorderExitCode, signal: recorderSignal } = await recorder.promise;
  recorderDone = true;
  clearTimeout(timeout);

  const recorderEndedAtMs = Date.now();
  console.log(`[Orchestrator] Recorder exited with code ${recorderExitCode}, signal ${recorderSignal}`);
  const captureEndedAtMs = Date.now();

  console.log(`[Orchestrator] Capture complete. Running validation...`);

  const manifest = await validatePair(slug, replayLogPath, rawL2LogPath, strategy, {
    strategyLabTimeoutMs,
    metadata: {
      slotStartMs: slot.startTime,
      slotEndMs: slot.endTime,
      captureStartedAtMs,
      captureEndedAtMs,
      runtimeStartedAtMs,
      runtimeEndedAtMs,
      recorderStartedAtMs,
      recorderEndedAtMs,
      runtimeExitCode,
      recorderExitCode,
      recorderSignal,
      gitCommit: gitCommitFromEnv(),
      commands: [
        recorderCmd.join(" "),
        runtimeCmd.join(" "),
      ]
    }
  });

  if (runtimeExitCode !== 0) {
    manifest.validationErrors.push(`Runtime process failed with code ${runtimeExitCode}`);
  }
  
  // Recorder failure check is now handled inside validatePair using SIGINT logic

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (manifest.validationErrors.length > 0) {
    console.error(`[Orchestrator] Validation failed with errors:`, manifest.validationErrors);
    console.log(`[Orchestrator] Manifest written to: ${manifestPath}`);
    process.exit(1);
  } else {
    console.log(`[Orchestrator] Validation passed!`);
    console.log(`[Orchestrator] Coverage: ${manifest.coverageVerdict}`);
    console.log(`[Orchestrator] Strategy Lab Status: ${manifest.strategyLabStatus}`);
    console.log(`[Orchestrator] Strategy Lab Evidence Verdict: ${manifest.strategyLabEvidenceVerdict}`);
    console.log(`[Orchestrator] Manifest written to: ${manifestPath}`);
  }
}

main().catch(console.error);
