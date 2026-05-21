import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Corpus Runner (run-strategy-lab-paired-corpus.ts)", () => {
  let tmpDir: string;
  let reportsDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "corpus-runner-test-"));
    reportsDir = path.join(tmpDir, "reports");
    fs.mkdirSync(reportsDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runScript(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve) => {
      const proc = spawn("bun", ["scripts/run-strategy-lab-paired-corpus.ts", ...args], {
        cwd: process.cwd()
      });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (d) => { stdout += d.toString(); });
      proc.stderr.on("data", (d) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
  }

  test("runs successfully on valid corpus without timeout", async () => {
    const outJson = path.join(reportsDir, "ok-summary.json");
    const { stdout, stderr, code } = await runScript([
      "--pairs-dir", "data/pairs",
      "--out-json", outJson,
      "--variants", "simulation" // A fast variant that doesn't hang
    ]);
    
    if (code !== 0) {
      console.error("STDOUT:", stdout);
      console.error("STDERR:", stderr);
    }
    expect(code).toBe(0);
    expect(stdout).toContain("Strategy Lab Batch Completed. State: completed");
    expect(fs.existsSync(outJson)).toBe(true);
  }, 120000);

  // To simulate the "all runs complete but manager hangs" failure mode, 
  // we would need a mock or an explicit strategy that hangs.
  // Instead, we will simulate a timeout by making the script time out quickly.
  test("timeout with incomplete runs returns non-zero code and marked as timed_out", async () => {
    const { stdout, stderr, code } = await runScript([
      "--pairs-dir", "data/pairs",
      "--timeout-ms", "1", // Instantly time out
      "--variants", "simulation"
    ]);
    
    if (code === 0) {
      console.error("STDOUT:", stdout);
      console.error("STDERR:", stderr);
    }
    
    expect(code).not.toBe(0); // Should fail
    expect(stdout).toContain("[ERROR] Strategy Lab Batch Timed Out!");
    expect(stdout).toContain("Status: timed_out");
  }, 120000);
  
  test("graceful failure when allowing partials", async () => {
    const { stdout, stderr, code } = await runScript([
      "--pairs-dir", "data/pairs",
      "--timeout-ms", "1",
      "--allow-partial",
      "--variants", "simulation"
    ]);
    if (code !== 0) {
      console.error("STDOUT:", stdout);
      console.error("STDERR:", stderr);
    }
    
    expect(code).toBe(0); // allow-partial makes exit code 0
    expect(stdout).toContain("Status: timed_out");
  }, 120000);
});
