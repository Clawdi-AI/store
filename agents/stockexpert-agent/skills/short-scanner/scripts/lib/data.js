/**
 * Data layer for short-scanner skill.
 * Yahoo Finance via direct HTTP (crumb auth), FMP secondary, Finnhub tertiary.
 * 4-hour file cache in /tmp/short-scanner-cache/.
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = '/tmp/short-scanner-cache';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

// Ensure cache dir exists
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}

// --- Cache helpers ---

function cacheKey(prefix, id) {
  return path.join(CACHE_DIR, `${prefix}_${id.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
}

function getCache(prefix, id) {
  const file = cacheKey(prefix, id);
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {}
  return null;
}

function setCache(prefix, id, data) {
  try {
    fs.writeFileSync(cacheKey(prefix, id), JSON.stringify(data));
  } catch {}
}

// --- Yahoo Finance (direct HTTP with crumb auth) ---

let _crumbData = null; // { crumb, cookies, ts }
const CRUMB_TTL_MS = 30 * 60 * 1000; // 30 min

async function getYahooCrumb() {
  if (_crumbData && (Date.now() - _crumbData.ts) < CRUMB_TTL_MS) {
    return _crumbData;
  }

  try {
    // Step 1: Get consent cookie
    const r1 = await fetch('https://fc.yahoo.com', {
      redirect: 'manual',
      headers: { 'User-Agent': UA }
    });
    const cookies = (r1.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

    // Step 2: Get crumb
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': cookies }
    });
    if (!r2.ok) return null;
    const crumb = await r2.text();

    _crumbData = { crumb, cookies, ts: Date.now() };
    return _crumbData;
  } catch {
    return null;
  }
}

async function yahooFetch(url) {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  const separator = url.includes('?') ? '&' : '?';
  const fullUrl = `${url}${separator}crumb=${encodeURIComponent(auth.crumb)}`;

  try {
    const resp = await fetch(fullUrl, {
      headers: { 'User-Agent': UA, 'Cookie': auth.cookies },
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

async function yahooQuoteSummary(ticker) {
  const cached = getCache('yqs', ticker);
  if (cached) return cached;

  const modules = 'price,summaryDetail,defaultKeyStatistics,financialData,summaryProfile,majorHoldersBreakdown,insiderTransactions';
  const data = await yahooFetch(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`
  );

  const result = data?.quoteSummary?.result?.[0];
  if (result) {
    setCache('yqs', ticker, result);
    return result;
  }
  return null;
}

async function yahooQuote(ticker) {
  const cached = getCache('yq', ticker);
  if (cached) return cached;

  const data = await yahooFetch(
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
  );

  const result = data?.quoteResponse?.result?.[0];
  if (result) {
    setCache('yq', ticker, result);
    return result;
  }
  return null;
}

async function yahooSearch(query) {
  // Search endpoint doesn't need crumb
  try {
    const resp = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=20&newsCount=0`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.quotes || [];
  } catch {
    return [];
  }
}

async function yahooChartMeta(ticker) {
  // v8 chart endpoint works without crumb — fallback for basic price data
  const cached = getCache('ycm', ticker);
  if (cached) return cached;

  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta) {
      setCache('ycm', ticker, meta);
      return meta;
    }
  } catch {}
  return null;
}

// --- FMP (secondary, needs FMP_API_KEY) ---

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

async function fmpFetch(endpoint, params = {}) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;

  const url = new URL(`${FMP_BASE}${endpoint}`);
  url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const cacheId = `${endpoint}_${JSON.stringify(params)}`;
  const cached = getCache('fmp', cacheId);
  if (cached) return cached;

  try {
    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    setCache('fmp', cacheId, data);
    return data;
  } catch {
    return null;
  }
}

async function fmpScreener(filters = {}) {
  return fmpFetch('/stock-screener', {
    marketCapMoreThan: filters.minCap || 2000000000,
    marketCapLowerThan: filters.maxCap || 50000000000,
    sector: filters.sector || 'Technology',
    exchange: 'NASDAQ,NYSE',
    limit: filters.limit || 50,
    ...filters.extra
  });
}

async function fmpIncomeStatement(ticker) {
  return fmpFetch(`/income-statement/${ticker}`, { period: 'quarter', limit: 8 });
}

async function fmpCashFlow(ticker) {
  return fmpFetch(`/cash-flow-statement/${ticker}`, { period: 'quarter', limit: 4 });
}

async function fmpRatios(ticker) {
  return fmpFetch(`/ratios-ttm/${ticker}`);
}

// --- Finnhub (tertiary, needs FINNHUB_API_KEY) ---

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

async function finnhubFetch(endpoint, params = {}) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;

  const url = new URL(`${FINNHUB_BASE}${endpoint}`);
  url.searchParams.set('token', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const cacheId = `${endpoint}_${JSON.stringify(params)}`;
  const cached = getCache('fh', cacheId);
  if (cached) return cached;

  try {
    const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    setCache('fh', cacheId, data);
    return data;
  } catch {
    return null;
  }
}

async function finnhubNews(ticker) {
  const now = new Date();
  const ago = new Date(now - 30 * 24 * 60 * 60 * 1000);
  return finnhubFetch('/company-news', {
    symbol: ticker,
    from: ago.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10)
  });
}

async function finnhubInsiderTxns(ticker) {
  return finnhubFetch('/stock/insider-transactions', { symbol: ticker });
}

// --- Helper: extract raw value from Yahoo nested objects ---

function raw(obj) {
  if (obj == null) return null;
  if (typeof obj === 'object' && 'raw' in obj) return obj.raw;
  return obj;
}

// --- Unified data fetch ---

/**
 * Fetch comprehensive data for a single ticker.
 * Returns a normalized object with all available data.
 */
async function fetchTickerData(ticker) {
  const [quoteSummary, quote, chartMeta, fmpIncome, fmpCash, fmpRat, news, insiderTxns] = await Promise.allSettled([
    yahooQuoteSummary(ticker),
    yahooQuote(ticker),
    yahooChartMeta(ticker),
    fmpIncomeStatement(ticker),
    fmpCashFlow(ticker),
    fmpRatios(ticker),
    finnhubNews(ticker),
    finnhubInsiderTxns(ticker)
  ]);

  const qs = quoteSummary.value || {};
  const q = quote.value || {};
  const cm = chartMeta.value || {};

  return {
    ticker,
    name: q.shortName || q.longName || cm.shortName || raw(qs.price?.shortName) || ticker,
    sector: qs.summaryProfile?.sector || '',
    industry: qs.summaryProfile?.industry || '',
    country: qs.summaryProfile?.country || '',
    description: qs.summaryProfile?.longBusinessSummary || '',
    marketCap: q.marketCap || raw(qs.price?.marketCap) || 0,
    price: q.regularMarketPrice || cm.regularMarketPrice || raw(qs.price?.regularMarketPrice) || 0,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh || cm.fiftyTwoWeekHigh || raw(qs.summaryDetail?.fiftyTwoWeekHigh) || 0,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow || cm.fiftyTwoWeekLow || raw(qs.summaryDetail?.fiftyTwoWeekLow) || 0,
    forwardPE: q.forwardPE || raw(qs.summaryDetail?.forwardPE) || raw(qs.defaultKeyStatistics?.forwardPE) || null,
    trailingPE: q.trailingPE || raw(qs.summaryDetail?.trailingPE) || null,
    priceToSales: raw(qs.summaryDetail?.priceToSalesTrailing12Months) || null,
    revenueGrowth: raw(qs.financialData?.revenueGrowth) || null,
    earningsGrowth: raw(qs.financialData?.earningsGrowth) || null,
    freeCashflow: raw(qs.financialData?.freeCashflow) || null,
    totalRevenue: raw(qs.financialData?.totalRevenue) || null,
    operatingMargins: raw(qs.financialData?.operatingMargins) || null,
    shortPercentOfFloat: raw(qs.defaultKeyStatistics?.shortPercentOfFloat) || null,
    sharesShort: raw(qs.defaultKeyStatistics?.sharesShort) || null,
    insiderHoldings: raw(qs.majorHoldersBreakdown?.insidersPercentHeld) || null,
    insiderTransactions: qs.insiderTransactions?.transactions || insiderTxns.value?.data || [],
    fmp: {
      income: fmpIncome.value || [],
      cashFlow: fmpCash.value || [],
      ratios: Array.isArray(fmpRat.value) ? fmpRat.value[0] : fmpRat.value || null
    },
    news: (news.value || []).slice(0, 5)
  };
}

/**
 * Search for tickers by keyword.
 */
async function searchTickers(query) {
  const results = await yahooSearch(query);
  return results
    .filter(r => r.quoteType === 'EQUITY' && r.exchange && /NAS|NYQ|NYSE|NMS/.test(r.exchange))
    .map(r => ({ ticker: r.symbol, name: r.shortname || r.longname || r.symbol, exchange: r.exchange }));
}

/**
 * Yahoo Finance screener — dynamically discover stocks matching our criteria.
 * No API key needed. Uses the same crumb auth as other Yahoo endpoints.
 */
async function yahooScreener(criteria = {}) {
  const cached = getCache('yscr', JSON.stringify(criteria));
  if (cached) return cached;

  const auth = await getYahooCrumb();
  if (!auth) return null;

  const minCap = criteria.minCap || 1_000_000_000;
  const maxCap = criteria.maxCap || 100_000_000_000;
  const sectorFilter = criteria.sector || null;
  const industries = criteria.industries || null;

  // Yahoo screener POST body
  const body = {
    size: criteria.limit || 250,
    offset: criteria.offset || 0,
    sortField: 'intradaymarketcap',
    sortType: 'DESC',
    quoteType: 'EQUITY',
    query: {
      operator: 'AND',
      operands: [
        { operator: 'OR', operands: [
          { operator: 'EQ', operands: ['exchange', 'NMS'] },   // NASDAQ
          { operator: 'EQ', operands: ['exchange', 'NYQ'] },   // NYSE
          { operator: 'EQ', operands: ['exchange', 'NGM'] },   // NASDAQ Global Market
          { operator: 'EQ', operands: ['exchange', 'NCM'] }    // NASDAQ Capital Market
        ]},
        { operator: 'BTWN', operands: ['intradaymarketcap', minCap, maxCap] }
      ]
    }
  };

  // Filter by specific industries (more precise than sector)
  if (industries && industries.length > 0) {
    body.query.operands.push({
      operator: 'OR',
      operands: industries.map(ind => ({ operator: 'EQ', operands: ['industry', ind] }))
    });
  } else if (sectorFilter) {
    body.query.operands.push(
      { operator: 'EQ', operands: ['sector', sectorFilter] }
    );
  }

  try {
    const resp = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}`,
      {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Cookie': auth.cookies,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    const total = data?.finance?.result?.[0]?.total || quotes.length;
    if (quotes.length > 0) {
      setCache('yscr', JSON.stringify(criteria), quotes);
    }
    // Log how many we got vs total available
    if (process.env.DEBUG) {
      console.error(`Yahoo screener: ${quotes.length} of ${total} total matches`);
    }
    return quotes;
  } catch {
    return null;
  }
}

/**
 * Get a list of tickers to scan.
 * Priority: Yahoo screener (dynamic) > FMP screener > curated fallback.
 *
 * For 'all': combines software + healthcare-it + fintech (our target sectors).
 * Does NOT scan every US stock — stays within our AI disruption thesis.
 */
async function getSectorTickers(sector = 'software', limit = 50) {
  // 'all' = combine our three target sectors, not the entire market
  if (sector === 'all') {
    const [sw, hc, ft] = await Promise.all([
      getSectorTickers('software', limit),
      getSectorTickers('healthcare-it', limit),
      getSectorTickers('fintech', limit)
    ]);
    // Deduplicate by ticker
    const seen = new Set();
    const combined = [];
    for (const t of [...sw, ...hc, ...ft]) {
      if (!seen.has(t.ticker)) {
        seen.add(t.ticker);
        combined.push(t);
      }
    }
    return combined;
  }

  // Curated lists for niche subsectors (healthcare-it, fintech).
  // Yahoo screener only supports broad sectors (Healthcare, Financial Services)
  // which are 80% biotech/banks — not our targets. Use curated lists instead.
  const curatedLists = {
    'healthcare-it': [
      'VEEV', 'HIMS', 'DOCS', 'GDRX', 'CERT', 'NXGN', 'MDRX', 'PHR', 'TDOC', 'OSCR',
      'ACCD', 'TALK', 'SDGR', 'RXRX', 'EVH', 'INSP', 'IRTC', 'NTRA', 'HCAT', 'ONEM',
      'LVGO', 'AMWL', 'PGNY', 'LFST'
    ],
    'fintech': [
      'SQ', 'AFRM', 'UPST', 'SOFI', 'HOOD', 'COIN', 'BILL', 'MQ', 'TOST', 'FOUR',
      'PAYO', 'FLYW', 'RELY', 'DLO', 'PSFE', 'STEP', 'LPRO', 'LMND', 'ROOT',
      'FI', 'FIS', 'FISV', 'GPN', 'WEX', 'PYPL', 'ADYEN'
    ]
  };

  // Healthcare-IT and fintech use curated lists (Yahoo screener too broad for these)
  if (curatedLists[sector]) {
    const tickers = curatedLists[sector].slice(0, limit);
    return tickers.map(t => ({ ticker: t, name: t, marketCap: 0, sector: '', industry: '' }));
  }

  // Software: scan multiple sectors that contain software companies.
  // Technology is primary, but Communication Services has ZM, SNAP, etc.
  // Fetch up to 250 per sector, then deduplicate. The pass filter handles
  // rejecting hardware, semis, biotech, etc. based on industry + description.
  const [techResults, commResults] = await Promise.all([
    yahooScreener({
      sector: 'Technology',
      minCap: 1_000_000_000,
      maxCap: 100_000_000_000,
      limit: 250
    }),
    yahooScreener({
      sector: 'Communication Services',
      minCap: 1_000_000_000,
      maxCap: 100_000_000_000,
      limit: 100
    })
  ]);

  // Merge and deduplicate
  const seen = new Set();
  const yahooResults = [];
  for (const r of [...(techResults || []), ...(commResults || [])]) {
    if (!seen.has(r.symbol)) {
      seen.add(r.symbol);
      yahooResults.push(r);
    }
  }

  if (yahooResults.length > 0) {
    return yahooResults.map(r => ({
      ticker: r.symbol,
      name: r.shortName || r.longName || r.symbol,
      marketCap: r.marketCap || 0,
      sector: r.sector || '',
      industry: r.industry || ''
    }));
  }

  // Try FMP screener as fallback for software
  const fmpResults = await fmpScreener({
    minCap: 1_000_000_000,
    maxCap: 100_000_000_000,
    sector: 'Technology',
    limit: 250
  });

  if (fmpResults && fmpResults.length > 0) {
    return fmpResults.map(r => ({
      ticker: r.symbol,
      name: r.companyName,
      marketCap: r.marketCap,
      sector: r.sector,
      industry: r.industry
    }));
  }

  // Last resort: curated software list
  const softwareFallback = [
    'CRM', 'NOW', 'WDAY', 'HUBS', 'ZS', 'DDOG', 'NET', 'SNOW', 'MDB', 'TEAM',
    'VEEV', 'PANW', 'OKTA', 'ZM', 'DOCU', 'BILL', 'PCTY', 'PAYC', 'PLAN',
    'MNDY', 'FIVN', 'QLYS', 'TENB', 'SMAR', 'NCNO', 'ALRM', 'ESTC', 'CFLT', 'GTLB'
  ];
  return softwareFallback.map(t => ({ ticker: t, name: t, marketCap: 0, sector: '', industry: '' }));
}

module.exports = {
  fetchTickerData,
  searchTickers,
  getSectorTickers,
  yahooQuote,
  yahooQuoteSummary,
  yahooChartMeta,
  fmpScreener,
  fmpIncomeStatement,
  fmpCashFlow,
  fmpRatios,
  finnhubNews,
  finnhubInsiderTxns
};
