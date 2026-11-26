export interface PriceTick {
  epoch: number;
  quote: number;
}

export interface MomentumReading {
  direction: "up" | "down" | "flat" | "insufficient";
  change: number;
  efficiency: number;
  consistency: number;
  tickCount: number;
}

export function calculateMomentum(
  ticks: PriceTick[],
  windowSeconds: number,
): MomentumReading {
  if (ticks.length < 2 || windowSeconds <= 0) {
    return emptyReading();
  }

  const latestEpoch = ticks[ticks.length - 1].epoch;
  const cutoff = latestEpoch - windowSeconds;
  const windowTicks = ticks.filter((tick) => tick.epoch >= cutoff);
  if (windowTicks.length < 2) {
    return emptyReading();
  }

  const firstQuote = windowTicks[0].quote;
  const lastQuote = windowTicks[windowTicks.length - 1].quote;
  const change = lastQuote - firstQuote;
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";

  let totalMovement = 0;
  let alignedMoves = 0;
  let directionalMoves = 0;
  for (let index = 1; index < windowTicks.length; index += 1) {
    const move = windowTicks[index].quote - windowTicks[index - 1].quote;
    totalMovement += Math.abs(move);
    if (move !== 0) {
      directionalMoves += 1;
      if ((change > 0 && move > 0) || (change < 0 && move < 0)) {
        alignedMoves += 1;
      }
    }
  }

  return {
    direction,
    change,
    efficiency: totalMovement === 0 ? 0 : Math.abs(change) / totalMovement,
    consistency: directionalMoves === 0 ? 0 : alignedMoves / directionalMoves,
    tickCount: windowTicks.length,
  };
}

function emptyReading(): MomentumReading {
  return {
    direction: "insufficient",
    change: 0,
    efficiency: 0,
    consistency: 0,
    tickCount: 0,
  };
}
