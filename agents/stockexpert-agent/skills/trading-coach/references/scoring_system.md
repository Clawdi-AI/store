# Quality Scoring System

## Overview

8-dimension weighted scoring system. Each dimension scores 0–100; the composite score is the weighted average.

| Dimension | Weight | What it evaluates |
|-----------|--------|------------------|
| Entry quality | 18% | Entry timing and technical indicator alignment |
| Exit quality | 17% | Take-profit and stop-loss execution |
| Trend alignment | 14% | Trading with or against trend; trend strength |
| Risk management | 12% | R:R ratio, MAE/MFE control |
| Market context | 11% | Market condition fit at time of entry |
| Trading behavior | 11% | Discipline, impulse trading detection |
| News fit | 7% | Consistency with news/event backdrop |
| Execution quality | 5% | Slippage, fill efficiency |
| Options scoring | 5% | Options only: Greeks, DTE, Moneyness |

## Grade Scale

| Score | Grade | Meaning |
|-------|-------|---------|
| 90–100 | A | Excellent — strong across all dimensions |
| 80–89 | B | Good — solid overall performance |
| 70–79 | C | Average — room for improvement |
| 60–69 | D | Below average — strategy adjustment needed |
| 0–59 | F | Poor — significant issues identified |

---

## Entry Quality (18%)

Evaluates whether the entry timing was sound.

### Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Technical indicator alignment | 40% | RSI, MACD, Bollinger Bands supporting entry direction |
| Support/resistance positioning | 30% | Entry near a key price level |
| Volume confirmation | 20% | Above-average volume confirming the move |
| Market context | 10% | Broad market condition favorable |

### Technical Indicator Detail

**RSI (Relative Strength Index)**
- Long entry: RSI < 30 → 95 pts · 30–40 → 80 pts · 40–50 → 65 pts
- Short entry: RSI > 70 → 95 pts · 60–70 → 80 pts · 50–60 → 65 pts
- Buying overbought / selling oversold: −30 to −50 pts

**MACD**
- Golden cross (long) / death cross (short): +20 pts
- Divergence confirmation: +15 pts
- Histogram direction aligned with trade: +10 pts

**Bollinger Bands**
- Entry near lower band (long) / upper band (short): +15 pts
- Entry outside bands: −10 pts

---

## Exit Quality (17%)

Evaluates take-profit and stop-loss execution.

### Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Take-profit execution | 30% | Exiting near or at target level |
| Stop-loss discipline | 30% | Cutting losses promptly |
| Exit timing | 20% | Capturing the optimal exit point |
| Position management | 20% | Appropriate holding duration |

### P&L Scoring Detail

| P&L % | Score adjustment |
|--------|-----------------|
| Profit > 5% | +20 |
| Profit 2–5% | +10 |
| Profit 0–2% | +5 |
| Loss 0–2% | −5 |
| Loss 2–5% | −10 |
| Loss > 5% | −20 |

**Stop-loss control:**
- Loss < 2%: stop-loss executed well
- Loss 2–5%: acceptable
- Loss > 10%: stop-loss failure, significant penalty

---

## Trend Alignment (14%)

Evaluates whether the trade direction matched the prevailing trend.

### Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Direction consistency | 40% | Trade direction aligned with trend |
| Trend strength | 30% | ADX trend strength at entry |
| Momentum alignment | 30% | MACD and RSI direction consistent |

### ADX Score Adjustment

| ADX value | Trend strength | Score adjustment |
|-----------|---------------|-----------------|
| > 40 | Very strong | +15 |
| 25–40 | Strong | +10 |
| 20–25 | Moderate | +5 |
| < 20 | Weak / choppy | −5 |

---

## Risk Management (12%)

Evaluates overall risk control quality.

### Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| R:R ratio | 40% | Risk-to-reward ratio |
| MAE control | 30% | Maximum adverse excursion control |
| MFE utilization | 30% | Maximum favorable excursion captured |

### R:R Score Table

| R:R | Score |
|-----|-------|
| > 3 | 95 |
| 2–3 | 85 |
| 1.5–2 | 75 |
| 1–1.5 | 65 |
| < 1 | 50 |

### Fee Impact

| Fees as % of P&L | Score adjustment |
|------------------|-----------------|
| < 5% | +15 |
| 5–10% | +5 |
| > 20% | −15 |

---

## Market Context (11%)

Evaluates how well the entry fit the broader market environment.

- Trading with the broad market direction: +10 pts
- Low VIX environment at entry: +5 pts
- Avoiding entries around earnings/major events: +5 pts

---

## Trading Behavior (11%)

Evaluates discipline and behavioral patterns.

- No chasing / panic selling: +10 pts
- Appropriate holding duration: +10 pts
- No overtrading: +5 pts
- No emotional trading patterns: +5 pts

---

## Options Scoring (5%) — Options trades only

### Entry Evaluation

| Dimension | Weight | Optimal condition |
|-----------|--------|------------------|
| Moneyness | 25% | ATM ± 5% |
| Trend alignment | 25% | Call for bullish / Put for bearish |
| IV environment | 25% | Moderate implied volatility |
| Time value | 25% | DTE 30–60 days |

### Moneyness Score

| Moneyness | Description | Score |
|-----------|-------------|-------|
| ATM ± 2% | At the money | 90 |
| ITM 2–5% | In the money | 80 |
| OTM 2–5% | Out of the money | 70 |
| OTM > 10% | Deep out of the money | 50 |

### DTE Score

| DTE | Description | Score |
|-----|-------------|-------|
| 30–60 days | Ideal range | 90 |
| 14–30 days | Acceptable | 75 |
| 7–14 days | Higher risk | 60 |
| < 7 days | Theta accelerating | 40 |

---

## Composite Score Calculation

### Stocks
```
Score = Entry(18%) + Exit(17%) + Trend(14%) + Risk(12%)
      + Market(11%) + Behavior(11%) + News(7%) + Execution(5%) + Options(5%)
```

### Options
Options trades additionally compute the options-specific score and blend it in at 5%.

---

## How to Use Scores

1. **Screen for quality setups**: Only take trades scoring ≥ 70 in your pre-trade checklist
2. **Review low-scoring trades**: Focus post-analysis on trades below 60 to identify root causes
3. **Track improvement**: Monitor your average score trend over time
4. **Target weak dimensions**: Find your consistently lowest-scoring dimension and focus improvement there
