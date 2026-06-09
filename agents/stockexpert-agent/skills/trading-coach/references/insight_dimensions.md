# AI Insight Dimensions

Trading Coach analyzes your trades across 10 dimensions to generate actionable improvement recommendations.

---

## 1. Entry Analysis

Analyzes entry timing and technical indicator alignment.

### Detection Rules

| Pattern | Trigger condition | Type |
|---------|------------------|------|
| Buying overbought | RSI > 70 on long entry | ⚠️ Warning |
| Selling oversold | RSI < 30 on short entry | ⚠️ Warning |
| Low-score entry | Entry score < 50 | ⚠️ Warning |
| Strong entry | Entry score ≥ 80 | ✅ Positive |

### Typical Recommendations
- Wait for cleaner technical confirmation before entering
- Avoid chasing when RSI > 70
- Look for long entries near support levels

---

## 2. Exit Analysis

Evaluates take-profit and stop-loss execution.

### Detection Rules

| Pattern | Trigger condition | Type |
|---------|------------------|------|
| Large loss | Single trade loss > 10% | ❌ Negative |
| Stop-loss failure | Loss exceeds pre-set stop level | ❌ Negative |
| Early profit-taking | Profit < 2% at close | ⚠️ Warning |
| Disciplined stop-loss | Loss contained within 2% | ✅ Positive |

### Typical Recommendations
- Define your stop-loss level before entering and honor it
- Keep single-trade losses within 2–5%
- Consider trailing stops to lock in profits

---

## 3. Risk Control

Analyzes overall risk management quality.

### Detection Rules

| Pattern | Trigger condition | Type |
|---------|------------------|------|
| High fee drag | Fees > 20% of P&L | ⚠️ Warning |
| Oversized position | Single trade > 10% of portfolio | ⚠️ Warning |
| Poor R:R | Risk-to-reward ratio < 1 | ❌ Negative |
| Solid control | Max drawdown < 10% | ✅ Positive |

### Typical Recommendations
- Reduce trade frequency to lower cumulative fees
- Keep single-position size below 5% of total capital
- Ensure R:R is at least 1.5:1 before entering

---

## 4. Holding Duration

Analyzes whether position holding periods are appropriate.

### Detection Rules

| Pattern | Trigger condition | Type |
|---------|------------------|------|
| Very short holds | Avg holding < 1 hour | ⚠️ Warning |
| Overtrading | Short-term trades > 20% of total | ⚠️ Warning |
| Very long holds | Avg holding > 30 days | ℹ️ Note |

### Typical Recommendations
- Give your trades room to develop before closing
- Separate day-trading and swing-trading strategies intentionally
- Use time-based stops to avoid tying up capital indefinitely

---

## 5. Fee Drag

Analyzes the impact of transaction costs on profitability.

### Detection Rules

| Pattern | Trigger condition | Type |
|---------|------------------|------|
| Fee erosion | Total fees > 20% of total profit | ❌ Negative |
| High-frequency small trades | Frequent small-size trades | ⚠️ Warning |
| Low fee impact | Fee ratio < 5% | ✅ Positive |

### Typical Recommendations
- Reduce trade frequency
- Increase average position size per trade
- Compare broker fee structures — zero-commission brokers (Robinhood, Webull) may suit your style

---

## 6. Historical Comparison

Compares current trade performance against your own historical trades in the same ticker or category.

### Analysis Areas
- Same ticker: compare this trade to previous trades in the same stock
- Same direction (long/short) comparison
- Same holding duration bracket comparison

### Example Output
```
AAPL trade history:
- This trade: −$150 (loss)
- Your historical average: +$200
- Your historical win rate on AAPL: 65%
Likely cause: Entry RSI was elevated at 72
```

---

## 7. Pattern Recognition

Identifies recurring patterns across your trade history.

### Patterns Detected

| Pattern | Description |
|---------|-------------|
| Repeated losses on same ticker | Losing 3+ times on the same stock |
| Time-of-day performance variance | Different results at open / mid-day / close |
| Day-of-week patterns | Consistent underperformance on specific days |
| Winning streak patterns | Identifying strategies that consistently work |

### Typical Recommendations
- Pause or reduce size on tickers where you have 3+ consecutive losses
- Avoid your historically weak time windows
- Double down on repeatable winning setups

---

## 8. Root Cause Analysis

Attributes P&L outcomes to underlying causes.

### Attribution Dimensions

| Root cause | Description | Example |
|------------|-------------|---------|
| `timing` | Entry/exit timing issue | Entered too early / exited too late |
| `direction` | Wrong directional call | Counter-trend trade |
| `position_size` | Size too large or too small | Oversized relative to conviction |
| `external_event` | External catalyst | Earnings surprise, macro event |
| `execution` | Execution issue | Slippage, partial fill |

### Output Format
```json
{
  "position_id": 123,
  "pnl": -500,
  "root_cause": "timing",
  "analysis": "Entry RSI was 75 — overbought zone",
  "suggestion": "Wait for RSI to pull back below 50 before entering long"
}
```

---

## 9. Event Correlation

Correlates trades with earnings, price spikes, and volume anomalies.

### Events Detected
- Trades held through earnings dates
- Price spikes during holding period (single day > 5%)
- Volume anomalies (> 2× average volume)
- Major macro or news events

### Example Output
```
⚠️  Earnings risk: held through earnings
NVDA position included earnings date (2024-02-21)
Post-earnings move: +15%
Recommendation: Consider reducing size or closing before earnings to limit binary risk
```

---

## 10. Improvement Recommendations

Aggregates the highest-priority, actionable improvements from all other dimensions.

### Recommendation Categories

| Category | Priority | Example |
|----------|----------|---------|
| Risk control | High | Set and honor stop-loss levels |
| Entry optimization | High | Wait for signal confirmation |
| Exit optimization | Medium | Use trailing stops |
| Cost control | Medium | Reduce trade frequency |
| Psychology | Low | Avoid revenge trading |

### Recommendation Format

Each recommendation includes:
- **Title**: Concise label
- **Problem**: What was observed
- **Evidence**: Supporting data
- **Recommendation**: Specific action to take
- **Example trade**: Illustrative case from your history

---

## Insight Priority Levels

Insights are ranked and surfaced by priority:

| Priority score | Level | Type |
|---------------|-------|------|
| 90–100 | 🚨 Critical | Major loss, risk out of control |
| 70–89 | 🔴 High | Frequent errors, persistent pattern |
| 50–69 | 🟡 Medium | Optimization opportunities |
| 30–49 | 🟢 Low | Minor suggestions |
| 0–29 | ℹ️ Info | Positive feedback |

---

## Usage Tips

1. **Address critical insights first**: Focus on the 70+ priority items immediately
2. **Build a pre-trade checklist**: Turn recurring insights into checklist items
3. **Review regularly**: Check insight trends weekly/monthly
4. **Track adoption**: Log which recommendations you've implemented and measure impact
5. **Share with a trading partner**: Discussing insights often accelerates improvement
