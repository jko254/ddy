# Deriv Rise/Fall Market Monitor

A read-only market dashboard for studying Deriv tick data and directional momentum. It does not request trade proposals or place trades.

## Run locally

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Run `npm run dev`.
4. Enter your Deriv application ID and connect to the public tick feed.

The application ID is used to establish a market-data WebSocket connection. Do not enter an account token or password. Register an app through Deriv's developer portal if you do not already have an application ID.

## Included

- Live symbol list, tick subscriptions, and Deriv-provided OHLC candles from the WebSocket API.
- Candlestick chart with selectable 1-, 5-, and 15-minute intervals; tick data remains the source for sub-minute momentum and the recent tick table.
- 10-, 30-, and 60-second momentum summaries, directional consistency, and short-versus-medium momentum alignment.
- Connection status and API error feedback.

Momentum observations are descriptive, not predictions or guarantees. Market data can be delayed, interrupted, or change behavior. No trade execution, proposal, or account authorization endpoints are used.
