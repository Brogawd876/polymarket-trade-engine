import { RawL2Recorder } from "../engine/recorders/raw-l2-recorder.ts";
import { NdjsonEventWriter, NoopEventWriter } from "../engine/event-store/writer.ts";

async function main() {
  const args = process.argv.slice(2);
  let slug = "";
  let durationMs = 60000; // Default 60 seconds
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--slug") {
      slug = args[++i] || "";
    } else if (arg === "--duration-ms") {
      durationMs = parseInt(args[++i] || "60000", 10);
    } else if (arg === "--dry-run") {
      dryRun = true;
    }
  }

  if (!slug) {
    console.error("Usage: bun run scripts/record-raw-l2.ts --slug <market-slug> [--duration-ms <ms>] [--dry-run]");
    process.exit(1);
  }

  console.log(`Starting Raw L2 Recorder...`);
  console.log(`Slug: ${slug}`);
  console.log(`Duration: ${durationMs}ms`);
  console.log(`Mode: ${dryRun ? "DRY-RUN (NoopWriter)" : "CAPTURE (NdjsonWriter)"}`);

  const writer = dryRun ? new NoopEventWriter() : new NdjsonEventWriter();
  const recorder = new RawL2Recorder({ writer });

  let isShuttingDown = false;
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\nShutting down recorder...");
    try {
      await recorder.stop();
      console.log("Recorder stopped safely.");
      console.log("Health summary:", recorder.health);
      if (!dryRun) {
        console.log(`Output written to: logs/events/${writer.runId}/events.ndjson`);
      }
      process.exit(0);
    } catch (e) {
      console.error("Error during shutdown:", e);
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await recorder.start(slug);
    console.log("Recorder is running. Press Ctrl+C to stop early.");
    
    if (durationMs > 0) {
      setTimeout(() => {
        console.log(`Duration of ${durationMs}ms reached.`);
        shutdown();
      }, durationMs);
    }
  } catch (e) {
    console.error("Failed to start recorder:", e);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
