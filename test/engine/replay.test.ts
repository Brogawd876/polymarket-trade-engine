import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  ReplayLogReader,
  ReplayRunner,
  VirtualClock,
  type ReplayBot,
} from "../../engine/bot-core/index.ts";

async function withTempLog<T>(contents: string, fn: (path: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "replay-log-"));
  try {
    const path = join(dir, "events.log");
    writeFileSync(path, contents, "utf8");
    return await fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("VirtualClock", () => {
  test("runs due timeouts in target-time and insertion order", () => {
    const clock = new VirtualClock();
    const seen: string[] = [];
    clock.setTimeout(() => seen.push("b"), 20);
    clock.setTimeout(() => seen.push("a"), 10);
    clock.setTimeout(() => seen.push("c"), 20);

    clock.setNowMs(20);

    expect(seen).toEqual(["a", "b", "c"]);
  });

  test("runs nested timers due at the current virtual time", () => {
    const clock = new VirtualClock();
    const seen: string[] = [];
    clock.setTimeout(() => {
      seen.push("outer");
      clock.setTimeout(() => seen.push("inner"), 0);
    }, 10);

    clock.setNowMs(10);

    expect(seen).toEqual(["outer", "inner"]);
  });

  test("supports intervals and self-cancellation inside the callback", () => {
    const clock = new VirtualClock();
    const seen: number[] = [];
    const handle = clock.setInterval(() => {
      seen.push(clock.nowMs());
      if (seen.length === 2) clock.clearInterval(handle);
    }, 5);

    clock.setNowMs(5);
    clock.setNowMs(10);
    clock.setNowMs(30);

    expect(seen).toEqual([5, 10]);
  });

  test("clearTimeout prevents a pending timeout", () => {
    const clock = new VirtualClock();
    let fired = false;
    const handle = clock.setTimeout(() => {
      fired = true;
    }, 1);
    clock.clearTimeout(handle);

    clock.setNowMs(1);

    expect(fired).toBe(false);
  });
});

describe("ReplayLogReader", () => {
  test("loads and dispatches sorted valid log events", async () => {
    await withTempLog(
      [
        JSON.stringify({ ts: 20, type: "ticker", assetPrice: 2 }),
        JSON.stringify({
          ts: 10,
          type: "slot",
          action: "start",
          slug: "btc-updown-5m-10",
          startTime: 10,
          endTime: 300010,
          strategy: "simulation",
        }),
      ].join("\n"),
      (path) => {
        const reader = new ReplayLogReader(path);
        const seen: string[] = [];
        reader.subscribe((evt) => seen.push(evt.type));

        reader.advanceTo(20);

        expect(reader.eventCount).toBe(2);
        expect(reader.round?.slug).toBe("btc-updown-5m-10");
        expect(seen).toEqual(["slot", "ticker"]);
        expect(reader.isDone()).toBe(true);
      },
    );
  });

  test("fails fast on malformed rows by default", async () => {
    await withTempLog("{ bad json", (path) => {
      expect(() => new ReplayLogReader(path)).toThrow(/Replay log parse failed/);
    });
  });

  test("rejects empty logs as unusable", async () => {
    await withTempLog("\n", (path) => {
      expect(() => new ReplayLogReader(path)).toThrow(/contains no usable events/);
    });
  });
});

describe("ReplayRunner", () => {
  test("dispatches events, ticks the bot, and reports clean completion", async () => {
    await withTempLog(
        [
          JSON.stringify({
            ts: 1000,
            type: "slot",
            action: "start",
            slug: "btc-updown-5m-1000",
            startTime: 1000,
            endTime: 301000,
            strategy: "simulation",
          }),
          JSON.stringify({
            ts: 1001,
            type: "orderbook_snapshot",
            up: { bids: [], asks: [] },
            down: { bids: [], asks: [] },
          }),
          JSON.stringify({ ts: 1100, type: "ticker", assetPrice: 100 }),
        ].join("\n"),
        async (path) => {
          const reader = new ReplayLogReader(path);
          const clock = new VirtualClock();
          let ticks = 0;
          let activeLifecycleCount = 1;
          let isShuttingDown = false;
          const bot: ReplayBot = {
            get activeLifecycleCount() {
              return activeLifecycleCount;
            },
            get isShuttingDown() {
              return isShuttingDown;
            },
            replayStateSummary: () => `fixture:RUNNING(pending=${ticks})`,
            start: async () => {},
            tickOnce: async () => {
              ticks++;
              if (ticks >= 2) {
                activeLifecycleCount = 0;
                isShuttingDown = true;
              }
            },
            startShutdown: () => {},
          };

          const result = await new ReplayRunner(reader, bot, clock).run();

          expect(result.completed).toBe(true);
          expect(result.ticks).toBeGreaterThanOrEqual(2);
          expect(reader.isDone()).toBe(true);
        },
    );
  });
});
