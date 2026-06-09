# Stock Expert Agent

> AI-powered stock research agent for **US & A-share markets** — real-time quotes, SEC filings, corporate announcements, deep multi-dimensional analysis, and broker trade review.

No paid data subscriptions required.

---

## 🇺🇸 US Market Support

Stock Expert is built with North American investors as a first-class use case:

| Capability | US Market | A-Share Market |
|---|---|---|
| Real-time quotes | ✅ NYSE / NASDAQ / AMEX | ✅ SSE / SZSE |
| Deep analysis (value + technical + growth) | ✅ Full support | ✅ Full support |
| Corporate announcements & filings | ✅ SEC EDGAR (8-K, 10-K, 10-Q, S-1...) | ✅ Eastmoney / AkShare |
| Technical indicators (RSI / MACD / BB / VWAP) | ✅ | ✅ |
| Trade review from broker CSV | ✅ IBKR, Schwab, TD Ameritrade, Robinhood, Webull | ✅ Futu, Tiger |

Data sources: **Yahoo Finance** (quotes & analysis) · **SEC EDGAR** (US filings, free, no API key) · **AkShare / Eastmoney** (A-share announcements)

---

## 🚀 Quick Deploy

### Step 1 — Clone the repo

```bash
git clone https://github.com/xiaolu7586/stockexpert-agent.git
```

### Step 2 — Copy workspace to your ClawDI directory

**macOS / Linux:**
```bash
cp -r stockexpert-agent ~/.clawdi/workspace-stockexpert-1
```

**Windows (PowerShell):**
```powershell
Copy-Item -Recurse stockexpert-agent "$env:USERPROFILE\.clawdi\workspace-stockexpert-1"
```

### Step 3 — Add agent config to your ClawDI config file

Open your ClawDI config file and append the following to the `agents.list` array.  
Replace `{YOUR_MODEL_ID}` with your model (e.g. `claude-sonnet-4-6`) and set the correct `workspace` path:

```json
{
  "id": "stockexpert-1",
  "name": "Stock Expert",
  "description": "AI-powered stock research agent for US & A-share markets. Real-time quotes, SEC filings, A-share announcements, deep multi-dimensional analysis, and trade review.",
  "model": "{YOUR_MODEL_ID}",
  "workspace": "/YOUR_HOME/.clawdi/workspace-stockexpert-1",
  "skills": [
    "stock-announcement-fetcher",
    "trading-coach",
    "stock-info-explorer",
    "stock-deep-analyzer"
  ],
  "tools": {
    "allow": ["group:subagent"]
  }
}
```

### Step 4 — Reload config

ClawDI supports hot reload — no full restart needed. Refer to ClawDI docs for your version.

---

## 🧠 Core Capabilities

| Skill | What it does | Markets | Data Source |
|---|---|---|---|
| **stock-deep-analyzer** ⭐ | One-shot deep report: value + technical + growth + financial scoring | US · A-share · HK | Yahoo Finance |
| **stock-announcement-fetcher** | Corporate announcements & regulatory filings | US (SEC EDGAR) · A-share (Eastmoney) | SEC.gov · AkShare |
| **stock-info-explorer** | Real-time quotes, technical indicators, fundamental summary | US · A-share · HK · Crypto · Forex | Yahoo Finance |
| **trading-coach** | Import broker CSV → FIFO matching → 8-dimension quality scoring + 10-dimension AI insights | US · A-share | Broker CSV export |

---

## 📊 Deep Analysis — What You Get

Run a single command and receive a professional-grade report covering:

- **Value metrics** — P/E, P/B, PEG, ROE, ROA, dividend yield
- **Technical indicators** — MA5/20/60, RSI(14), MACD, Bollinger Bands, VWAP
- **Growth signals** — Revenue growth YoY, earnings growth YoY, margin trends
- **Financial health** — Debt-to-equity, current ratio, asset efficiency
- **Overall rating /10** with investment strategies (long-term hold / swing trade / short-term)
- **Key price levels** — support, resistance, stop-loss, target zones
- **Risk warnings** — automated red flags for each dimension

**Example — US stock:**
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

[Technical Analysis - Score: 78/100]
  ✅  RSI: 58.3 (Neutral — room to run)
  ✅  MACD: Bullish crossover
  ✅  Price above MA20 and MA60

[Growth - Score: 95/100]
  ⭐  Revenue Growth YoY: +122%
  ⭐  Earnings Growth YoY: +581%

[Investment Rating: ⭐⭐⭐⭐ Strong Buy]

Recommended Strategy:
- Swing trade: Buy $850-875, target $950-980
- Stop loss: $820
```

---

## 📰 Announcement & Filing Tracker

Never miss a material event — automatically routed by market:

**US stocks → SEC EDGAR**
- 8-K (material events), 10-K (annual report), 10-Q (quarterly), S-1 (IPO), DEF 14A (proxy)
- No API key required · Free · Official SEC data

```bash
# Get latest SEC filings for a US stock
python3 skills/stock-announcement-fetcher/scripts/fetch_announcements.py AAPL
python3 skills/stock-announcement-fetcher/scripts/fetch_announcements.py TSLA --days 7
```

**A-share → Eastmoney / AkShare**
- All official disclosures: earnings, M&A, shareholder changes, governance events
- Full coverage of SSE + SZSE listed companies

```bash
# Get announcements for an A-share stock
python3 skills/stock-announcement-fetcher/scripts/fetch_announcements.py 600519
python3 skills/stock-announcement-fetcher/scripts/fetch_announcements.py 000001.SZ --days 7
```

The script **auto-detects** the market from ticker format — no manual switching needed.

---

## 🏆 Trade Review — Supported Brokers

Upload your broker's CSV export and get an 8-dimension quality score + 10-dimension AI insights.

**US & International brokers:**
| Broker | Format |
|---|---|
| Interactive Brokers (IBKR) | Activity Statement CSV |
| Charles Schwab | Trade History CSV |
| TD Ameritrade / thinkorswim | Transaction History CSV |
| Robinhood | Account CSV export |
| Webull | Transactions CSV |

**Asian brokers:**
| Broker | Format |
|---|---|
| Futu / Moomoo | CN or EN format |
| Tiger Brokers | CN format |

**What you get:**
- FIFO position matching across all trades
- 8-dimension score: entry timing · exit timing · trend alignment · risk management · market context · trading behavior · news fit · execution quality
- 10-dimension AI insights: pattern recognition · emotional trading detection · cost drag · root cause analysis · specific improvement recommendations

---

## ⚙️ Python Dependencies

Install all dependencies before first use:

```bash
pip install -r requirements.txt
```

Or install manually by skill:

```bash
# stock-deep-analyzer & stock-info-explorer
pip install yfinance pandas numpy rich plotille

# stock-announcement-fetcher
pip install akshare pandas requests PyPDF2
```

---

## 💻 Command Reference

### macOS / Linux

```bash
# Deep analysis
python3 skills/stock-deep-analyzer/scripts/deep_analyze.py NVDA
python3 skills/stock-deep-analyzer/scripts/deep_analyze.py AAPL --period 1y
python3 skills/stock-deep-analyzer/scripts/deep_analyze.py 600519.SS

# Real-time quote
python3 skills/stock-info-explorer/scripts/yf.py price TSLA
python3 skills/stock-info-explorer/scripts/yf.py price 000001.SZ

# Technical analysis
python3 skills/stock-info-explorer/scripts/yf.py pro NVDA 6mo --rsi --macd --bb

# SEC filings (US)
python3 skills/stock-announcement-fetcher/scripts/fetch_announcements.py AAPL --days 30

# A-share announcements
python3 skills/stock-announcement-fetcher/scripts/fetch_announcements.py 600519 --days 7
```

### Windows (PowerShell)

```powershell
# Deep analysis
$env:PYTHONIOENCODING='utf-8'; python3 skills/stock-deep-analyzer/scripts/deep_analyze.py NVDA
$env:PYTHONIOENCODING='utf-8'; python3 skills/stock-deep-analyzer/scripts/deep_analyze.py 600519.SS --period 1y

# Real-time quote
python3 skills/stock-info-explorer/scripts/yf.py price TSLA

# Technical analysis
$env:PYTHONIOENCODING='utf-8'; python3 skills/stock-info-explorer/scripts/yf.py pro 000001.SZ 6mo --rsi --macd --bb

# SEC filings (US)
python3 skills/stock-announcement-fetcher/scripts/fetch_announcements.py AAPL --days 30

# A-share announcements
$env:PYTHONIOENCODING='utf-8'; python3 skills/stock-announcement-fetcher/scripts/fetch_announcements.py 600519 --days 7
```

---

## Disclaimer

This agent provides market data, research workflows, and trading review tools. It is not a financial advisor and does not provide investment advice. All investment and trading decisions are yours. Short selling can create losses greater than the initial position size.

Do not commit broker exports, populated USER.md files, API tokens, account identifiers, or other personal financial data to a public fork.

---

## 🔧 Platform Capabilities Required

The following platform-level features are not yet implemented in ClawDI. Implementing them will significantly improve this agent's output quality.

| Capability | What it does |
|---|---|
| **Skill scanning mandate** | Forces the agent to fully load SKILL.md and all reference files before every reply — required for structured trading-coach output (tables, star ratings, 10-dimension insights) |
| **Reply formatting rules** | Injects output structure directives (section headers, tables, file-send via `MEDIA:`, silent mode via `NO_REPLY`) — required for structured section headers, tables, file-send directives, and silent-mode protocol |
| **Workspace file auto-load** | Automatically injects SOUL.md, IDENTITY.md, USER.md into session context at startup |
| **Runtime metadata injection** | Provides current datetime/timezone, model name, OS, and channel type (webchat/API/etc.) to the agent each session |
| **Safety rules** | Injects human-oversight and no-self-preservation constraints at the platform level |

## 📁 Directory Structure

```
stockexpert-agent/
├── agent.json                                        # Agent config template
├── AGENTS.md                                         # Agent system instructions
├── SOUL.md                                           # Agent behavioral philosophy
├── IDENTITY.md                                       # Agent name, vibe, avatar
├── USER.md                                           # User profile (filled at runtime)
├── HEARTBEAT.md                                      # Periodic task config
├── TOOLS.md                                          # Runtime environment reference
└── skills/
    ├── stock-deep-analyzer/                          # ⭐ Primary skill
    │   ├── SKILL.md
    │   └── scripts/deep_analyze.py                   # Yahoo Finance — US & A-share
    ├── stock-announcement-fetcher/                   # Filings & announcements
    │   ├── SKILL.md
    │   ├── scripts/
    │   │   ├── fetch_announcements.py                # Auto-routes: SEC EDGAR or AkShare
    │   │   └── fetch_announcements_multi_source.py   # Fallback with Tushare support
    │   └── references/
    │       ├── cninfo-api.md
    │       ├── tushare-guide.md
    │       └── upgrade-guide.md
    ├── stock-info-explorer/                          # Quotes & technical indicators
    │   ├── SKILL.md
    │   ├── _meta.json
    │   └── scripts/yf.py                             # Yahoo Finance — global markets
    └── trading-coach/                                # Trade review & scoring
        ├── SKILL.md
        ├── _meta.json
        └── references/
            ├── csv_formats.md                        # US & Asian broker CSV formats
            ├── scoring_system.md                     # 8-dimension scoring system
            └── insight_dimensions.md                 # 10-dimension AI insight guide
```

