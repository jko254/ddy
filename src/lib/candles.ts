export interface PriceCandle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function normalizeCandle(value: unknown): PriceCandle | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const epoch = toFiniteNumber(record.epoch);
  const open = toFiniteNumber(record.open);
  const high = toFiniteNumber(record.high);
  const low = toFiniteNumber(record.low);
  const close = toFiniteNumber(record.close);
  if (
    epoch === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    high < Math.max(open, close, low) ||
    low > Math.min(open, close, high)
  ) {
    return null;
  }

  return { epoch, open, high, low, close };
}

export function mergeCandles(
  current: PriceCandle[],
  updates: PriceCandle[],
  limit = 120,
): PriceCandle[] {
  const byEpoch = new Map(current.map((candle) => [candle.epoch, candle]));
  for (const candle of updates) {
    byEpoch.set(candle.epoch, candle);
  }
  return [...byEpoch.values()]
    .sort((left, right) => left.epoch - right.epoch)
    .slice(-limit);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
