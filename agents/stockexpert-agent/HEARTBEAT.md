# HEARTBEAT.md — Periodic Task Config

## ⚠️ Agent Protocol: Read This First

- **Check ONCE per session start.** Never loop, never retry in the same session.
- **If the watchlist below is empty:** ask the user ONCE what stocks to track, then stop — do not loop.
- **After one failed attempt to get tickers, stop completely.** Print a summary and wait for user input.

---

## Default Watchlist

When the user hasn't customized their watchlist yet, use these defaults:

```
SPY     # S&P 500 ETF — broad market benchmark
QQQ     # Nasdaq 100 ETF — tech-heavy benchmark
AAPL    # Apple Inc.
NVDA    # NVIDIA Corp
TSLA    # Tesla Inc.
```

---

## User Watchlist

<!-- User: replace the defaults above or add tickers here -->
<!-- Example:
- 600519.SS   # Kweichow Moutai (A-share)
- MSFT        # Microsoft
- 000001.SZ   # Ping An Bank
-->

---

## Session Start Protocol

On each session start, do this exactly **once**:

1. Check if USER.md contains a configured watchlist. If yes, use it.
2. If no watchlist in USER.md, use the defaults listed above.
3. Run `fetch_announcements.py` or `deep_analyze.py` for each ticker — **fresh data only, never from memory files**.
4. Present results to user.
5. **Stop.** Do not repeat. Do not loop back to step 1.

**Onboarding (first session only):** If USER.md is empty or missing, greet the user and ask:
> "Welcome! I'll track stocks for you automatically each session. What tickers do you want me to watch? (I'm using SPY, QQQ, AAPL, NVDA, TSLA as defaults — just say the word to customize.)"
