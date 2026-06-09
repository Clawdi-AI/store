---
name: trading-coach
description: |
  AI trade review coach — turn your broker's CSV export into actionable improvement insights.
  Supports US brokers (IBKR, Schwab, TD Ameritrade, Robinhood, Webull) and Asian brokers (Futu/Moomoo, Tiger, CITIC, Huatai).
  Automatic FIFO position matching, 8-dimension quality scoring, 10-dimension AI insights.
  Trigger when: user provides a trading CSV, asks to analyze trade performance, review trades,
  calculate P&L statistics, identify trading patterns, or says "review my trades" / "analyze my trading".
---

# 🏆 Trading Coach — AI Trade Review

> Stop trading on gut feel. Let data show you what's working and what needs to change.

Transform your broker's CSV trade history into a **professional review report** and **actionable improvement recommendations**.

## ✨ Core Capabilities

- 🔄 **Smart Import** — Auto-detects broker format from supported brokers
- 📊 **FIFO Matching** — Automatically pairs buys and sells into complete position cycles
- 🎯 **8-Dimension Scoring** — Entry, exit, trend, risk, market context, behavior, news fit, execution
- 💡 **AI Insights** — 10-dimension analysis that surfaces your trading blind spots

## 🚀 How to Use

Upload or paste your broker CSV export and ask the agent to review your trades. The agent reads the CSV directly — no separate script needed.

**Example prompts:**
- "Review my trades" + attach CSV
- "Analyze my IBKR trading history"
- "帮我复盘这份交易记录"

The agent will auto-detect your broker format, apply FIFO matching, score each position, and generate improvement insights.

## 📈 Supported Brokers

### US & International
| Broker | Format | Notes |
|--------|--------|-------|
| Interactive Brokers (IBKR) | Activity Statement CSV | Use "Trades" section |
| Charles Schwab | Trade History CSV | Export from Transaction History |
| TD Ameritrade / thinkorswim | Transaction History CSV | |
| Robinhood | Account CSV export | Download from app |
| Webull | Transactions CSV | Export from Order History |

### Asian Brokers
| Broker | Encoding | Detection fields |
|--------|----------|-----------------|
| Futu / Moomoo (English) | UTF-8 | Side, Symbol, Fill Time |
| Futu / Moomoo (Chinese) | UTF-8-BOM | 方向, 代码, 成交时间 |
| Tiger Brokers | UTF-8 | 交易方向, 股票代码 |
| CITIC Securities | GBK | 买卖标志, 证券代码 |
| Huatai Securities | GBK | 操作, 证券代码 |

See [references/csv_formats.md](references/csv_formats.md) for full field specifications.

## 🎯 Scoring System

8 dimensions, each weighted:

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Entry quality | 18% | Timing and technical indicator alignment |
| Exit quality | 17% | Stop-loss and take-profit execution |
| Trend alignment | 14% | Trading with or against the trend (ADX) |
| Risk management | 12% | R:R ratio, MAE/MFE control |
| Market context | 11% | Market condition fit at entry |
| Trading behavior | 11% | Discipline, impulse detection |
| News fit | 7% | Consistency with news/events backdrop |
| Execution quality | 5% | Slippage, fill efficiency |

**Grades**: A (90+) / B (80–89) / C (70–79) / D (60–69) / F (<60)

See [references/scoring_system.md](references/scoring_system.md) for full details.

## 💡 AI Insights

10-dimension deep analysis of your trading patterns:

1. Entry analysis
2. Exit analysis
3. Risk control
4. Holding duration
5. Fee drag
6. Historical comparison
7. Pattern recognition
8. Root cause analysis
9. Event correlation
10. Improvement recommendations

See [references/insight_dimensions.md](references/insight_dimensions.md) for full details.

## 📋 Output Format

**ALWAYS structure the report in exactly these 5 sections, in order:**

---

### Section 1 — FIFO Position Table

List every matched position as a table. Include all positions from the CSV.

| # | Symbol | Direction | Entry Date | Exit Date | Qty | Entry Price | Exit Price | P&L | P&L% |
|---|--------|-----------|------------|-----------|-----|-------------|------------|-----|------|
| 1 | AAPL | Long | 2024-01-10 | 2024-01-15 | 100 | $182.50 | $189.30 | +$680 | +3.7% |
| 2 | TSLA | Long | 2024-01-12 | 2024-01-18 | 50 | $235.00 | $219.50 | -$775 | -6.6% |

---

### Section 2 — Core Statistics

Present as a single-line summary followed by a 2-column stat block:

```
Total positions: 12  |  Win rate: 58.3%  |  Total P&L: +$2,840  |  Avg score: 71.2 (C)
```

| Metric | Value |
|--------|-------|
| Total trades | 12 |
| Winners / Losers | 7 / 5 |
| Best trade | NVDA +$1,200 (+8.4%) |
| Worst trade | TSLA -$775 (-6.6%) |
| Avg holding period | 4.2 days |
| Total fees | $124 (4.4% of P&L) |

---

### Section 3 — 8-Dimension Quality Score Table

Score each dimension 0–100 and convert to stars (⭐ scale: <60=⭐, 60-69=⭐⭐, 70-79=⭐⭐⭐, 80-89=⭐⭐⭐⭐, 90+=⭐⭐⭐⭐⭐).

| Dimension | Score | Rating | Key Finding |
|-----------|-------|--------|-------------|
| Entry quality | 68 | ⭐⭐⭐ | RSI often elevated at entry |
| Exit quality | 74 | ⭐⭐⭐ | Stop-loss discipline adequate |
| Trend alignment | 81 | ⭐⭐⭐⭐ | Mostly trading with trend |
| Risk management | 55 | ⭐⭐ | R:R ratio below 1.5 on avg |
| Market context | 72 | ⭐⭐⭐ | Good market timing |
| Trading behavior | 78 | ⭐⭐⭐ | Some impulse trades detected |
| News fit | 65 | ⭐⭐⭐ | Limited news correlation |
| Execution quality | 82 | ⭐⭐⭐⭐ | Low slippage |
| **Overall** | **72** | **⭐⭐⭐** | **C — Room to improve** |

---

### Section 4 — 10-Dimension AI Insights

Number each insight. Use emoji to indicate type: ✅ positive, ⚠️ warning, ❌ critical, 💡 suggestion.
Each insight = 1–2 lines: what was found + specific actionable recommendation.

1. ⚠️ **Entry timing** — RSI exceeded 70 on 4 of 12 entries (TSLA, META). Avoid chasing; wait for RSI to pull back below 60.
2. ✅ **Stop-loss discipline** — Average loss capped at 3.1%. Consistent with plan — maintain this.
3. ❌ **Risk/reward ratio** — Avg R:R was 0.9:1 (below the 1.5 minimum). Widen profit targets or tighten stops.
4. ⚠️ **Holding periods too short** — 5 of 7 winners were closed within 2 days. Let winners run; use trailing stops.
5. 💡 **Fee drag** — Fees consumed 4.4% of gross P&L. Consolidate small trades to reduce commission impact.
6. 💡 **Historical comparison** — AAPL: 3 previous trades averaged +$420; this trade +$680. Entry discipline improved.
7. ⚠️ **Pattern: Monday entries underperform** — 3 Monday entries averaged -2.1% vs +1.8% for other days.
8. ❌ **Root cause — TSLA loss** — Entered against trend (ADX 35, bearish); direction error compounded by no stop.
9. ⚠️ **Event risk** — 2 positions held through earnings (NVDA, MSFT). Reduce size or hedge before earnings dates.
10. 💡 **Top improvement** — Fix R:R ratio first: it alone could shift overall performance from C to B within 30 trades.

---

### Section 5 — One-Line Summary

End with a blockquote summary sentence:

> **Bottom line**: Trend alignment is your strength (⭐⭐⭐⭐); risk/reward ratio is your biggest drag — fix it first.

---

**Important formatting rules:**
- Always render all 5 sections even if data is limited
- If CSV has fewer than 5 positions, still show all 10 insights (mark low-confidence ones with `(estimated)`)
- Use actual numbers from the CSV — never use placeholder values in the final output
- Keep each insight to 1–2 lines max
- The overall score in Section 3 is the weighted average per scoring_system.md
