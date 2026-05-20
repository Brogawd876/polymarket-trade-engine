import { describe, expect, test } from "bun:test";
import {
  calculateMarkout,
  calculateMarkouts,
} from "../../engine/replay/markout.ts";

describe("markout calculator", () => {
  test("computes signed buy markouts from future midpoints", () => {
    const result = calculateMarkout(
      {
        orderId: "o1",
        tsMs: 1000,
        side: "UP",
        action: "buy",
        price: 0.48,
      },
      [
        { tsMs: 1500, upBid: 0.47, upAsk: 0.49 },
        { tsMs: 2000, upBid: 0.51, upAsk: 0.53 },
      ],
      1000,
    );

    expect(result.referencePrice).toBe(0.52);
    expect(result.value).toBe(0.04);
  });

  test("computes signed sell markouts against settlement", () => {
    const result = calculateMarkout(
      {
        orderId: "o1",
        tsMs: 1000,
        side: "DOWN",
        action: "sell",
        price: 0.44,
      },
      [{ tsMs: 2000, settlementUpValue: 1 }],
      "settlement",
    );

    expect(result.referencePrice).toBe(0);
    expect(result.value).toBe(0.44);
  });

  test("returns explicit null reasons instead of fake values", () => {
    const results = calculateMarkouts(null, []);
    expect(results.every((result) => result.value === null)).toBe(true);
    expect(results.every((result) => result.reason === "missing_fill")).toBe(true);

    const missing = calculateMarkout(
      {
        orderId: "o2",
        tsMs: 1000,
        side: "UP",
        action: "buy",
        price: 0.5,
      },
      [{ tsMs: 2000, downBid: 0.5, downAsk: 0.52 }],
      1000,
    );
    expect(missing.reason).toBe("missing_reference");
    expect(missing.value).toBeNull();
  });
});
