# AURELIS Investment Terminal

## Product decision
Build a standalone, full-width investment and crypto research/trading app. It is **not a wallet** and must not require WalletConnect, OneKey, or phone wallet pairing for login. Preserve and reuse working market-data, research, scanning, historical observations, and exchange adapters from AURELIS. Keep the existing wallet operational and untouched until the new app is proven.

## Product experience
- **Command Center:** balances by connected broker/exchange, market conditions, research opportunities, watchlists, alerts, P&L and risk exposure; clearly label unavailable data.
- **Markets & charts:** wide candlestick charts, synchronized ticker/order-book/trades, multi-timeframe indicators, compare, drawing tools, saved layouts, and AI chart commentary.
- **Token Intelligence:** token summary, fundamentals, supply/circulating/max and dilution, vesting/unlocks, concentration, liquidity, chain/on-chain flows, developer activity, news, catalyst calendar, red flags and cited source timestamps. Never pretend absent metrics are live.
- **AI Research Desk:** conversation anchored to the currently selected token, timeframe, charts, portfolio context and scanner data. Attach chart screenshots; explain what indicators show, where invalidation sits, and disagreements among agents. AI replies must indicate data freshness and inference vs facts.
- **Spot & Perps Lab:** high-coverage scans with sorting/filtering, evidence, probabilistic or historical claims only where backtested, realistic fee/slippage/leverage/liquidation modeling and venue eligibility. A research candidate is not an order.
- **Trade Ticket:** single ticket for supported spot/perpetual venue accounts, current balances, quote, fees, max loss, stop and limit controls, preview, explicit approve and order-result reconciliation. No wallet signing required where supported broker/exchange API authorizations permit orders; never require custody in this app.
- **Portfolio:** performance, cost basis where data permits, exposures, funding, realized/unrealized P&L, order history and activity logs.
- **Login & Security:** dedicated user accounts (OIDC/passkeys or secure hosted auth), server-enforced sessions, MFA, encrypted exchange API credentials and distinct read/trade scopes, CSRF/rate limiting, auditing and emergency execution kill switch. No credentials in browser bundles.
- **Layout:** app-width responsive desktop workstation, data-dense but readable; persistent left navigation, central chart/research space and collapsible right-side AI plus trade ticket; mobile adapted separately.

## Integration constraints
- Do **not** remove code from current production wallet while developing the new app.
- Exchange capabilities and region eligibility must be verified per account and asset before presenting a live trade.
- No automatic trade execution or transfer without explicit final user approval. Preserve first-live-Kraken test ceiling of $10 notional and 2x maximum.
- Reuse existing Cloudflare AURELIS AI Worker only after real authenticated completion and response-shape tests; keep server-to-Worker origin allowlist.
- Do not claim AI agents, data feeds, or order routing are live unless actual telemetry confirms.
- Separate research engine, recommendation layer, exchange adapters, risk checks and execution services by permission boundary.

## Implementation milestones
1. Inventory and stabilize existing backend, feed health, and exchange/AI integrations. Introduce an independent /terminal application entry and full-width layout; no wallets or trading buttons enabled yet.
2. Implement secure login, account management, connected broker/exchange read-only balances and portfolio data.
3. Deliver wide charts, token deep dives, scanners and evidence-based AI chat with screenshot/chart context.
4. Connect validated venue-specific order previews and approvals; paper trade and reconcile end-to-end.
5. Enable narrow live spot flow only after demonstrated approval, legal/venue eligibility, risk checks and rollback. Perpetual execution only for eligible venues/jurisdictions and after separate verification.
6. Cut over to a dedicated standalone app/domain, then remove AI features from the legacy wallet after feature parity and explicit deployment plan.

## Acceptance criteria
A user can log in without any crypto wallet; open a token, see time-stamped market data and tokenomics, inspect a full-width chart with indicators, ask the AI about that chart including an uploaded screenshot, review scan explanations, and submit a valid trading order through a connected eligible exchange with explicit order-level approval. App never presents unavailable integrations as operational.
