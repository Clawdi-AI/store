#!/usr/bin/env node
/**
 * Trade Simulator CLI — open/close simulated short positions with real market prices.
 *
 * Usage:
 *   node trade.js --open --ticker ZM                    # Open short at current price (auto-size)
 *   node trade.js --open --ticker ZM --shares 100       # Open short with specific share count
 *   node trade.js --open --ticker ZM --dollars 15000    # Open short with specific dollar amount
 *   node trade.js --close --ticker ZM                   # Close entire position
 *   node trade.js --close --ticker ZM --shares 50       # Partial close (50 shares)
 *   node trade.js --close --ticker ZM --reason "take profit at -20%"
 *   node trade.js --portfolio                           # Show full portfolio state
 *   node trade.js --history                             # Show closed trade history
 *
 * All trades use REAL market prices. Default is PAPER (simulated).
 * Add --live to execute real orders via IBKR (requires IB Gateway running).
 *
 *   node trade.js --open --ticker ZM --live              # LIVE short via IBKR
 *   node trade.js --close --ticker ZM --live             # LIVE cover via IBKR
 * Always outputs valid JSON.
 */

const { fetchTickerData, yahooQuote } = require('./lib/data');
const { scoreForShort } = require('./lib/screener');
const {
  loadPositions, savePositions, suggestEntry, calculateLevels,
  checkExposure, analyzePerformance, calculatePositionSize
} = require('./lib/risk');

const { execFileSync } = require('child_process');
const BROKER_JS = '/data/openclaw/skills/ibkr/scripts/broker.js';

const args = process.argv.slice(2);
const isLive = args.includes('--live');

function callBroker(...brokerArgs) {
  try {
    const out = execFileSync('node', [BROKER_JS, ...brokerArgs], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env }
    });
    return JSON.parse(out.trim());
  } catch (err) {
    const stderr = err.stderr?.trim() || '';
    const stdout = err.stdout?.trim() || '';
    try { return JSON.parse(stdout); } catch (_) {}
    return { error: stderr || err.message };
  }
}

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || true;
}
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const action = hasFlag('open') ? 'open' :
               hasFlag('close') ? 'close' :
               hasFlag('portfolio') ? 'portfolio' :
               hasFlag('history') ? 'history' : null;

const ticker = getArg('ticker')?.toUpperCase();
const sharesArg = getArg('shares') ? parseInt(getArg('shares')) : null;
const dollarsArg = getArg('dollars') ? parseInt(getArg('dollars')) : null;
const reason = getArg('reason') || null;

function getBorrowApr(config, position = null) {
  const apr = position?.borrowApr ?? config?.defaultBorrowApr ?? 0;
  return Number.isFinite(apr) ? apr : 0;
}

function calcBorrowCost(notional, apr, days) {
  if (!notional || !apr || !days || days <= 0) return 0;
  return notional * apr * (days / 365);
}

async function main() {
  try {
    if (!action) {
      return output({ error: 'Specify --open, --close, --portfolio, or --history' });
    }

    if (action === 'portfolio') return showPortfolio();
    if (action === 'history') return showHistory();
    if (!ticker) return output({ error: 'Specify --ticker SYMBOL' });

    if (action === 'open') return await openPosition();
    if (action === 'close') return await closePosition();
  } catch (err) {
    output({ error: err.message });
  }
}

async function openPosition() {
  const portfolio = loadPositions();
  const config = portfolio.config;

  // Check if already have an open position in this ticker
  const existing = portfolio.positions.find(p => p.ticker === ticker && p.status === 'open');
  if (existing) {
    return output({
      error: `Already have an open position in ${ticker}`,
      existing: {
        ticker: existing.ticker,
        entryPrice: existing.entryPrice,
        shares: existing.shares,
        entryDate: existing.entryDate
      }
    });
  }

  // Fetch real-time data and score
  const [data, quote] = await Promise.all([
    fetchTickerData(ticker),
    yahooQuote(ticker)
  ]);

  if (!data || !quote) {
    return output({ error: `Could not fetch data for ${ticker}` });
  }

  const currentPrice = quote.regularMarketPrice;
  if (!currentPrice || currentPrice <= 0) {
    return output({ error: `Invalid price for ${ticker}` });
  }

  // Score the ticker
  const scored = scoreForShort(data);

  // Calculate position size
  let shares, dollarAmount;

  if (sharesArg) {
    shares = sharesArg;
    dollarAmount = Math.round(shares * currentPrice);
  } else if (dollarsArg) {
    dollarAmount = dollarsArg;
    shares = Math.floor(dollarsArg / currentPrice);
  } else {
    // Auto-size based on score
    const sizing = calculatePositionSize(scored.score, currentPrice, config);
    shares = sizing.shares;
    dollarAmount = sizing.dollarAmount;
  }

  // Calculate stop/take-profit levels
  const levels = calculateLevels(currentPrice, config);
  const exposure = checkExposure();

  // Check if we can open this position
  const positionValue = shares * currentPrice;
  const warnings = [];

  if (exposure.positionCount >= config.maxPositions) {
    warnings.push(`At max positions (${config.maxPositions})`);
  }
  if (positionValue > exposure.remainingCapacity) {
    warnings.push(`Position $${Math.round(positionValue)} exceeds remaining capacity $${exposure.remainingCapacity}`);
  }
  if (scored.score < 45) {
    warnings.push(`Low scanner score (${scored.score}) — below 45 threshold`);
  }

  const borrowApr = getBorrowApr(config);

  // Create the position
  const position = {
    ticker,
    name: data.name,
    entryPrice: currentPrice,
    shares,
    dollarAmount: Math.round(positionValue),
    entryDate: new Date().toISOString().slice(0, 10),
    status: 'open',
    score: scored.score,
    thesis: scored.thesis,
    industry: data.industry || null,
    stopLoss: levels.hardStop,
    softAlert: levels.softAlert,
    takeProfitLevels: levels.takeProfitLevels.map(tp => tp.price),
    borrowApr,
    mode: isLive ? 'live' : 'paper'
  };

  // If live mode, execute via IBKR broker
  let brokerResult = null;
  if (isLive) {
    // Check shortability first
    const shortCheck = callBroker('--shortable', '--ticker', ticker);
    if (shortCheck.error) {
      return output({ error: 'Broker connection failed: ' + shortCheck.error, hint: 'Is IB Gateway running? Check with: node broker.js --check' });
    }
    if (shortCheck.shortable === 'unavailable') {
      return output({ error: ticker + ' is not available to short', shortableData: shortCheck });
    }

    // Place the short sell order (market order)
    brokerResult = callBroker('--short', '--ticker', ticker, '--shares', String(shares));
    if (brokerResult.error) {
      return output({ error: 'Failed to place short order: ' + brokerResult.error });
    }

    // Place stop-loss order
    const stopResult = callBroker('--stop', '--ticker', ticker, '--shares', String(shares), '--stop-price', String(levels.hardStop));
    position.stopOrderId = stopResult.orderId || null;
    position.brokerOrderId = brokerResult.orderId || null;
  }

  portfolio.positions.push(position);
  portfolio.lastUpdated = new Date().toISOString();
  savePositions(portfolio);

  // Return confirmation
  const newExposure = checkExposure();

  output({
    action: 'OPENED SHORT',
    mode: 'PAPER',
    position: {
      ticker,
      name: data.name,
      industry: data.industry,
      description: data.description ? data.description.slice(0, 150) : null,
      entryPrice: currentPrice,
      shares,
      dollarAmount: Math.round(positionValue),
      pctOfPortfolio: +(positionValue / config.totalCapital * 100).toFixed(1)
    },
    score: {
      total: scored.score,
      passed: scored.passed,
      thesis: scored.thesis
    },
    riskLevels: {
      hardStop: levels.hardStop,
      softAlert: levels.softAlert,
      takeProfitLevels: levels.takeProfitLevels,
      maxLossAtStop: Math.round((levels.hardStop - currentPrice) * shares),
      borrowApr,
      estimatedBorrowCostPerDay: Math.round((positionValue * borrowApr / 365) * 100) / 100
    },
    portfolio: {
      totalExposure: newExposure.totalExposure,
      pctExposure: +(newExposure.pctExposure * 100).toFixed(1),
      positionCount: newExposure.positionCount,
      remainingCapacity: newExposure.remainingCapacity
    },
    warnings,
    broker: isLive ? {
      mode: 'LIVE',
      orderResult: brokerResult,
      note: 'Order submitted to IBKR via IB Gateway'
    } : { mode: 'PAPER' }
  });
}

async function closePosition() {
  const portfolio = loadPositions();
  const posIdx = portfolio.positions.findIndex(p => p.ticker === ticker && p.status === 'open');

  if (posIdx === -1) {
    return output({
      error: `No open position in ${ticker}`,
      openPositions: portfolio.positions.filter(p => p.status === 'open').map(p => p.ticker)
    });
  }

  const position = portfolio.positions[posIdx];

  // Fetch current price
  const quote = await yahooQuote(ticker);
  if (!quote || !quote.regularMarketPrice) {
    return output({ error: `Could not fetch current price for ${ticker}` });
  }

  const exitPrice = quote.regularMarketPrice;
  const closingShares = sharesArg ? Math.min(sharesArg, position.shares) : position.shares;
  const isPartialClose = closingShares < position.shares;

  // Calculate P&L (short: profit when price drops)
  const pnl = (position.entryPrice - exitPrice) * closingShares;
  const pnlPct = (position.entryPrice - exitPrice) / position.entryPrice;
  const holdDays = position.entryDate
    ? Math.floor((Date.now() - new Date(position.entryDate).getTime()) / 86400000)
    : null;
  const exactHoldDays = position.entryDate
    ? (Date.now() - new Date(position.entryDate).getTime()) / 86400000
    : 0;
  const borrowApr = getBorrowApr(portfolio.config, position);
  const borrowCost = calcBorrowCost(position.entryPrice * closingShares, borrowApr, exactHoldDays);
  const netPnl = pnl - borrowCost;

  // Record closed trade
  const closedTrade = {
    ticker,
    name: position.name,
    industry: position.industry,
    entryPrice: position.entryPrice,
    exitPrice,
    shares: closingShares,
    entryDate: position.entryDate,
    exitDate: new Date().toISOString().slice(0, 10),
    holdDays,
    realizedPnl: Math.round(pnl),
    borrowCost: Math.round(borrowCost * 100) / 100,
    netRealizedPnl: Math.round(netPnl),
    realizedPnlPct: +(pnlPct * 100).toFixed(2),
    score: position.score,
    thesis: position.thesis,
    reason: reason || (pnl > 0 ? 'take profit' : 'stop loss'),
    mode: isLive ? 'live' : 'paper'
  };

  // If live mode, execute cover via IBKR broker
  let coverResult = null;
  if (isLive) {
    coverResult = callBroker('--cover', '--ticker', ticker, '--shares', String(closingShares));
    if (coverResult.error) {
      return output({ error: 'Failed to place cover order: ' + coverResult.error, hint: 'Position still open — cover manually or retry' });
    }
    closedTrade.brokerOrderId = coverResult.orderId || null;
  }

  portfolio.closed.push(closedTrade);

  if (isPartialClose) {
    // Reduce position size
    portfolio.positions[posIdx].shares -= closingShares;
  } else {
    // Remove position entirely
    portfolio.positions.splice(posIdx, 1);
  }

  portfolio.lastUpdated = new Date().toISOString();
  savePositions(portfolio);

  const exposure = checkExposure();
  const perf = analyzePerformance();

  output({
    action: isPartialClose ? 'PARTIAL CLOSE' : 'CLOSED SHORT',
    mode: 'PAPER',
    trade: {
      ticker,
      name: position.name,
      entryPrice: position.entryPrice,
      exitPrice,
      shares: closingShares,
      holdDays,
      pnl: Math.round(pnl),
      borrowCost: Math.round(borrowCost * 100) / 100,
      netPnl: Math.round(netPnl),
      pnlPct: +(pnlPct * 100).toFixed(2),
      result: netPnl > 0 ? 'WIN' : 'LOSS',
      reason: closedTrade.reason
    },
    remainingPosition: isPartialClose ? {
      shares: position.shares - closingShares,
      entryPrice: position.entryPrice
    } : null,
    portfolio: {
      totalExposure: exposure.totalExposure,
      pctExposure: +(exposure.pctExposure * 100).toFixed(1),
      positionCount: exposure.positionCount,
      remainingCapacity: exposure.remainingCapacity
    },
    performance: {
      totalTrades: perf.totalTrades,
      wins: perf.wins,
      losses: perf.losses,
      winRate: perf.winRate,
      totalRealizedPnl: perf.totalRealizedPnl,
      streak: perf.streakType ? `${perf.streakCount} ${perf.streakType === 'loss' ? 'losses' : 'wins'}` : 'none',
      lessons: perf.lessons
    },
    broker: isLive ? {
      mode: 'LIVE',
      coverResult,
      note: 'Cover order submitted to IBKR'
    } : { mode: 'PAPER' }
  });
}

function showPortfolio() {
  const portfolio = loadPositions();
  const config = portfolio.config;
  const exposure = checkExposure();
  const perf = analyzePerformance();
  const openPositions = portfolio.positions.filter(p => p.status === 'open');

  output({
    portfolio: {
      mode: config.mode,
      totalCapital: config.totalCapital,
      totalExposure: exposure.totalExposure,
      pctExposure: +(exposure.pctExposure * 100).toFixed(1),
      remainingCapacity: exposure.remainingCapacity,
      positionCount: openPositions.length,
      maxPositions: config.maxPositions,
      warnings: exposure.warnings
    },
    positions: openPositions.map(p => {
      const daysHeld = p.entryDate ? Math.max(0, (Date.now() - new Date(p.entryDate).getTime()) / 86400000) : 0;
      const notional = (p.dollarAmount || Math.round(p.entryPrice * p.shares));
      const borrowApr = getBorrowApr(config, p);
      const accruedBorrowCost = calcBorrowCost(notional, borrowApr, daysHeld);
      return {
        ticker: p.ticker,
        name: p.name,
        entryPrice: p.entryPrice,
        shares: p.shares,
        dollarAmount: notional,
        entryDate: p.entryDate,
        score: p.score,
        stopLoss: p.stopLoss,
        thesis: p.thesis,
        borrowApr,
        estimatedBorrowCostPerDay: Math.round((notional * borrowApr / 365) * 100) / 100,
        accruedBorrowCost: Math.round(accruedBorrowCost * 100) / 100,
        mode: p.mode
      };
    }),
    performance: {
      totalTrades: perf.totalTrades,
      wins: perf.wins,
      losses: perf.losses,
      winRate: perf.winRate,
      totalRealizedPnl: perf.totalRealizedPnl,
      avgWinPct: perf.avgWinPct,
      avgLossPct: perf.avgLossPct,
      bestTrade: perf.bestTrade,
      worstTrade: perf.worstTrade,
      avgHoldDays: perf.avgHoldDays,
      sizingMultiplier: perf.sizingMultiplier,
      streak: perf.streakType ? `${perf.streakCount} ${perf.streakType === 'loss' ? 'losses' : 'wins'}` : 'none',
      lessons: perf.lessons
    }
  });
}

function showHistory() {
  const portfolio = loadPositions();
  const closed = portfolio.closed || [];

  output({
    totalClosed: closed.length,
    totalRealizedPnl: closed.reduce((sum, t) => sum + (t.realizedPnl || 0), 0),
    trades: closed.map(t => ({
      ticker: t.ticker,
      name: t.name,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      shares: t.shares,
      entryDate: t.entryDate,
      exitDate: t.exitDate,
      holdDays: t.holdDays,
      pnl: t.realizedPnl,
      borrowCost: t.borrowCost || 0,
      netPnl: t.netRealizedPnl != null ? t.netRealizedPnl : t.realizedPnl,
      pnlPct: t.realizedPnlPct,
      result: (t.netRealizedPnl != null ? t.netRealizedPnl : t.realizedPnl) > 0 ? 'WIN' : 'LOSS',
      reason: t.reason,
      mode: t.mode
    }))
  });
}

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

main();
