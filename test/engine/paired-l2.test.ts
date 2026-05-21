import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { validatePair } from "../../engine/replay/pair-validator.ts";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Pair Validator", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pair-test-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("missing files yield validation errors and missing coverage", async () => {
    const manifest = await validatePair("btc-updown-5m-100", path.join(tmpDir, "missing.log"), path.join(tmpDir, "missing.ndjson"), "late-entry");
    
    expect(manifest.validationErrors).toContain(`Replay log not found: ${path.join(tmpDir, "missing.log")}`);
    expect(manifest.validationErrors).toContain(`Raw L2 log not found: ${path.join(tmpDir, "missing.ndjson")}`);
    expect(manifest.coverageVerdict).toBe("missing");
    expect(manifest.strategyLabEvidenceVerdict).toBe("failed");
  });

  test("empty files yield validation errors", async () => {
    const emptyLog = path.join(tmpDir, "empty.log");
    const emptyNdjson = path.join(tmpDir, "empty.ndjson");
    fs.writeFileSync(emptyLog, "");
    fs.writeFileSync(emptyNdjson, "");

    const manifest = await validatePair("btc-updown-5m-100", emptyLog, emptyNdjson, "late-entry");
    
    expect(manifest.validationErrors).toContain("Replay log is empty");
    expect(manifest.validationErrors).toContain("Raw L2 log is empty");
    expect(manifest.coverageVerdict).toBe("missing");
  });

  test("partial coverage detection", async () => {
    const replayLog = path.join(tmpDir, "partial.log");
    const l2Log = path.join(tmpDir, "partial.ndjson");
    
    fs.writeFileSync(replayLog, JSON.stringify({ ts: 1000 }) + "\n" + JSON.stringify({ ts: 5000 }) + "\n");
    // L2 starts late and ends early
    fs.writeFileSync(l2Log, JSON.stringify({ eventType: "market_book_snapshot", receivedTsMs: 2000 }) + "\n" + JSON.stringify({ eventType: "market_trade", receivedTsMs: 4000 }) + "\n");

    const manifest = await validatePair("btc-updown-5m-100", replayLog, l2Log, "late-entry");
    
    expect(manifest.coverageVerdict).toBe("partial");
    expect(manifest.coverageLeadMs).toBe(1000 - 2000); // -1000
    expect(manifest.coverageTailMs).toBe(4000 - 5000); // -1000
    // It will fail strategy lab parsing because it's not a real replay log, so we expect Strategy Lab to throw or fail
    expect(manifest.validationErrors.length).toBeGreaterThan(0);
  });

  test("complete coverage detection", async () => {
    const replayLog = path.join(tmpDir, "complete.log");
    const l2Log = path.join(tmpDir, "complete.ndjson");
    
    fs.writeFileSync(replayLog, JSON.stringify({ ts: 2000 }) + "\n" + JSON.stringify({ ts: 4000 }) + "\n");
    fs.writeFileSync(l2Log, JSON.stringify({ eventType: "market_book_snapshot", receivedTsMs: 1000 }) + "\n" + JSON.stringify({ eventType: "market_trade", receivedTsMs: 5000 }) + "\n");

    const manifest = await validatePair("btc-updown-5m-100", replayLog, l2Log, "late-entry");
    
    expect(manifest.coverageVerdict).toBe("complete");
    expect(manifest.coverageLeadMs).toBe(2000 - 1000); // 1000
    expect(manifest.coverageTailMs).toBe(5000 - 4000); // 1000
  });

});
