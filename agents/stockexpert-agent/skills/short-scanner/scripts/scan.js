#!/usr/bin/env node
/**
 * Short Scanner CLI — scan for overvalued short targets.
 *
 * Usage:
 *   node scan.js --sector software --limit 5
 *   node scan.js --ticker CRM --verbose
 *   node scan.js --query "healthcare software" --min-score 60
 *   node scan.js --watchlist
 *
 * Always outputs valid JSON.
 */

const { fetchTickerData, searchTickers, getSectorTickers, yahooQuote } = require('./lib/data');
const { scoreForShort, batchScore } = require('./lib/screener');
const { suggestEntry, loadPositions, checkExposure } = require('./lib/risk');
const fs = require('fs');
const path = require('path');

const WATCHLIST_FILE = path.join(__dirname, '../state/watchlist.json');
const HISTORY_FILE = path.join(__dirname, '../state/scan-history.json');

// Parse CLI args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || true;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const sector = getArg('sector') || null;
const query = getArg('query') || null;
const ticker = getArg('ticker') || null;
const watchlist = hasFlag('watchlist');
const minScore = parseInt(getArg('min-score') || '0', 10);
const limit = parseInt(getArg('limit') || '10', 10);
const verbose = hasFlag('verbose');
const textMode = hasFlag('text');  // Output plain text instead of JSON

async function main() {
  try {
    let tickers = [];

    if (ticker) {
      // Single ticker analysis
      tickers = [{ ticker: ticker.toUpperCase(), name: ticker.toUpperCase() }];
    } else if (query) {
      // Search by keyword
      const searchResults = await searchTickers(query);
      tickers = searchResults.slice(0, Math.min(limit * 2, 30));
      if (tickers.length === 0) {
        return output({ error: null, results: [], message: `No tickers found for query: ${query}` });
      }
    } else if (watchlist) {
      // Scan watchlist
      try {
        const wl = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8'));
        tickers = (wl.targets || []).map(t => ({ ticker: t.ticker, name: t.name || t.ticker }));
      } catch {
        return output({ error: null, results: [], message: 'Watchlist is empty or not initialized.' });
      }
      if (tickers.length === 0) {
        return output({ error: null, results: [], message: 'Watchlist is empty.' });
      }
    } else {
      // Sector scan
      const sectorName = sector || 'software';
      tickers = await getSectorTickers(sectorName, limit * 3);
    }

    const tickerSource = tickers.length > 0 && tickers[0].marketCap > 0 ? 'yahoo-screener' : 'curated-fallback';

    // Fetch data for all tickers (with concurrency limit)
    const CONCURRENCY = 5;
    const allData = [];
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
      const batch = tickers.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(t => fetchTickerData(t.ticker))
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          allData.push(r.value);
        }
      }
    }

    // Score ALL tickers (no limit in batchScore — let pass filter determine relevance)
    const scored = batchScore(allData, { minScore, limit: allData.length });

    // Reorder: passed results first, then top filtered results, both sorted by score
    const passed = scored.filter(s => s.passed);
    const filtered = scored.filter(s => !s.passed);
    const reordered = [...passed, ...filtered.slice(0, Math.max(limit - passed.length, 3))].slice(0, limit);

    // Add entry suggestions for passed candidates
    const results = reordered.map(s => {
      const entry = s.passed ? suggestEntry(s, s.breakdown?.pricePosition?.details?.price || 0) : null;
      // Always include compact breakdown so the bot can explain scores
      const scoreBreakdown = {};
      for (const [key, val] of Object.entries(s.breakdown)) {
        scoreBreakdown[key] = {
          score: val.score,
          max: val.max,
          pct: Math.round((val.score / val.max) * 100),
          label: val.label
        };
        // Include key details in all modes (not just verbose)
        if (key === 'valuation') {
          scoreBreakdown[key].forwardPE = val.details?.forwardPE || null;
          scoreBreakdown[key].priceToSales = val.details?.priceToSales || null;
        } else if (key === 'revenueDecel') {
          scoreBreakdown[key].revenueGrowth = val.details?.revenueGrowth || null;
          scoreBreakdown[key].earningsGrowth = val.details?.earningsGrowth || null;
        } else if (key === 'aiVulnerability') {
          scoreBreakdown[key].axis = val.details?.axis || null;
          scoreBreakdown[key].category = val.details?.category || null;
        } else if (key === 'pricePosition') {
          scoreBreakdown[key].pctFromHigh = val.details?.pctFromHigh || null;
        } else if (key === 'cashFlow') {
          scoreBreakdown[key].fcfMargin = val.details?.fcfMargin || null;
          scoreBreakdown[key].operatingMargins = val.details?.operatingMargins || null;
        }
        // Verbose: include full details
        if (verbose) {
          scoreBreakdown[key].details = val.details;
        }
      }

      const currentPrice = s.breakdown?.pricePosition?.details?.price || null;
      const mcapStr = s.marketCap ? `$${(s.marketCap / 1e9).toFixed(1)}B` : '?';

      // Build pre-formatted display summary the bot can show directly
      const lines = [];
      lines.push(`${s.ticker} — ${s.name} (Score: ${s.score}/100) ${s.passed ? '✅ PASS' : '❌ FILTERED'}`);
      lines.push(`What they do: ${s.description ? s.description.slice(0, 180) : 'N/A'}`);
      lines.push(`Industry: ${s.industry || '?'} | Price: $${currentPrice || '?'} | Market Cap: ${mcapStr}`);
      lines.push('');
      lines.push('Score Breakdown:');
      for (const [key, val] of Object.entries(scoreBreakdown)) {
        let detail = '';
        if (key === 'valuation') {
          const pe = typeof val.forwardPE === 'number' && isFinite(val.forwardPE) ? `P/E ${val.forwardPE.toFixed(1)}` : '';
          const ps = typeof val.priceToSales === 'number' && isFinite(val.priceToSales) ? `P/S ${val.priceToSales.toFixed(1)}` : '';
          detail = [pe, ps].filter(Boolean).join(', ');
        } else if (key === 'revenueDecel') {
          const rg = val.revenueGrowth != null && isFinite(val.revenueGrowth) ? `rev ${(val.revenueGrowth * 100).toFixed(1)}%` : '';
          const eg = val.earningsGrowth != null && isFinite(val.earningsGrowth) ? `earn ${(val.earningsGrowth * 100).toFixed(1)}%` : '';
          detail = [rg, eg].filter(Boolean).join(', ');
        } else if (key === 'aiVulnerability') {
          detail = val.axis || '?';
          if (val.category) detail = val.category;
        } else if (key === 'pricePosition') {
          detail = val.pctFromHigh != null ? `${(val.pctFromHigh * 100).toFixed(0)}% off 52w high` : '';
        } else if (key === 'cashFlow') {
          const fm = val.fcfMargin != null ? `FCF margin ${(val.fcfMargin * 100).toFixed(1)}%` : '';
          const om = val.operatingMargins != null ? `op margin ${(val.operatingMargins * 100).toFixed(1)}%` : '';
          detail = [fm, om].filter(Boolean).join(', ');
        }
        const bar = val.pct >= 80 ? '🔴' : val.pct >= 50 ? '🟡' : '🟢';
        lines.push(`  ${bar} ${val.label}: ${val.score}/${val.max} (${val.pct}%)${detail ? ' — ' + detail : ''}`);
      }

      if (entry) {
        lines.push('');
        lines.push(`Suggested Trade (PAPER):`);
        lines.push(`  Short entry: $${currentPrice} | ${entry.suggestedShares} shares ($${entry.suggestedDollarAmount.toLocaleString()})`);
        lines.push(`  Hard stop: $${entry.hardStop} (max loss: $${entry.maxLossDollars.toLocaleString()})`);
        lines.push(`  Take profit targets: ${entry.takeProfitLevels.map(tp => `$${tp.price} (${tp.label})`).join(', ')}`);
        lines.push(`  To execute: "short ${s.ticker}" or "short ${s.ticker} ${entry.suggestedShares} shares"`);
      }

      if (s.warnings && s.warnings.length > 0) {
        lines.push('');
        lines.push('Warnings: ' + s.warnings.join('; '));
      }

      const result = {
        ticker: s.ticker,
        name: s.name,
        industry: s.industry || null,
        description: s.description ? s.description.slice(0, 200) + (s.description.length > 200 ? '...' : '') : null,
        price: currentPrice,
        marketCap: s.marketCap || null,
        score: s.score,
        passed: s.passed,
        thesis: s.thesis,
        scoreBreakdown,
        warnings: s.warnings,
        displaySummary: lines.join('\n')
      };

      if (entry) {
        result.suggestedEntry = {
          entryPrice: currentPrice,
          shares: entry.suggestedShares,
          dollarAmount: entry.suggestedDollarAmount,
          pctOfPortfolio: entry.pctOfPortfolio,
          tier: entry.convictionTier,
          hardStop: entry.hardStop,
          takeProfitLevels: entry.takeProfitLevels,
          maxLossDollars: entry.maxLossDollars,
          mode: entry.mode
        };
      }

      return result;
    });

    // Portfolio exposure summary
    const exposure = checkExposure();

    // Save scan to history
    saveScanHistory(sector || query || ticker || 'watchlist', results);

    if (textMode) {
      // Plain text output — show displaySummary directly
      const lines = [];
      lines.push(`📉 Short Scanner — ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
      lines.push(`Scanned: ${allData.length} stocks (source: ${tickerSource}) | Sector: ${sector || query || ticker || 'watchlist'}`);
      const passedCount = results.filter(r => r.passed).length;
      lines.push(`Passed filter: ${passedCount} | Mode: PAPER`);
      lines.push('');

      if (passedCount === 0 && results.length > 0) {
        lines.push('No stocks passed all filters this scan. Showing top scored results (filtered) for reference.');
        lines.push('Try: --sector software (narrower focus) or --ticker SYMBOL (analyze a specific stock)');
        lines.push('');
      } else if (results.length === 0) {
        lines.push('No results found. Try a different sector or query.');
        lines.push('Options: --sector software | --sector healthcare-it | --sector fintech | --sector all');
        lines.push('Or: --ticker CRM --verbose (analyze a specific stock)');
        lines.push('');
      }

      for (let i = 0; i < results.length; i++) {
        lines.push(`--- Result ${i + 1} of ${results.length} ---`);
        lines.push(results[i].displaySummary);
        lines.push('');
      }

      const exposure = checkExposure();
      lines.push(`📊 Portfolio: ${exposure.positionCount} positions | $${exposure.totalExposure} exposed (${(exposure.pctExposure * 100).toFixed(1)}%)`);
      lines.push('');
      lines.push('⚠️ Short selling has unlimited loss potential. Paper trading mode is active. Always use stop losses.');
      lines.push('💡 Say "short TICKER" to open a simulated position, or "short TICKER N shares" for custom sizing.');

      console.log(lines.join('\n'));
    } else {
      output({
        scan: {
          timestamp: new Date().toISOString(),
          sector: sector || null,
          query: query || null,
          ticker: ticker || null,
          watchlist: watchlist || false,
          tickerSource,
          tickersScanned: allData.length,
          resultCount: results.length,
          minScore
        },
        exposure: {
          totalExposure: exposure.totalExposure,
          pctExposure: exposure.pctExposure,
          positionCount: exposure.positionCount,
          mode: exposure.mode,
          warnings: exposure.warnings
        },
        results
      });
    }

  } catch (err) {
    output({ error: err.message, results: [] });
  }
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function saveScanHistory(label, results) {
  try {
    let history = [];
    try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch {}
    history.unshift({
      timestamp: new Date().toISOString(),
      label,
      resultCount: results.length,
      topResults: results.slice(0, 5).map(r => ({ ticker: r.ticker, score: r.score }))
    });
    // Keep last 100 scans
    history = history.slice(0, 100);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch {}
}

main();
