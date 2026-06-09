---
name: stock-deep-analyzer
description: >-
  A comprehensive stock deep analysis tool that combines real-time quotes, fundamental metrics,
  technical indicators, and growth analysis into a single professional report.
  Fully supports US stocks (NYSE/NASDAQ), A-share (SSE/SZSE), and HK stocks.
  Generates detailed investment recommendations with risk assessment and actionable trading strategies.
---

# Stock Deep Analyzer ⭐

One-shot comprehensive stock analysis — professional-grade reports for US and A-share markets.

## Features

✅ **Real-time Market Data** — Current price, volume, market cap, beta  
✅ **Value Investing Metrics** — P/E, P/B, PEG, ROE, ROA, dividend yield, payout ratio  
✅ **Technical Indicators** — MA5/20/60, RSI(14), MACD, Bollinger Bands, VWAP  
✅ **Growth Analysis** — Revenue growth YoY, earnings growth YoY, profit margins  
✅ **Financial Health** — Debt-to-equity ratio, current ratio, asset efficiency  
✅ **Investment Rating** — Multi-dimensional scoring (value/growth/technical/financial)  
✅ **Trading Strategies** — Long-term hold, swing trade, short-term speculation  
✅ **Risk Assessment** — Automated red flags and key price levels  

## Supported Markets

| Market | Ticker Format | Examples |
|--------|--------------|---------|
| US stocks | `TICKER` | `AAPL`, `TSLA`, `NVDA`, `MSFT` |
| A-share (Shanghai) | `XXXXXX.SS` | `600519.SS`, `601318.SS` |
| A-share (Shenzhen) | `XXXXXX.SZ` | `000001.SZ`, `002594.SZ` |
| Hong Kong | `XXXX.HK` | `0700.HK`, `9988.HK` |

## Usage

### macOS / Linux
```bash
# US stock analysis
uv run --script scripts/deep_analyze.py NVDA
uv run --script scripts/deep_analyze.py AAPL --period 1y

# A-share analysis
uv run --script scripts/deep_analyze.py 600519.SS
uv run --script scripts/deep_analyze.py 000001.SZ --period 1y
```

### Windows PowerShell
```powershell
$env:PYTHONIOENCODING='utf-8'; uv run --script scripts/deep_analyze.py NVDA
$env:PYTHONIOENCODING='utf-8'; uv run --script scripts/deep_analyze.py 600519.SS --period 1y
```

### Parameters

| Parameter | Description | Example | Default |
|-----------|-------------|---------|---------|
| `ticker` | Stock ticker symbol (required) | `NVDA`, `600519.SS` | — |
| `--period` | Analysis period | `1mo`, `3mo`, `6mo`, `1y`, `2y` | `6mo` |
| `--output` | Output format | `text`, `json` | `text` |

## Example Output — US Stock (NVDA)

```
============================================================
NVIDIA Corp (NVDA) - Deep Analysis Report
============================================================

[Real-time Overview]
  Current: $875.40 (+2.31%)
  Market Cap: $2.16T  |  Beta: 1.73
  52-Week Range: $455.72 - $974.00

[Value Investing - Score: 62/100]
  ⚠️  P/E: 65.2 (Growth premium)
  ✅  ROE: 123.8% (Exceptional)
  ✅  Profit Margin: 55.04%
  ✅  Dividend Yield: 0.03%

[Technical Analysis - Score: 78/100]
  ✅  RSI: 58.3 (Neutral — room to run)
  ✅  MACD: Bullish crossover
  ✅  Price above MA20 and MA60
  ⚠️  Near upper Bollinger Band

[Growth - Score: 95/100]
  ⭐  Revenue Growth YoY: +122%
  ⭐  Earnings Growth YoY: +581%

[Investment Rating: ⭐⭐⭐⭐ Strong Buy]

Recommended Strategy:
- Long-term hold: 15-20% position, target $1,050-1,200
- Swing trade: Buy $850-875, target $950-980
- Stop loss: $820

Key Risks:
- High valuation (P/E premium requires sustained growth)
- AI infrastructure spending cycle sensitivity
- Competitive pressure from AMD, Intel
```

## Example Output — A-Share

```
============================================================
Agricultural Bank of China (601288.SS) - Deep Analysis Report
============================================================

[Real-time Overview]
  Current: ¥6.48 (+1.25%)
  Market Cap: ¥2.27T  |  Beta: 0.62
  52-Week Range: ¥4.92 - ¥8.68

[Value Investing - Score: 90/100]
  ✅  P/E: 8.31 (Undervalued)
  ✅  P/B: 0.83 (Below book value)
  ✅  ROE: 9.37%
  ✅  Dividend Yield: 3.83%

[Investment Rating: ⭐⭐⭐⭐ Strong Buy]
```

## Output Structure

The analysis report includes:

### 1. Real-time Market Overview
- Current price, change %, volume
- 52-week range, market cap, beta

### 2. Value Investing Indicators
- Valuation: P/E, P/B, PEG
- Profitability: ROE, ROA, profit margin
- Dividends: yield, payout ratio
- **Value Score: /10**

### 3. Technical Analysis
- Moving Averages: MA5, MA20, MA60
- Momentum: RSI(14)
- Trend: MACD
- Volatility: Bollinger Bands
- Volume: VWAP analysis
- **Technical Score: /10**

### 4. Growth Indicators
- Revenue growth (YoY)
- Earnings growth (YoY)
- Margin trends
- **Growth Score: /10**

### 5. Financial Health
- Debt-to-equity ratio
- Current ratio (liquidity)
- Asset efficiency

### 6. Comprehensive Investment Advice
- **Overall Rating: /10**
- Investment strategies (long-term hold / swing trade / short-term speculation)
- Key price levels (support/resistance/targets)
- Risk warnings
- Valuation targets

## When to Use This Skill

- User requests "deep analysis", "complete analysis", "comprehensive report"
- User wants multi-dimensional evaluation (value + growth + technical)
- User needs actionable trading strategies with specific price levels
- User asks for investment recommendations with risk assessment

## Workflow

When a user requests stock analysis:

1. **Resolve the stock name to a ticker**
   - If the user provides a ticker directly (`AAPL`, `600519.SS`) → use as-is
   - If the user provides a company name (English or Chinese, e.g. "Apple", "苹果", "贵州茅台", "英伟达") → use `web_search` to find the correct ticker symbol
   - Search query example: `"Apple Inc stock ticker symbol"` or `"贵州茅台 stock ticker Yahoo Finance"`

2. **Run analysis**
   ```bash
   uv run --script scripts/deep_analyze.py <ticker>
   ```

3. **Interpret and present results**
   - Highlight the overall rating and investment recommendation
   - Emphasize key risks and specific price levels
   - Keep the full formatted report intact — do not reformat or summarize

## Requirements

Python packages (auto-installed by uv): `yfinance`, `pandas`, `numpy`  
No API key required — uses Yahoo Finance public data.

## Notes

- On Windows: always prefix commands with `$env:PYTHONIOENCODING='utf-8';` to avoid encoding issues with A-share output
- Use English variable names in Python scripts
- Data source: Yahoo Finance via yfinance — no API key required
- Analysis period affects technical indicators accuracy

## Limitations

- Yahoo Finance data quality varies by market (US data is highest quality)
- Some metrics may be N/A for loss-making or newly listed companies
- Real-time quotes may have up to 15-min delay for US markets
- Historical data limited for newly listed stocks
