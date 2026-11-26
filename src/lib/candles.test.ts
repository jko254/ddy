import { describe, expect, it } from "vitest";
import { mergeCandles, normalizeCandle, type PriceCandle } from "./candles";

describe("normalizeCandle", () => {
  it("accepts valid OHLC values and numeric API strings", () => {
    expect(normalizeCandle({
      epoch: "120",
      open: "10.5",
      high: "12",
      low: "9",
      close: "11.5",
    })).toEqual({ epoch: 120, open: 10.5, high: 12, low: 9, close: 11.5 });
  });

  it("rejects candles whose high and low do not contain the open and close", () => {
    expect(normalizeCandle({
      epoch: 120,
      open: 10,
      high: 9,
      low: 8,
      close: 11,
    })).toBeNull();
  });
});

describe("mergeCandles", () => {
  it("replaces an updating candle with the same epoch and keeps chronological order", () => {
    const history: PriceCandle[] = [
      { epoch: 120, open: 10, high: 11, low: 9, close: 10 },
      { epoch: 180, open: 10, high: 12, low: 9, close: 11 },
    ];
    const update: PriceCandle = {
      epoch: 180,
      open: 10,
      high: 13,
      low: 9,
      close: 12,
    };

    expect(mergeCandles(history, [update])).toEqual([history[0], update]);
  });
});
