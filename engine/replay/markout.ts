export type MarkoutHorizon = 1000 | 5000 | 30000 | "settlement";

export type FillForMarkout = {
  orderId: string;
  tsMs: number;
  side: "UP" | "DOWN";
  action: "buy" | "sell";
  price: number;
};

export type ReferencePricePoint = {
  tsMs: number;
  upMid?: number | null;
  downMid?: number | null;
  upBid?: number | null;
  upAsk?: number | null;
  downBid?: number | null;
  downAsk?: number | null;
  settlementUpValue?: number | null;
};

export type MarkoutResult = {
  orderId: string;
  horizon: MarkoutHorizon;
  value: number | null;
  referencePrice: number | null;
  reason?: "missing_reference" | "missing_horizon" | "missing_fill";
};

export function calculateMarkouts(
  fill: FillForMarkout | null,
  references: ReferencePricePoint[],
): MarkoutResult[] {
  const horizons: MarkoutHorizon[] = [1000, 5000, 30000, "settlement"];
  if (!fill) {
    return horizons.map((horizon) => ({
      orderId: "",
      horizon,
      value: null,
      referencePrice: null,
      reason: "missing_fill",
    }));
  }

  const sorted = [...references].sort((a, b) => a.tsMs - b.tsMs);
  return horizons.map((horizon) => calculateMarkout(fill, sorted, horizon));
}

export function calculateMarkout(
  fill: FillForMarkout,
  references: ReferencePricePoint[],
  horizon: MarkoutHorizon,
): MarkoutResult {
  const reference =
    horizon === "settlement"
      ? references.findLast((point) => point.settlementUpValue !== undefined)
      : references.find((point) => point.tsMs >= fill.tsMs + horizon);

  if (!reference) {
    return {
      orderId: fill.orderId,
      horizon,
      value: null,
      referencePrice: null,
      reason: "missing_horizon",
    };
  }

  const referencePrice = priceForSide(reference, fill.side, horizon);
  if (referencePrice === null) {
    return {
      orderId: fill.orderId,
      horizon,
      value: null,
      referencePrice: null,
      reason: "missing_reference",
    };
  }

  const signed =
    fill.action === "buy"
      ? referencePrice - fill.price
      : fill.price - referencePrice;
  return {
    orderId: fill.orderId,
    horizon,
    value: parseFloat(signed.toFixed(6)),
    referencePrice,
  };
}

function priceForSide(
  point: ReferencePricePoint,
  side: "UP" | "DOWN",
  horizon: MarkoutHorizon,
): number | null {
  if (horizon === "settlement" && point.settlementUpValue !== undefined) {
    if (point.settlementUpValue === null) return null;
    return side === "UP" ? point.settlementUpValue : 1 - point.settlementUpValue;
  }
  const explicitMid = side === "UP" ? point.upMid : point.downMid;
  if (explicitMid !== undefined && explicitMid !== null) return explicitMid;
  const bid = side === "UP" ? point.upBid : point.downBid;
  const ask = side === "UP" ? point.upAsk : point.downAsk;
  if (bid !== undefined && bid !== null && ask !== undefined && ask !== null) {
    return parseFloat(((bid + ask) / 2).toFixed(6));
  }
  return null;
}
