---
name: stock-announcement-fetcher
description: >-
  Fetches corporate announcements and regulatory filings for US and A-share stocks.
  US stocks: SEC EDGAR filings (8-K, 10-K, 10-Q, S-1, DEF 14A) — no API key required.
  A-share stocks: Real-time announcements from Eastmoney via AkShare.
  Auto-detects market from ticker format. Supports keyword filtering and date range queries.
---

# Stock Announcement Fetcher

Corporate announcements and regulatory filings for **US stocks (SEC EDGAR)** and **A-share stocks (Eastmoney)** — automatically routed by ticker format.

## Market Routing

| Ticker format | Market | Data source |
|--------------|--------|-------------|
| `AAPL`, `TSLA`, `NVDA` (no suffix) | 🇺🇸 US | SEC EDGAR |
| `600519`, `600519.SS`, `000001.SZ` | 🇨🇳 A-share | AkShare / Eastmoney |

No manual switching needed — the script detects the market automatically.

## When to Use This Skill

**US stocks — SEC filings:**
- "Show me the latest SEC filings for AAPL"
- "Any 8-K from Tesla this week?"
- "Get NVDA earnings report (10-Q)"
- "Did MSFT file anything recently?"
- "Show me Amazon's annual report"

**A-share stocks — corporate announcements:**
- "Get announcements for 600519"
- "Any major news from Kweichow Moutai?"
- "Check for earnings announcements for 000001.SZ"
- "Filter M&A-related announcements for 002594.SZ"

## Quick Start

### macOS / Linux
```bash
# US — SEC EDGAR
uv run --script scripts/fetch_announcements.py AAPL
uv run --script scripts/fetch_announcements.py TSLA --days 7
uv run --script scripts/fetch_announcements.py NVDA --type 10-Q

# A-share — Eastmoney
uv run --script scripts/fetch_announcements.py 600519 --days 7
uv run --script scripts/fetch_announcements.py 000001.SZ
uv run --script scripts/fetch_announcements.py 600519 --keyword earnings
```

### Windows PowerShell
```powershell
# US (no encoding prefix needed)
uv run --script scripts/fetch_announcements.py AAPL --days 30

# A-share (encoding prefix needed for Chinese output)
$env:PYTHONIOENCODING='utf-8'; uv run --script scripts/fetch_announcements.py 600519 --days 7
```

## Parameters

| Parameter | Description | Example | Default |
|-----------|-------------|---------|---------|
| `ticker` | Stock ticker (required) | `AAPL`, `600519`, `000001.SZ` | — |
| `--days` | Look back N days | `7`, `30` | `30` |
| `--type` | Filing type filter (US only) | `8-K`, `10-K`, `10-Q` | all |
| `--keyword` | Title keyword filter | `earnings`, `merger` | none |
| `--format` | Output format | `text`, `json` | `text` |

## US — SEC EDGAR Coverage

Filing types available:

| Type | Description |
|------|-------------|
| 8-K | Material events — earnings, M&A, leadership changes, etc. |
| 10-K | Annual report |
| 10-Q | Quarterly report |
| S-1 | IPO registration |
| DEF 14A | Proxy statement |
| SC 13G/D | Large shareholder disclosures |
| Form 4 | Insider transactions |

- **No API key required** — uses public SEC EDGAR API (`data.sec.gov`)
- **Rate limit**: ~10 requests/second; the script handles this automatically
- **Coverage**: All SEC-registered public companies

## A-Share — Eastmoney Coverage

- **Source**: Eastmoney via AkShare open-source library
- **Coverage**: All SSE and SZSE listed companies
- **Update frequency**: Real-time (same-day announcements)
- **No API key required**
- **Limitation**: AkShare's interface returns same-day announcements; for historical data use Tushare Pro (see `references/tushare-guide.md`)

## Workflow

### Step 1: Identify ticker
- User provides company name → use web_search to find ticker
- US: plain ticker (`AAPL`), A-share: 6-digit code or with suffix (`600519` or `600519.SS`)

### Step 2: Execute query
```bash
uv run --script scripts/fetch_announcements.py <ticker> [options]
```

### Step 3: Interpret results
1. Extract key information (title, type, date, URL)
2. Categorize by importance (earnings / M&A / governance / insider)
3. Flag high-impact items 🔴 High / 🟡 Medium / ⚪ Low
4. Provide brief interpretation

## Example Output — US (SEC EDGAR)

```
================================================================================
SEC Filings: Apple Inc. (AAPL)
Source: SEC EDGAR
================================================================================

[1] 2026-02-01
    Type: 10-Q
    Title: Quarterly Report — Q1 FY2026
    URL: https://www.sec.gov/Archives/edgar/data/320193/...

[2] 2026-01-22
    Type: 8-K
    Title: Apple Reports First Quarter Results
    URL: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL...
```

## Example Output — A-Share (Eastmoney)

```
================================================================================
Announcements: Kweichow Moutai (600519)
Source: Eastmoney (AkShare)
================================================================================

[1] 2026-02-28
    Title: 贵州茅台：关于2025年度业绩快报的公告
    Type: 业绩快报
    URL: https://data.eastmoney.com/notices/detail/600519/...
```
