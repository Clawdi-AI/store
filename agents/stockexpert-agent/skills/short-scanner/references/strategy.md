# Short Scanner Strategy

## Thesis

SaaS/software companies face an AI disruption wave in 2026. Companies with commodity software (workflow tools, basic analytics, generic CRM, help desk, project management) are most vulnerable. Companies with real AI moats (GPU infrastructure, proprietary training data, AI-native products) should be avoided.

## Target Universe

- US-listed equities only
- Market cap: $2B-$50B (mid-cap sweet spot — enough liquidity, less institutional defense)
- Primary sectors: Software/SaaS, Healthcare IT, Fintech
- 6-month trading horizon

## 7-Factor Scoring System (0-100)

Higher score = better short candidate.

| # | Factor | Weight | What We Measure |
|---|--------|--------|-----------------|
| 1 | Valuation Excess | 25% | Forward P/E >30, P/S >8 = overpriced for weak fundamentals |
| 2 | Revenue Deceleration | 20% | Slowing/negative revenue + earnings growth |
| 3 | AI Vulnerability | 20% | How easily AI replaces the product (curated + heuristic) |
| 4 | Price vs 52w High | 15% | Stocks near highs have more room to fall |
| 5 | Cash Flow Weakness | 10% | Negative FCF, low margins, declining cash flow |
| 6 | Insider Selling | 5% | Net insider selling = bearish signal |
| 7 | Short Interest | 5% | Low SI = uncrowded trade, less squeeze risk |

## Pass Filter (must pass ALL to qualify)

1. Forward P/E > 25 (or negative earnings)
2. P/S > 4
3. Not >30% off 52-week high
4. No high AI moat (curated + keyword detection)
5. Composite score >= 45

## Score-to-Action Mapping

| Score | Rating | Action |
|-------|--------|--------|
| 80-100 | Exceptional short | High conviction, 6-8% position |
| 70-79 | Strong short | Medium conviction, 4-5.5% position |
| 60-69 | Moderate short | Starter position, 2.5-4% |
| 45-59 | Watchlist | Monitor only, don't enter |
| <45 | Skip | Not a viable short candidate |

## AI Two-Axis Model

The core insight: **Who is the customer — machines or humans?**

### Axis 1: BUILT FOR AI (DO NOT SHORT)
Products consumed by AI workloads. More AI usage → more revenue.
- **GPU/compute**: NVDA, AMD, AVGO, ARM, TSM, SMCI
- **Memory/storage**: MU, WDC, PSTG (AI needs massive RAM + fast storage)
- **Networking**: NET, ANET, CIEN (data center interconnect)
- **Power/cooling**: VRT, DELL (AI data centers need massive energy)
- **Chip tooling/EDA**: ASML, AMAT, SNPS, CDNS
- **Hyperscalers**: MSFT, GOOG, AMZN, META, ORCL
- **AI-native platforms**: PLTR, AI, PATH

### Axis 2: BUILT FOR HUMANS (GOOD SHORT TARGETS)
Products designed for human workflows that AI automates away.
- **Design/creative**: Figma-like tools (AI generates designs)
- **Project management**: MNDY, ASAN, SMAR (AI agents don't need Jira)
- **Document tools**: DOCU, BOX, DBX (AI processes docs automatically)
- **Communication**: ZM, RNG (AI summarizes, attends meetings)
- **HR/recruiting**: PCTY, PAYC, ZI (AI handles screening)
- **Customer support**: FIVN (AI chatbots replace human agents)
- **Basic analytics**: PLAN (AI does the analysis directly)

### Mixed / Cautious
- **Data moats**: VEEV, NOW, INTU (proprietary data hard to replicate)
- **Cybersecurity**: CRWD, ZS, PANW (AI helps both sides — net neutral)
- **Data infra**: SNOW, DDOG, MDB (serves both AI and human workloads)
- **AI pivot**: CRM, ADBE (investing heavily in AI features)

## Companion Skill: fundamental-stock-analysis

After the scanner identifies candidates (score >= 60), use the `fundamental-stock-analysis` skill for deep individual analysis. It provides:
- 100-point fundamental scoring (quality, balance sheet, cash flow, valuation)
- Data quality scorecard with confidence levels
- Sector-specific adjustments
- Bull/bear case with invalidation triggers

This gives a second opinion before committing capital.

## Data Sources

| Source | Type | Use |
|--------|------|-----|
| Yahoo Finance (yahoo-finance2 npm) | Free, no key | Primary: P/E, P/S, market cap, financials, insider txns |
| Financial Modeling Prep | Free tier, key needed | Screener, income statements, cash flow, ratios |
| Finnhub | Free tier, key needed | Company news, insider transactions |

Yahoo Finance alone is sufficient. FMP/Finnhub are optional enrichment.
