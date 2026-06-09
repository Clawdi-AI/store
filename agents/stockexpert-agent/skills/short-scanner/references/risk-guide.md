# Risk Management Guide

## IMPORTANT: First-Time Short Seller Warnings

Short selling has unlimited loss potential. When you buy a stock, you can lose 100% of your investment. When you short a stock, you can lose MORE than 100% because there is no ceiling on how high a stock can go.

### Key Risks You Must Understand

1. **Unlimited Loss Potential** — A $100 stock can go to $500. Your $24k position becomes a $120k loss.

2. **Margin Requirements** — Your broker requires margin collateral. If the stock rises, you get margin calls and must deposit more cash or close the position at a loss.

3. **Borrow Costs** — You pay a daily fee to borrow shares. Hard-to-borrow stocks can cost 10-50%+ annualized. Check borrow availability before shorting.

4. **Short Squeezes** — If many shorts pile in and the stock rises, forced covering creates a feedback loop driving the price higher. See: GME 2021.

5. **Dividend Risk** — If the company pays dividends while you're short, YOU pay those dividends. Check ex-dividend dates.

6. **Buyout/Acquisition Risk** — A buyout offer at a premium can cause instant 20-50% loss on your short.

7. **Earnings Volatility** — Stocks can gap up 20-40% on surprise earnings. Never hold a large short position into earnings without a plan.

8. **Buy-In Risk** — Your broker can force-close your short at any time if shares become unavailable for borrowing.

## Paper Trading Requirement

**Start in paper mode for 2-4 weeks minimum.** This means:
- All positions are tracked as simulated in positions.json
- No real money at risk
- You learn the mechanics (entry, monitoring, exit)
- You see how your strategy performs in real market conditions
- Only switch to `mode: "live"` after proving the strategy works

## Position Sizing Rules

| Score | Position Size | Dollar Amount ($300k portfolio) |
|-------|--------------|--------------------------------|
| 80-100 | 6-8% | $18,000-$24,000 |
| 70-79 | 4-5.5% | $12,000-$16,500 |
| 60-69 | 2.5-4% | $7,500-$12,000 |
| <60 | Watchlist only | $0 |

## Portfolio Limits (Hard Rules)

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max short exposure | 40% ($120k) | Never risk more than 40% of portfolio on shorts |
| Max per position | 8% ($24k) | No single stock can blow up the portfolio |
| Max concurrent positions | 8 | Focus, not spray-and-pray |
| Hard stop loss | 15% above entry | Automatic exit — no exceptions |
| Soft alert | 10% above entry | Review and decide |

## Stop Loss Rules

### Hard Stop: Entry Price + 15%
- If you shorted at $100, your hard stop is $115
- When the stock hits this level: CLOSE THE POSITION
- No hoping, no "it'll come back down"
- This limits max loss to ~$3,600 on a $24k position

### Soft Alert: Entry Price + 10%
- Warning level — review the position
- Check: has the thesis changed? Is there news?
- Options: hold (if thesis intact), reduce size, or close early

### Take Profit Tiers
- **-15%**: Take 1/3 of the position off ($100 → $85)
- **-25%**: Take another 1/3 off ($100 → $75)
- **-35%**: Close the rest ($100 → $65)

This locks in profits progressively while letting winners run.

## Pre-Entry Checklist

Before opening any short position (even in paper mode):

1. Score >= 60 from the scanner
2. No high AI moat flags
3. Portfolio exposure still within limits
4. Borrow availability confirmed (live mode)
5. No earnings within 2 weeks (or you accept the risk)
6. No pending M&A rumors
7. Read the fundamental-stock-analysis deep dive if available
8. Set your stop loss BEFORE entering

## Earnings Season Protocol

- **2 weeks before earnings**: Do NOT open new shorts in that stock
- **Existing positions**: Either close before earnings or accept the gap risk
- **After earnings**: Wait 2-3 days for the dust to settle before acting

## Weekly Review Checklist

Every Sunday evening review:
1. All position P&Ls and alerts
2. Re-score watchlist for changes
3. Check sector news for thesis shifts
4. Verify exposure is within limits
5. Update watchlist (add/remove targets)
6. Review closed positions for lessons learned

## Broker Notes

Broker not yet decided. This guide applies to any major broker (Interactive Brokers, Fidelity, Schwab):
- Interactive Brokers: Best borrow availability, lowest margin rates, most tools
- Fidelity: Good for beginners, solid platform, limited hard-to-borrow
- Schwab: Good general platform, check short availability per stock

When you choose a broker, update positions.json config with broker-specific notes.
