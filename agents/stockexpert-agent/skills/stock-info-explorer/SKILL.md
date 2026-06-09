---
name: stock-info-explorer
description: >-
  A Yahoo Finance powered financial analysis tool for global markets.
  Get real-time quotes, generate technical indicator reports (RSI/MACD/Bollinger/VWAP/ATR),
  summarize fundamentals, and run one-shot comprehensive text reports.
  Supports US stocks, A-share, HK stocks, crypto, and forex.
---

# Stock Info Explorer

Real-time quotes, technical indicators, and fundamental summaries — powered by Yahoo Finance, no API key required.

## Supported Markets

US stocks · A-share (SSE/SZSE) · HK stocks · Cryptocurrency · Forex

## Commands

### 1) Real-time Quote (`price`)
```bash
uv run --script scripts/yf.py price TSLA
uv run --script scripts/yf.py price 000001.SZ
uv run --script scripts/yf.py price BTC-USD
```

### 2) Fundamental Summary (`fundamentals`)
```bash
uv run --script scripts/yf.py fundamentals NVDA
uv run --script scripts/yf.py fundamentals 600519.SS
```

### 3) Price History ASCII Chart (`history`)
```bash
uv run --script scripts/yf.py history AAPL 6mo
uv run --script scripts/yf.py history 000001.SZ 3mo
```

### 4) Technical Analysis Report (`pro`)
Outputs a detailed text report — no PNG charts generated.

```bash
# US stocks
uv run --script scripts/yf.py pro NVDA 6mo --rsi --macd --bb
uv run --script scripts/yf.py pro TSLA 6mo --rsi --macd --bb --vwap --atr

# A-share (Windows: prefix with $env:PYTHONIOENCODING='utf-8';)
uv run --script scripts/yf.py pro 000001.SZ 6mo --rsi --macd --bb
```

#### Available Indicators

| Flag | Indicator | Description |
|------|-----------|-------------|
| `--rsi` | RSI(14) | Relative Strength Index — overbought/oversold |
| `--macd` | MACD(12,26,9) | Trend momentum — crossovers and divergence |
| `--bb` | Bollinger Bands(20,2) | Volatility bands — squeeze and breakout |
| `--vwap` | VWAP | Volume Weighted Average Price |
| `--atr` | ATR(14) | Average True Range — volatility measure |

### 5) One-shot Report (`report`) ⭐
Comprehensive text report: quotes + fundamentals + all technical signals.

```bash
uv run --script scripts/yf.py report NVDA 6mo
uv run --script scripts/yf.py report 600519.SS 6mo
```

## Ticker Examples

| Market | Format | Examples |
|--------|--------|---------|
| US stocks | `TICKER` | `AAPL`, `NVDA`, `TSLA`, `MSFT`, `AMZN` |
| A-share (Shanghai) | `XXXXXX.SS` | `600519.SS`, `601318.SS` |
| A-share (Shenzhen) | `XXXXXX.SZ` | `000001.SZ`, `002594.SZ` |
| HK stocks | `XXXX.HK` | `0700.HK`, `9988.HK` |
| Crypto | `COIN-USD` | `BTC-USD`, `ETH-USD` |
| Forex | `XXXYYY=X` | `EURUSD=X`, `GBPUSD=X` |

## Workflow

When a user requests a quote or analysis:

1. **Resolve the stock name to a ticker**
   - If the user provides a ticker directly (`TSLA`, `000001.SZ`) → use as-is
   - If the user provides a company name (English or Chinese, e.g. "Tesla", "特斯拉", "平安银行") → use `web_search` to find the correct ticker symbol
   - Search query example: `"Tesla stock ticker symbol"` or `"平安银行 A-share ticker code"`

2. **Run the appropriate command** based on the user's request (price / fundamentals / pro / report)

3. **Present results** — output is already formatted; do not reformat or add extra summaries

## Notes & Limitations

- All indicators are **computed locally** from OHLCV data — no dependency on Yahoo's pre-computed series
- **PNG chart generation is disabled** — all output is text-based for CLI compatibility
- Data quality is highest for US stocks; some metrics may be missing for less-covered markets
- Real-time US quotes may have up to 15-minute delay
- On Windows PowerShell, prefix commands with `$env:PYTHONIOENCODING='utf-8';` when analyzing A-share stocks to avoid encoding issues
