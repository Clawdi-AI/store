---
name: opennews
description: "Real-time crypto & financial news aggregator — 72+ data sources across 5 categories (News: Bloomberg, Reuters, FT, CNBC, CoinDesk, Twitter/X + 47 more; Listing: Binance, Coinbase, OKX + 6 more; OnChain: whale & KOL trades; Meme: social sentiment; Market: price/funding/liquidation alerts). AI-analyzed with impact score, trading signals, and bilingual summaries. **Free endpoints available without token**."

user-invocable: true
metadata:
  openclaw:
    requires:
      bins:
        - curl
      env:
        - CLAWDI_PROXY_TOKEN
    primaryEnv: CLAWDI_PROXY_TOKEN
    emoji: "\U0001F4F0"
    install:
      - id: curl
        kind: brew
        formula: curl
        label: curl (HTTP client)
    os:
      - darwin
      - linux
      - win32
  version: 2.0.0
---

# OpenNews Crypto News Skill

Real-time crypto & financial news aggregator powered by 6551.io — **72+ data sources** across 5 engine categories, all AI-analyzed with impact scores, trading signals, and bilingual summaries.

Use Clawdi's OpenNews proxy at `https://api.clawdi.ai/proxy/opennews`.

## Data Sources — 72+ Sources Across 5 Categories

| Category | Count | Key Sources |
|----------|-------|-------------|
| **News** | 53 | Bloomberg, Reuters, Financial Times, CNBC, CNN, BBC, Fox Business, CoinDesk, Cointelegraph, The Block, Blockworks, Decrypt, DlNews, A16Z, TechCrunch, Wired, Politico, Business Insider, Twitter/X, Telegram, Weibo, Truth Social, U.S. Treasury, ECB, TASS, Handelsblatt, Welt, Ambrey, Morgan Stanley, PR Newswire, Coinbase, Phoenixnews, and more |
| **Listing** | 9 | Binance, Coinbase, OKX, Bybit, Upbit, Bithumb, Robinhood, Hyperliquid, Aster |
| **OnChain** | 3 | Hyperliquid Whale Trade, Hyperliquid Large Position, KOL Trade |
| **Meme** | 1 | Twitter meme coin social sentiment |
| **Market** | 6 | Price Change, Funding Rate, Funding Rate Difference, Large Liquidation, Market Trends, OI Change |

## Authentication

All authenticated requests require the header:
```
Authorization: Bearer $CLAWDI_PROXY_TOKEN
```

---

## News Operations

### 1. Get News Sources

Fetch the full engine tree with all 5 categories and 72+ sources.

```bash
curl -s -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  "https://api.clawdi.ai/proxy/opennews/news_type"
```

Returns a tree with engine types (`news` — 53 sources, `listing` — 9 exchanges, `onchain` — 3 whale/KOL trackers, `meme` — 1 sentiment source, `market` — 6 anomaly signals) and their sub-categories.

### 2. Search News

`POST /news_search` is the primary search endpoint.

**Get latest news:**
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "page": 1}'
```

**Search by keyword:**
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"q": "bitcoin OR ETF", "limit": 10, "page": 1}'
```

**Search by coin symbol:**
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coins": ["BTC"], "limit": 10, "page": 1}'
```

**Filter by engine type and news type:**
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"engineTypes": {"news": ["Bloomberg", "Reuters"]}, "limit": 10, "page": 1}'
```

**Only news with coins:**
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hasCoin": true, "limit": 10, "page": 1}'
```

### News Search Parameters

| Parameter     | Type                      | Required | Description                                   |
|--------------|---------------------------|----------|-----------------------------------------------|
| `limit`      | integer                   | yes      | Max results per page (1-100)                  |
| `page`       | integer                   | yes      | Page number (1-based)                         |
| `q`          | string                    | no       | Full-text keyword search                      |
| `coins`      | string[]                  | no       | Filter by coin symbols (e.g. `["BTC","ETH"]`) |
| `engineTypes`| map[string][]string       | no       | Filter by engine and news types               |
| `hasCoin`    | boolean                   | no       | Only return news with associated coins        |

Important: You need to understand the user's query intent and perform word segmentation, then combine them using OR/AND to form search keywords, supporting both Chinese and English.

---

## Free API Endpoints (No Token Required)

These free endpoints provide curated hot news and trending tweets by category. They still require `$CLAWDI_PROXY_TOKEN` for proxy authentication, but no upstream OpenNews token is needed.

### 1. Get Free News Categories

Get all available news categories and subcategories for the free tier.

```bash
curl -s -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  "https://api.clawdi.ai/proxy/opennews/free_categories"
```

### 2. Get Hot News by Category

Get hot news articles and trending tweets by category.

```bash
curl -s -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  "https://api.clawdi.ai/proxy/opennews/free_hot?category=macro"
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | yes | Category key from free_categories |
| `subcategory` | string | no | Subcategory key for more specific filtering |

**Response Structure:**
```json
{
  "success": true,
  "category": "crypto",
  "subcategory": "defi",
  "news": {
    "success": true,
    "count": 10,
    "items": [
      {
        "id": 123,
        "title": "...",
        "source": "...",
        "link": "https://...",
        "score": 85,
        "grade": "A",
        "signal": "bullish",
        "summary_zh": "...",
        "summary_en": "...",
        "coins": ["BTC", "ETH"],
        "published_at": "2026-03-17T10:00:00Z"
      }
    ]
  },
  "tweets": {
    "success": true,
    "count": 5,
    "items": [
      {
        "author": "Vitalik Buterin",
        "handle": "VitalikButerin",
        "content": "...",
        "url": "https://...",
        "metrics": { "likes": 1000, "retweets": 200, "replies": 50 },
        "posted_at": "2026-03-17T09:00:00Z",
        "relevance": "high"
      }
    ]
  }
}
```

**Example - Get DeFi Subcategory News:**
```bash
curl -s -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  "https://api.clawdi.ai/proxy/opennews/free_hot?category=macro&subcategory=defi"
```

---

## Data Structures

### News Article

```json
{
  "id": "unique-article-id",
  "text": "Article headline / content",
  "newsType": "Bloomberg",
  "engineType": "news",
  "link": "https://...",
  "coins": [{"symbol": "BTC", "market_type": "spot", "match": "title"}],
  "aiRating": {
    "score": 85,
    "grade": "A",
    "signal": "long",
    "status": "done",
    "summary": "Chinese summary",
    "enSummary": "English summary"
  },
  "ts": 1708473600000
}
```

---

## Common Workflows

### Quick Market Overview
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "page": 1}' | jq '.data[] | {text, newsType, signal: .aiRating.signal}'
```

### High-Impact News (score >= 80)
```bash
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50, "page": 1}' | jq '[.data[] | select(.aiRating.score >= 80)]'
```

---

## Notes

- **Primary API**: Full access to 72+ sources with advanced search
- **Free API**: Use free endpoints as fallback (limited to curated hot news)
- Rate limits apply; max 100 results per request
- AI ratings may not be available on all articles (check `status == "done"`)
- Free API data is cached and updated periodically; if data is still being generated, a 503 response will be returned
