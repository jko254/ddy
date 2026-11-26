import { describe, expect, it } from "vitest";
import { calculateMomentum, type PriceTick } from "./momentum";

describe("calculateMomentum", () => {
  it("reports directional displacement and consistency for a steady rise", () => {
    const ticks: PriceTick[] = [
      { epoch: 100, quote: 100 },
      { epoch: 104, quote: 101 },
      { epoch: 108, quote: 102 },
    ];

    expect(calculateMomentum(ticks, 10)).toEqual({
      direction: "up",
      change: 2,
      efficiency: 1,
      consistency: 1,
      tickCount: 3,
    });
  });

  it("measures choppy movement without treating every tick as aligned", () => {
    const ticks: PriceTick[] = [
      { epoch: 100, quote: 100 },
      { epoch: 103, quote: 102 },
      { epoch: 106, quote: 101 },
      { epoch: 109, quote: 103 },
    ];

    const reading = calculateMomentum(ticks, 10);
    expect(reading.direction).toBe("up");
    expect(reading.efficiency).toBeCloseTo(0.6);
    expect(reading.consistency).toBeCloseTo(2 / 3);
  });

  it("returns insufficient data when fewer than two ticks fit the window", () => {
    const ticks: PriceTick[] = [
      { epoch: 100, quote: 100 },
      { epoch: 105, quote: 101 },
    ];

    expect(calculateMomentum(ticks, 3).direction).toBe("insufficient");
  });
});
