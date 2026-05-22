import { test, expect } from "bun:test";
import { spawn } from "child_process";

test("Capture Runner > runs in dry-run mode without failing", async () => {
  const p = spawn("bun", [
    "scripts/capture-calibration-corpus.ts",
    "--dry-run",
    "--target-valid-pairs", "2",
    "--max-attempts", "2",
    "--out-dir", "data/test-corpus-runs"
  ]);

  const promise = new Promise<{ code: number | null }>((resolve) => {
    p.on("close", (code) => resolve({ code }));
    p.on("error", () => resolve({ code: null }));
  });

  const { code } = await promise;
  expect(code).toBe(0);
});
