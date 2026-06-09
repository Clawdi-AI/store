---
name: short-scanner
description: "STOCK short-selling scanner (NOT YouTube Shorts, NOT crypto). Use when user says: short, shorts, shorting, short targets, scan shorts, find shorts, short selling, software shorts, is X a good short, short X. Scans US stocks for overvalued SaaS/software companies to short-sell using a 7-factor scoring engine. Paper trading mode (default). Live trading via IBKR (Interactive Brokers) when --live flag is used. NEVER search YouTube or open a browser for these queries."
---

# Short Scanner

Scan for overvalued SaaS/software companies to short-sell. 7-factor scoring engine identifies targets vulnerable to AI disruption while filtering out companies with real AI moats.

**IMPORTANT:** This is a paper trading system by default. User is a first-time short seller. Always include risk warnings with actionable suggestions.

## Running Scans

No npm dependencies needed — all data fetched via native `fetch()`.

```bash
# Sector scan (software, healthcare-it, fintech, all)
node {baseDir}/scripts/scan.js --sector software --limit 10

# Single ticker analysis
node {baseDir}/scripts/scan.js --ticker CRM --verbose

# Search by keyword
node {baseDir}/scripts/scan.js --query "healthcare software" --min-score 55

# Scan the watchlist
node {baseDir}/scripts/scan.js --watchlist

# Monitor open positions
node {baseDir}/scripts/monitor.js

# Monitor single position
node {baseDir}/scripts/monitor.js --ticker CRM

# === Trade Simulator ===
# Open a simulated short (auto-sizes based on score)
node {baseDir}/scripts/trade.js --open --ticker ZM

# Open with specific share count or dollar amount
node {baseDir}/scripts/trade.js --open --ticker ZM --shares 100
node {baseDir}/scripts/trade.js --open --ticker ZM --dollars 15000

# Close a position (fetches real current price, records P&L)
node {baseDir}/scripts/trade.js --close --ticker ZM
node {baseDir}/scripts/trade.js --close --ticker ZM --reason "take profit at -20%"

# Partial close (sell some shares, keep the rest)
node {baseDir}/scripts/trade.js --close --ticker ZM --shares 50

# View portfolio
node {baseDir}/scripts/trade.js --portfolio

# View trade history
node {baseDir}/scripts/trade.js --history
```

## Natural Language Mapping

Map user requests to the right script:

| User says | Run |
|-----------|-----|
| "find short targets" / "scan for shorts" | `scan.js --sector all --limit 10` |
| "find healthcare software shorts" | `scan.js --sector healthcare-it` |
| "find fintech shorts" | `scan.js --sector fintech` |
| "analyze CRM for shorting" / "is CRM a good short?" | `scan.js --ticker CRM --verbose` |
| "search for overvalued cloud stocks" | `scan.js --query "cloud software"` |
| "check my watchlist" / "rescan watchlist" | `scan.js --watchlist` |
| "check my positions" / "how are my shorts doing?" | `monitor.js` |
| "portfolio status" / "exposure check" | `monitor.js --summary` |
| "short ZM" / "open a short on ZM" | `trade.js --open --ticker ZM` |
| "short ZM 100 shares" | `trade.js --open --ticker ZM --shares 100` |
| "short $15k of ZM" | `trade.js --open --ticker ZM --dollars 15000` |
| "close ZM" / "cover ZM" | `trade.js --close --ticker ZM` |
| "sell half of ZM" / "close 50 shares of ZM" | `trade.js --close --ticker ZM --shares 50` |
| "show my portfolio" / "what am I holding?" | `trade.js --portfolio` |
| "trade history" / "past trades" | `trade.js --history` |

## Presenting Results

### IMPORTANT: Use displaySummary

Each scan result includes a `displaySummary` field — a pre-formatted text block with company description, score breakdown, entry price, and trade suggestion. **Always show the displaySummary to the user.** Do not summarize or shorten it. The user wants to see:
- What the company does
- Every score factor with numbers and explanation
- The suggested entry price (current market price), not just the stop price
- How to execute the trade ("short TICKER" command)

### For Telegram Messages (cron alerts)

Show each result's `displaySummary`, prefixed with a number. Add portfolio summary at the end:

```
📉 Short Scanner — [Daily/Weekly] [Date]
Scanned: XXX stocks | Source: Yahoo Finance screener

🎯 Results:

[paste displaySummary for result 1]

[paste displaySummary for result 2]

📊 Portfolio: X positions | $XX,XXX exposed (XX%)
Mode: PAPER 📝
```

### For Conversation Responses

**Simply show the `displaySummary` field from each result.** It already contains everything the user needs:
- Company name and what they do
- Industry, price, market cap
- All 7 score factors with numbers and context
- Suggested entry price, shares, dollar amount, stop, take-profit targets
- How to execute the trade
- Warnings

Do NOT summarize or compress the displaySummary. Show it in full for every result.

After showing all results, add:
- Risk reminder: "⚠️ Short selling has unlimited loss potential. Paper trading mode is active."
- Prompt: "Say 'short TICKER' to open a simulated position, or 'short TICKER N shares' for custom sizing."

**Critical rules:**
- NEVER show just a ticker symbol without explaining what the company does
- ALWAYS show the entry price (current price), not just the stop price
- ALWAYS show the score breakdown, not just "Score 70"
- When user asks "what does this company do" — the answer is already in displaySummary, show it again

## Trade Simulator

All trades are executed in PAPER mode — real market prices, simulated positions. Use `trade.js` for all trade operations. **Never manually edit positions.json.**

### Opening a Short
When user says "short ZM" or "open a short on TICKER":
1. Run `trade.js --open --ticker TICKER` (auto-sizes based on score)
2. Show the result: entry price, shares, dollar amount, stop levels, max loss
3. Remind of risk (especially if first position or low score)

The trade.js script automatically:
- Fetches real-time price from Yahoo Finance
- Scores the ticker using the 7-factor engine
- Calculates position size based on score + adaptive performance history
- Sets stop loss and take profit levels
- Checks portfolio limits (max positions, max exposure)
- Records to positions.json with mode: "paper"

If user specifies shares or dollar amount, pass `--shares N` or `--dollars N`.

### Closing a Short
When user says "close ZM" or "cover my ZM position":
1. Run `trade.js --close --ticker TICKER`
2. Show the result: entry price, exit price, P&L, hold time, win/loss
3. Show updated performance stats (win rate, streak, lessons)

For partial closes: `trade.js --close --ticker TICKER --shares 50`
To record the reason: add `--reason "take profit"` or `--reason "stop hit"`

### Portfolio View
When user asks "how's my portfolio" or "what am I holding":
- Run `trade.js --portfolio` for current positions + performance history
- Run `monitor.js` for live P&L with stop/take-profit alerts
- Run `trade.js --history` for closed trade log

### How the Simulator Works
- **Entry**: Uses the real market price at time of command execution
- **Monitoring**: Daily cron fetches live prices, checks against stop/take-profit levels
- **Exit**: Uses the real market price at time of close command
- **P&L**: Calculated from real price movement (short P&L = entry - exit)
- **Learning**: Performance stats (win rate, streaks, sector patterns) feed back into position sizing
- **Mode label**: Every position and trade is marked `mode: "paper"` — clearly simulated

When user is ready for real trading, use the `--live` flag:
```bash
node {baseDir}/scripts/trade.js --open --ticker ZM --live
```
This routes orders through the **ibkr** skill (broker.js → IB Gateway → IBKR). Paper mode remains default.

## Watchlist Management

The watchlist at `state/watchlist.json` tracks targets being monitored:

```json
{
  "targets": [
    {
      "ticker": "EXAMPLE",
      "name": "Example Corp",
      "addedDate": "2026-02-25",
      "lastScore": 72,
      "lastScanned": "2026-02-25",
      "thesis": "AI-vulnerable workflow tool, P/S 12x",
      "notes": "Watch for earnings on 3/15"
    }
  ]
}
```

When user says "add to watchlist" or "watch TICKER", add it.
When user says "remove from watchlist", remove it.
When running `--watchlist`, update lastScore and lastScanned for each.

## Portfolio Intelligence & Adaptive Sizing

The system tracks all closed trades and learns from performance history. When presenting scan results or position suggestions, always include adaptive sizing context:

### What the Bot Knows
- **Total portfolio**: $300k capital, current exposure, remaining capacity
- **Trade history**: Win rate, avg win/loss %, best/worst trades, sector patterns
- **Streak tracking**: Current win/loss streak (last 5 trades)
- **Adaptive multiplier**: Automatically adjusts position sizing based on recent performance

### How Sizing Adapts
| Situation | Multiplier | Effect |
|-----------|-----------|--------|
| 3+ consecutive losses | 0.6x | Reduce sizes 40% (protect capital) |
| 2 consecutive losses | 0.8x | Reduce sizes 20% |
| 3+ consecutive wins | 1.15x | Increase sizes 15% (stay disciplined) |
| Win rate < 35% (5+ trades) | Cap at 0.7x | Conservative until strategy improves |
| Win rate > 60% (5+ trades) | Min 1.1x | Moderate confidence boost |
| Avg loss >> avg win | Cap at 0.75x | Tighten stops, reduce exposure |

### Presenting Performance Data
When showing monitor output or suggesting new positions, include:
1. **Current streak** and how it affects sizing
2. **Win rate** and total P&L
3. **Lessons learned** (e.g., "Struggling in healthcare-it sector — consider avoiding")
4. **Sizing adjustment explanation** if multiplier != 1.0

Example:
> "Your win rate is 45% (9W/11L). Currently on a 2-loss streak, so position sizes are reduced 20%. Avg loss (-8.2%) is larger than avg win (+5.1%) — suggesting tighter stops. DOCU suggested at 85 shares ($12,750) instead of the usual 106 shares ($15,900)."

### Portfolio Status Command
When user asks "how's my portfolio?" or "portfolio status", run `monitor.js --summary` and present:
- Total P&L (open + realized)
- Exposure % and remaining capacity
- Performance stats (win rate, streak, lessons)
- Any alerts (stops hit, take-profit reached)

## Deep Analysis Handoff

For tickers scoring >= 60, suggest using the **fundamental-stock-analysis** skill for a deep dive:

> "TICKER scored 78 — strong short candidate. Want me to run a full fundamental analysis using the fundamental-stock-analysis skill? This will give you a detailed 100-point scoring, balance sheet health, cash flow trends, and risk assessment."

The fundamental-stock-analysis skill provides:
- Structured 100-point fundamental scoring
- Data quality scorecard with confidence levels
- Sector-specific adjustments
- Bull/bear case with invalidation triggers
- Latest news and catalysts

## Reference Files

Read these for detailed methodology:
- `references/strategy.md` — Full scoring methodology, AI moat detection logic, data sources
- `references/risk-guide.md` — Position sizing, stop loss rules, first-time short seller warnings, broker notes, earnings protocol

## Workflow/Automation Software Notes (Snapshot: 2026-02-26)

Use these as quick context when Marvin asks about automation/workflow names.

### OS — OneStream
- **Core product:** Digital Finance Cloud (close/consolidation/planning/reporting)
- **Founding story:** Founded in 2012 (Tom Shea, Bob Powers, Craig Colby), scaled by replacing fragmented CPM stacks with one unified finance platform
- **Target market:** Mid/large enterprise CFO + finance teams
- **Scanner snapshot:** P/E 86.6 | Revenue growth +19.5% | Price $23.58 | Score 55/100 (PASS)

### TEAM — Atlassian
- **Core product:** Jira + Confluence + Jira Service Management (software/IT workflow stack)
- **Founding story:** Founded in 2002 by Mike Cannon-Brookes and Scott Farquhar; early bootstrap + product-led growth
- **Target market:** Dev teams, IT teams, enterprise cross-functional workflows
- **Scanner snapshot:** P/E 13.3 | Revenue growth +23.3% | Price $73.19 | Score 33/100 (FILTERED)

### HUBS — HubSpot
- **Core product:** HubSpot CRM platform (Marketing, Sales, Service, CMS, Operations Hubs)
- **Founding story:** Founded in 2006 by Brian Halligan and Dharmesh Shah; inbound marketing + freemium distribution
- **Target market:** SMB/mid-market GTM teams, expanding upmarket
- **Scanner snapshot:** P/E 16.2 | Revenue growth +20.4% | Price $245.70 | Score 32/100 (FILTERED)

## Risk Warnings

**Always include these reminders:**

For every scan result:
> ⚠️ Short selling has unlimited loss potential. Paper trading mode is active. Always use stop losses.

For position entries:
> ⚠️ Max loss on this position: $X,XXX (at 15% stop). Are you sure? Check borrow availability with your broker first.

For weekly reviews:
> ⚠️ Review all stops. Check for upcoming earnings. Verify total exposure is under 40%.

## State Files

| File | Purpose |
|------|---------|
| `state/positions.json` | Open/closed positions, portfolio config, trading mode |
| `state/watchlist.json` | Tracked targets with scores, dates, notes |
| `state/scan-history.json` | Past scan summaries for trend analysis |

Always read positions.json before any position operation to get current state.
