import { describe, expect, test } from "bun:test";
import {
  ChainlinkResolutionAdapter,
  type ChainlinkFeedReader,
} from "../../engine/bot-core/chainlink-resolution-adapter.ts";
import { VirtualClock } from "../../engine/bot-core/replay-runner.ts";

class MockReader implements ChainlinkFeedReader {
  round = {
    roundId: 10n,
    answer: 100_123_456_789n,
    startedAt: 1778891400n,
    updatedAt: 1778891401n,
    answeredInRound: 10n,
  };
  decimalsValue = 8;
  descriptionValue = "BTC / USD";
  fail = false;

  async latestRoundData() {
    if (this.fail) throw new Error("rpc down");
    return this.round;
  }
  async decimals() {
    return this.decimalsValue;
  }
  async description() {
    return this.descriptionValue;
  }
}

describe("ChainlinkResolutionAdapter", () => {
  test("parses latestRoundData, decimals, lag, and metadata", async () => {
    const clock = new VirtualClock();
    clock.setNowMs(1778891405_000);
    const reader = new MockReader();
    const adapter = new ChainlinkResolutionAdapter({
      reader,
      clock,
      staleAfterMs: 60_000,
    });

    const event = await adapter.pollOnce();

    expect(event?.sourceType).toBe("chainlink_polygon");
    expect(event?.price).toBe(1001.23456789);
    expect(event?.rawOracleAnswer).toBe("100123456789");
    expect(event?.roundId).toBe("10");
    expect(event?.chainUpdatedAtMs).toBe(1778891401_000);
    expect(event?.localReceivedAtMs).toBe(1778891405_000);
    expect(event?.oracleLagMs).toBe(4000);
    expect(event?.quality).toBe("live");
    expect(event?.metadata?.contractAddress).toBe("0xc907E116054Ad103354f2D350FD2514433D57F6f");
  });

  test("emits only when round data changes meaningfully", async () => {
    const clock = new VirtualClock();
    clock.setNowMs(1778891405_000);
    const reader = new MockReader();
    const adapter = new ChainlinkResolutionAdapter({ reader, clock });
    const events: string[] = [];
    adapter.subscribe((event) => events.push(event.roundId ?? "none"));

    await adapter.pollOnce();
    await adapter.pollOnce();
    reader.round = { ...reader.round, roundId: 11n, answeredInRound: 11n };
    await adapter.pollOnce();

    expect(events).toEqual(["10", "11"]);
  });

  test("marks stale oracle data and degraded RPC health fail-closed", async () => {
    const clock = new VirtualClock();
    clock.setNowMs(1778891500_000);
    const reader = new MockReader();
    const adapter = new ChainlinkResolutionAdapter({
      reader,
      clock,
      staleAfterMs: 10_000,
      maxRpcFailures: 1,
    });

    const stale = await adapter.pollOnce();
    expect(stale?.quality).toBe("stale");
    expect(adapter.isReady()).toBe(false);

    reader.fail = true;
    await adapter.pollOnce();
    expect(adapter.health().status).toBe("degraded");
    expect(adapter.latest()?.stalenessStatus).toBe("degraded");
  });
});
