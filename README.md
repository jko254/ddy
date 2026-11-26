# Deriv Rise/Fall Market Monitor

A read-only market dashboard for studying Deriv tick data and directional momentum. It does not request trade proposals or place trades.

## Run locally

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Run `npm run dev`.
4. Connect to the public tick feed.

The dashboard uses Deriv's public market-data App ID. It does not ask for an account ID, password, token, OAuth client ID, or redirect URL.

## Included

- Live symbol list, tick subscriptions, and Deriv-provided OHLC candles from the WebSocket API.
- Candlestick chart with selectable 1-, 5-, and 15-minute intervals; tick data remains the source for sub-minute momentum and the recent tick table.
- 10-, 30-, and 60-second momentum summaries, directional consistency, and short-versus-medium momentum alignment.
- Connection status and API error feedback.

Momentum observations are descriptive, not predictions or guarantees. Market data can be delayed, interrupted, or change behavior. No trade execution, proposal, or account authorization endpoints are used.
