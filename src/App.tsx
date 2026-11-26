import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateMomentum,
  type MomentumReading,
  type PriceTick,
} from "./lib/momentum";
import {
  mergeCandles,
  normalizeCandle,
  type PriceCandle,
} from "./lib/candles";

interface ActiveSymbol {
  symbol: string;
  display_name: string;
  market_display_name?: string;
  is_trading_suspended?: number;
}

interface DerivMessage {
  msg_type?: string;
  error?: { message?: string; code?: string };
  active_symbols?: ActiveSymbol[];
  candles?: unknown[];
  ohlc?: unknown;
  req_id?: number;
  echo_req?: { ticks_history?: string };
  subscription?: { id?: string };
  tick?: PriceTick & {
    symbol: string;
  };
}

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type CandleGranularity = 60 | 300 | 900;

const API_URL = "wss://ws.derivws.com/websockets/v3";
const MAX_TICKS = 2500;
const MAX_CANDLES = 120;
const CANDLE_INTERVALS: { value: CandleGranularity; label: string }[] = [
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
];
const ENVIRONMENT_APP_ID = import.meta.env.VITE_DERIV_APP_ID?.trim() ?? "";

function App() {
  const [appId, setAppId] = useState(() => ENVIRONMENT_APP_ID);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [symbols, setSymbols] = useState<ActiveSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [ticks, setTicks] = useState<PriceTick[]>([]);
  const [candles, setCandles] = useState<PriceCandle[]>([]);
  const [granularity, setGranularity] = useState<CandleGranularity>(60);
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const subscriptionsRef = useRef<{ ticks: string | null; candles: string | null }>({
    ticks: null,
    candles: null,
  });
  const selectedSymbolRef = useRef("");
  const granularityRef = useRef<CandleGranularity>(60);
  const candleRequestIdRef = useRef(0);

  const closeSocket = () => {
    const socket = socketRef.current;
    if (socket) {
      if (socket.readyState === WebSocket.OPEN) {
        Object.values(subscriptionsRef.current).forEach((subscriptionId) => {
          if (subscriptionId) {
            socket.send(JSON.stringify({ forget: subscriptionId }));
          }
        });
      }
      socket.close();
    }
    socketRef.current = null;
    subscriptionsRef.current = { ticks: null, candles: null };
    setStatus("disconnected");
  };

  useEffect(() => () => {
    socketRef.current?.close();
  }, []);

  const subscribeCandles = (
    symbol: string,
    candleGranularity: CandleGranularity,
    socket: WebSocket,
  ) => {
    const oldSubscription = subscriptionsRef.current.candles;
    if (oldSubscription) {
      socket.send(JSON.stringify({ forget: oldSubscription }));
      subscriptionsRef.current.candles = null;
    }
    const reqId = ++candleRequestIdRef.current;
    setCandles([]);
    socket.send(JSON.stringify({
      ticks_history: symbol,
      style: "candles",
      granularity: candleGranularity,
      count: MAX_CANDLES,
      end: "latest",
      subscribe: 1,
      req_id: reqId,
    }));
  };

  const subscribe = (
    symbol: string,
    socket: WebSocket,
    candleGranularity: CandleGranularity,
  ) => {
    Object.values(subscriptionsRef.current).forEach((subscriptionId) => {
      if (subscriptionId) socket.send(JSON.stringify({ forget: subscriptionId }));
    });
    subscriptionsRef.current = { ticks: null, candles: null };
    selectedSymbolRef.current = symbol;
    setSelectedSymbol(symbol);
    setTicks([]);
    setCandles([]);
    socket.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    subscribeCandles(symbol, candleGranularity, socket);
  };

  const connect = () => {
    const normalizedAppId = appId.trim();
    if (!normalizedAppId) {
      setError("Enter your Deriv application ID to connect to public ticks.");
      return;
    }
    if (!/^\d+$/.test(normalizedAppId)) {
      setError("The application ID should contain digits only.");
      return;
    }

    closeSocket();
    setError("");
    setSymbols([]);
    setTicks([]);
    setCandles([]);
    setStatus("connecting");

    const socket = new WebSocket(
      `${API_URL}?app_id=${encodeURIComponent(normalizedAppId)}&l=en&brand=deriv`,
    );
    socketRef.current = socket;

    socket.onopen = () => {
      if (socket !== socketRef.current) return;
      setStatus("connected");
      socket.send(
        JSON.stringify({ active_symbols: "brief", product_type: "basic" }),
      );
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      let message: DerivMessage;
      try {
        message = JSON.parse(event.data) as DerivMessage;
      } catch {
        setError("Received an unreadable response from the market data service.");
        return;
      }

      if (message.error) {
        setError(message.error.message ?? "Deriv returned an API error.");
        return;
      }

      if (message.msg_type === "active_symbols" && message.active_symbols) {
        const availableSymbols = message.active_symbols
          .filter((item) => item.symbol && item.display_name)
          .sort((left, right) =>
            left.display_name.localeCompare(right.display_name),
          );
        setSymbols(availableSymbols);
        const preferred = availableSymbols.some(
          (item) => item.symbol === selectedSymbolRef.current,
        )
          ? selectedSymbolRef.current
          : availableSymbols[0]?.symbol;
        if (preferred) subscribe(preferred, socket, granularityRef.current);
        else setError("Deriv did not return any available market symbols.");
      }

      if (message.msg_type === "tick" && message.tick) {
        const { tick } = message;
        if (tick.symbol !== selectedSymbolRef.current) return;
        if (message.subscription?.id) {
          subscriptionsRef.current.ticks = message.subscription.id;
        }
        setTicks((current) =>
          [...current, { epoch: tick.epoch, quote: tick.quote }].slice(
            -MAX_TICKS,
          ),
        );
      }

      if (
        message.msg_type === "candles" &&
        message.req_id === candleRequestIdRef.current &&
        message.echo_req?.ticks_history === selectedSymbolRef.current &&
        message.candles
      ) {
        const normalized = message.candles.map(normalizeCandle);
        if (normalized.some((candle) => candle === null)) {
          setError("Deriv returned invalid OHLC candle data.");
          return;
        }
        const validCandles = normalized.filter(
          (candle): candle is PriceCandle => candle !== null,
        );
        setCandles(mergeCandles([], validCandles, MAX_CANDLES));
        if (message.subscription?.id) {
          subscriptionsRef.current.candles = message.subscription.id;
        }
      }

      if (message.msg_type === "ohlc") {
        const candle = normalizeCandle(message.ohlc);
        if (!candle) {
          setError("Deriv returned an invalid live OHLC update.");
          return;
        }
        const responseSymbol =
          message.ohlc && typeof message.ohlc === "object"
            ? (message.ohlc as { symbol?: unknown }).symbol
            : undefined;
        if (responseSymbol && responseSymbol !== selectedSymbolRef.current) return;
        if (
          !message.subscription?.id ||
          message.subscription.id !== subscriptionsRef.current.candles
        ) return;
        setCandles((current) =>
          mergeCandles(current, [candle], MAX_CANDLES),
        );
        if (message.subscription?.id) {
          subscriptionsRef.current.candles = message.subscription.id;
        }
      }
    };

    socket.onerror = () => {
      if (socket === socketRef.current) {
        setError("Could not connect to Deriv. Check the app ID and try again.");
      }
    };

    socket.onclose = () => {
      if (socket === socketRef.current) {
        socketRef.current = null;
        subscriptionsRef.current = { ticks: null, candles: null };
        setStatus("disconnected");
      }
    };
  };

  const chooseSymbol = (symbol: string) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      setError("");
      subscribe(symbol, socket, granularityRef.current);
    }
  };

  const chooseGranularity = (value: string) => {
    const nextGranularity = CANDLE_INTERVALS.find(
      (interval) => String(interval.value) === value,
    )?.value;
    if (!nextGranularity) return;
    granularityRef.current = nextGranularity;
    setGranularity(nextGranularity);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && selectedSymbolRef.current) {
      subscribeCandles(selectedSymbolRef.current, nextGranularity, socket);
    }
  };

  const readings = useMemo(
    () => ({
      short: calculateMomentum(ticks, 10),
      medium: calculateMomentum(ticks, 30),
      long: calculateMomentum(ticks, 60),
    }),
    [ticks],
  );

  const enoughSignalData = readings.short.tickCount >= 3 && readings.medium.tickCount >= 5;
  const aligned = enoughSignalData && isMomentumAligned(readings.short, readings.medium);
  const activeSymbol = symbols.find((item) => item.symbol === selectedSymbol);
  const latestTick = ticks[ticks.length - 1];

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Tickscope home">
          <span className="brand-mark">T</span>
          <span>TICKSCOPE</span>
        </a>
        <div className="topbar-right">
          <span className="mode-pill"><span /> READ ONLY</span>
          <a
            className="docs-link"
            href="https://developers.deriv.com/"
            target="_blank"
            rel="noreferrer"
          >
            API docs ↗
          </a>
        </div>
      </header>

      <section className="intro">
        <div className="eyebrow"><span className="eyebrow-line" /> MARKET INTELLIGENCE</div>
        <div className="intro-row">
          <div>
            <h1>Rise / Fall <span>Monitor</span></h1>
            <p className="subtitle">
              Deriv OHLC candles and live ticks for directional momentum. No trades, ever.
            </p>
          </div>
          <div className={`connection ${status}`}>
            <span className="connection-dot" />
            {status === "connected"
              ? "LIVE CONNECTION"
              : status === "connecting"
                ? "CONNECTING"
                : "NOT CONNECTED"}
          </div>
        </div>
      </section>

      <section className="control-panel panel">
        <div className="control-intro">
          <span className="section-index">01</span>
          <div>
            <h2>Market data connection</h2>
            <p>
              {ENVIRONMENT_APP_ID
                ? "The application ID is configured and ready to use."
                : "Connect with an app ID to load available symbols and live ticks."}
            </p>
          </div>
        </div>
        <div className="controls">
          {ENVIRONMENT_APP_ID ? (
            <div className="field app-id-field">
              <span>DERIV APP ID</span>
              <div className="configured-app-id" aria-label="Deriv application ID configured">
                <span className="configured-dot" aria-hidden="true" />
                Configured via environment
              </div>
            </div>
          ) : (
            <label className="field app-id-field">
              <span>DERIV APP ID</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                placeholder="Enter application ID"
                aria-label="Deriv application ID"
                disabled={status !== "disconnected"}
              />
            </label>
          )}
          <label className="field symbol-field">
            <span>MARKET SYMBOL</span>
            <select
              value={selectedSymbol}
              onChange={(event) => chooseSymbol(event.target.value)}
              disabled={status !== "connected" || symbols.length === 0}
              aria-label="Market symbol"
            >
              {symbols.length === 0 && <option value="">Waiting for markets</option>}
              {symbols.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.display_name} ({item.symbol})
                </option>
              ))}
            </select>
          </label>
          {status === "disconnected" ? (
            <button className="button button-primary" onClick={connect}>
              Connect <span aria-hidden="true">→</span>
            </button>
          ) : (
            <button className="button button-secondary" onClick={closeSocket}>
              Disconnect
            </button>
          )}
        </div>
        {error && <div className="error-message" role="alert">{error}</div>}
        <p className="privacy-note">
          App ID only; do not enter a password or account token. This dashboard uses public market-data endpoints.
        </p>
      </section>

      <section className="market-grid">
        <div className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="section-index">02</span>
              <h2>Price action</h2>
            </div>
            <div className="chart-head-controls">
              <label className="interval-control">
                <span className="visually-hidden">Candle interval</span>
                <select
                  value={granularity}
                  onChange={(event) => chooseGranularity(event.target.value)}
                  disabled={status !== "connected" || !selectedSymbol}
                  aria-label="Candle interval"
                >
                  {CANDLE_INTERVALS.map((interval) => (
                    <option key={interval.value} value={interval.value}>
                      {interval.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="price-readout">
                <strong>{latestTick ? formatPrice(latestTick.quote) : "—"}</strong>
                <span>{activeSymbol?.display_name ?? "Awaiting market"}</span>
              </div>
            </div>
          </div>
          <CandleChart candles={candles} />
          <div className="chart-footer">
            <span>DERIV OHLC · {CANDLE_INTERVALS.find((item) => item.value === granularity)?.label.toUpperCase()}</span>
            <span>{latestTick ? `UPDATED ${formatTime(latestTick.epoch)}` : "NO TICKS RECEIVED"}</span>
          </div>
        </div>

        <div className="panel signal-panel">
          <div className="panel-heading">
            <div>
              <span className="section-index">03</span>
              <h2>Momentum alignment</h2>
            </div>
            <span className={`signal-indicator ${aligned ? "aligned" : ""} ${enoughSignalData ? "" : "collecting"}`}>
              <span /> {enoughSignalData ? (aligned ? "ALIGNED" : "MIXED") : "COLLECTING"}
            </span>
          </div>
          <div className="signal-visual" aria-hidden="true">
            <div className={`signal-arrow ${aligned ? readings.short.direction : "neutral"}`}>
              {aligned ? (readings.short.direction === "up" ? "↗" : "↘") : "↔"}
            </div>
            <div>
              <strong>              {aligned
                ? `${readings.short.direction.toUpperCase()}WARD MOMENTUM`
                : enoughSignalData
                  ? "NO CLEAR ALIGNMENT"
                  : "COLLECTING DATA"}</strong>
              <p>
                {aligned
                  ? "Short and medium windows currently point in the same direction."
                  : enoughSignalData
                    ? "Short and medium windows do not currently show clear agreement."
                    : "Keep the feed connected while the 10- and 30-second windows gather enough ticks."}
              </p>
            </div>
          </div>
          <div className="signal-note">
            Descriptive observation only. Momentum can reverse quickly; this is not a prediction or trade recommendation.
          </div>
        </div>
      </section>

      <section className="panel momentum-panel">
        <div className="panel-heading momentum-heading">
          <div>
            <span className="section-index">04</span>
            <h2>Momentum by window</h2>
          </div>
          <p>Price displacement and directional consistency over recent ticks</p>
        </div>
        <div className="momentum-cards">
          <MomentumCard label="10 SECONDS" reading={readings.short} />
          <MomentumCard label="30 SECONDS" reading={readings.medium} />
          <MomentumCard label="60 SECONDS" reading={readings.long} />
        </div>
      </section>

      <section className="panel ticks-panel">
        <div className="panel-heading ticks-heading">
          <div>
            <span className="section-index">05</span>
            <h2>Recent ticks</h2>
          </div>
          <span className="tick-count">{ticks.length} / {MAX_TICKS} retained</span>
        </div>
        <div className="tick-table-wrap">
          <table>
            <thead>
              <tr><th>TIME (UTC)</th><th>PRICE</th><th>CHANGE</th><th>DIRECTION</th></tr>
            </thead>
            <tbody>
              {ticks.slice(-8).reverse().map((tick, index, recent) => {
                const next = recent[index + 1];
                const change = next ? tick.quote - next.quote : null;
                return (
                  <tr key={`${tick.epoch}-${index}`}>
                    <td>{formatTime(tick.epoch)}</td>
                    <td className="table-price">{formatPrice(tick.quote)}</td>
                    <td className={change === null ? "" : change >= 0 ? "positive" : "negative"}>
                      {change === null ? "—" : `${change >= 0 ? "+" : ""}${formatPrice(change)}`}
                    </td>
                    <td>
                      {change === null ? <span className="direction-tag neutral">—</span> : (
                        <span className={`direction-tag ${change > 0 ? "up" : change < 0 ? "down" : "neutral"}`}>
                          {change > 0 ? "UP" : change < 0 ? "DOWN" : "FLAT"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {ticks.length === 0 && (
                <tr><td className="empty-row" colSpan={4}>Connect to a market to see incoming ticks.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="disclaimer">
        <span>DATA &amp; ANALYSIS ONLY</span>
        <p>
          Tickscope does not execute trades or guarantee outcomes. Historical and live momentum
          measures are informational and should not be treated as financial advice.
        </p>
      </footer>
    </main>
  );
}

function MomentumCard({ label, reading }: { label: string; reading: MomentumReading }) {
  const directionLabel = reading.direction === "insufficient"
    ? "COLLECTING DATA"
    : reading.direction === "flat"
      ? "FLAT"
      : `${reading.direction.toUpperCase()}WARD`;

  return (
    <article className="momentum-card">
      <div className="card-topline"><span>{label}</span><span className={`mini-direction ${reading.direction}`}>{directionLabel}</span></div>
      <div className={`momentum-value ${reading.direction}`}>
        {reading.direction === "insufficient" ? "—" : `${reading.change >= 0 ? "+" : ""}${formatPrice(reading.change)}`}
      </div>
      <div className="metric-row">
        <span>Directional consistency</span>
        <strong>        {reading.tickCount < 2 ? "—" : `${Math.round(reading.consistency * 100)}%`}</strong>
      </div>
      <div className="meter-track" aria-label="Directional consistency">
        <span style={{ width: `${Math.round(reading.consistency * 100)}%` }} />
      </div>
      <div className="card-foot">
        <span>{reading.tickCount} TICKS · EFFICIENCY</span>
        <strong>{reading.tickCount < 2 ? "—" : `${Math.round(reading.efficiency * 100)}%`}</strong>
      </div>
    </article>
  );
}

function CandleChart({ candles }: { candles: PriceCandle[] }) {
  const visibleCandles = candles.slice(-100);
  if (visibleCandles.length === 0) {
    return (
      <div className="chart-empty">
        <div className="chart-empty-icon">▥</div>
        <span>Waiting for Deriv OHLC candle data…</span>
      </div>
    );
  }

  const minimum = Math.min(...visibleCandles.map((candle) => candle.low));
  const maximum = Math.max(...visibleCandles.map((candle) => candle.high));
  const rawRange = maximum - minimum;
  const padding = rawRange === 0
    ? Math.max(Math.abs(maximum) * 0.001, 0.000001)
    : rawRange * 0.06;
  const chartMinimum = minimum - padding;
  const chartMaximum = maximum + padding;
  const chartRange = chartMaximum - chartMinimum;
  const slotWidth = 1000 / visibleCandles.length;
  const bodyWidth = Math.max(2, Math.min(12, slotWidth * 0.58));
  const y = (price: number) => 8 + ((chartMaximum - price) / chartRange) * 184;

  return (
    <div className="chart-wrap">
      <svg className="price-chart candle-chart" viewBox="0 0 1000 200" preserveAspectRatio="none" role="img" aria-label="OHLC candlestick chart">
        {[52, 100, 148].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} className="chart-gridline" />)}
        {visibleCandles.map((candle, index) => {
          const center = slotWidth * (index + 0.5);
          const rising = candle.close >= candle.open;
          const top = Math.min(y(candle.open), y(candle.close));
          const bodyHeight = Math.max(Math.abs(y(candle.open) - y(candle.close)), 1);
          return (
            <g key={candle.epoch} className={`candle ${rising ? "up" : "down"}`}>
              <title>
                {`${formatTime(candle.epoch)} · O ${formatPrice(candle.open)} · H ${formatPrice(candle.high)} · L ${formatPrice(candle.low)} · C ${formatPrice(candle.close)}`}
              </title>
              <line
                className="candle-wick"
                x1={center}
                x2={center}
                y1={y(candle.high)}
                y2={y(candle.low)}
              />
              <rect
                className="candle-body"
                x={center - bodyWidth / 2}
                y={top}
                width={bodyWidth}
                height={bodyHeight}
                rx="1"
              />
            </g>
          );
        })}
      </svg>
      <div className="chart-scale"><span>{formatPrice(chartMaximum)}</span><span>{formatPrice(chartMinimum)}</span></div>
    </div>
  );
}

function isMomentumAligned(short: MomentumReading, medium: MomentumReading) {
  return (
    (short.direction === "up" || short.direction === "down") &&
    short.direction === medium.direction &&
    short.consistency >= 0.55 &&
    medium.consistency >= 0.5
  );
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatTime(epoch: number) {
  return new Date(epoch * 1000).toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default App;
