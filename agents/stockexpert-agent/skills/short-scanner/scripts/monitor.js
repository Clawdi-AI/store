#!/usr/bin/env node
/**
 * Position Monitor CLI — check open positions against stop/take-profit levels.
 *
 * Usage:
 *   node monitor.js
 *   node monitor.js --ticker CRM
 *   node monitor.js --summary
 *
 * Always outputs valid JSON.
 */

const { yahooQuote } = require('./lib/data');
const { loadPositions, checkPosition, checkExposure, analyzePerformance } = require('./lib/risk');

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || true;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const filterTicker = getArg('ticker');
const summaryOnly = hasFlag('summary');

async function main() {
  try {
    const portfolio = loadPositions();
    const config = portfolio.config;
    let openPositions = portfolio.positions.filter(p => p.status === 'open');

    if (filterTicker) {
      openPositions = openPositions.filter(p => p.ticker === filterTicker.toUpperCase());
    }

    const performance = analyzePerformance();

    if (openPositions.length === 0) {
      return output({
        monitor: {
          timestamp: new Date().toISOString(),
          mode: config.mode,
          positionCount: 0,
          message: 'No open positions to monitor.'
        },
        exposure: checkExposure(),
        performance,
        positions: [],
        alerts: []
      });
    }

    // Fetch current prices for all positions
    const CONCURRENCY = 5;
    const priceMap = {};
    for (let i = 0; i < openPositions.length; i += CONCURRENCY) {
      const batch = openPositions.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(p => yahooQuote(p.ticker))
      );
      for (let j = 0; j < batch.length; j++) {
        const r = results[j];
        if (r.status === 'fulfilled' && r.value) {
          priceMap[batch[j].ticker] = r.value.regularMarketPrice || 0;
        }
      }
    }

    // Check each position
    const positionResults = [];
    const allAlerts = [];
    let totalPnl = 0;
    let totalBorrowCost = 0;
    let totalExposure = 0;

    for (const pos of openPositions) {
      const currentPrice = priceMap[pos.ticker] || 0;
      if (currentPrice === 0) {
        positionResults.push({
          ticker: pos.ticker,
          error: 'Could not fetch current price'
        });
        continue;
      }

      const check = checkPosition(pos, currentPrice);
      totalPnl += check.netPnl;
      totalBorrowCost += check.borrowCost || 0;
      totalExposure += Math.abs(currentPrice * pos.shares);

      const result = {
        ticker: check.ticker,
        entryPrice: check.entryPrice,
        currentPrice: check.currentPrice,
        shares: check.shares,
        pnl: check.pnl,
        borrowCost: check.borrowCost,
        netPnl: check.netPnl,
        borrowApr: check.borrowApr,
        pnlPct: check.pnlPct,
        entryDate: pos.entryDate || null,
        daysHeld: pos.entryDate ? Math.floor((Date.now() - new Date(pos.entryDate).getTime()) / 86400000) : null,
        alertCount: check.alerts.length,
        shouldClose: check.shouldClose
      };

      if (!summaryOnly) {
        result.levels = check.levels;
        result.alerts = check.alerts;
      }

      positionResults.push(result);

      for (const alert of check.alerts) {
        allAlerts.push({
          ...alert,
          ticker: pos.ticker
        });
      }
    }

    // Sort alerts by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    allAlerts.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

    const exposure = checkExposure();

    output({
      monitor: {
        timestamp: new Date().toISOString(),
        mode: config.mode,
        positionCount: openPositions.length,
        totalPnl,
        totalBorrowCost: Math.round(totalBorrowCost * 100) / 100,
        totalPnlPct: totalExposure > 0 ? +((totalPnl / totalExposure) * 100).toFixed(2) : 0,
        totalExposure: Math.round(totalExposure),
        alertCount: allAlerts.length,
        criticalAlerts: allAlerts.filter(a => a.severity === 'critical').length
      },
      exposure: {
        totalExposure: exposure.totalExposure,
        pctExposure: exposure.pctExposure,
        positionCount: exposure.positionCount,
        maxPositions: exposure.maxPositions,
        remainingCapacity: exposure.remainingCapacity,
        mode: exposure.mode,
        warnings: exposure.warnings
      },
      performance,
      alerts: allAlerts,
      positions: positionResults
    });

  } catch (err) {
    output({ error: err.message, positions: [], alerts: [] });
  }
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

main();
