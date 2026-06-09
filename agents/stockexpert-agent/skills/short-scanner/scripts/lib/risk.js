/**
 * Risk management for short-scanner.
 * Position sizing, stop loss, take profit, exposure limits.
 */

const fs = require('fs');
const path = require('path');

const POSITIONS_FILE = path.join(__dirname, '../../state/positions.json');

/**
 * Load portfolio state from positions.json
 */
function loadPositions() {
  try {
    const portfolio = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
    portfolio.config = {
      ...getDefaultPortfolio().config,
      ...(portfolio.config || {})
    };
    return portfolio;
  } catch {
    return getDefaultPortfolio();
  }
}

/**
 * Save portfolio state
 */
function savePositions(portfolio) {
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(portfolio, null, 2));
}

function getDefaultPortfolio() {
  return {
    config: {
      totalCapital: 300000,
      maxShortExposure: 0.40,    // 40% = $120k
      maxPerPosition: 0.08,       // 8% = $24k
      maxPositions: 8,
      hardStopLossPct: 0.15,      // 15% above entry
      softAlertPct: 0.10,         // 10% above entry
      takeProfitTiers: [0.15, 0.25, 0.35], // 15%, 25%, 35% below entry
      defaultBorrowApr: 0.03,     // 3% annualized borrow estimate in paper mode
      mode: 'paper'               // 'paper' or 'live'
    },
    positions: [],
    closed: [],
    lastUpdated: null
  };
}

/**
 * Analyze closed trade history to learn from past performance.
 * @returns {object} Performance stats + adaptive sizing multiplier
 */
function analyzePerformance() {
  const portfolio = loadPositions();
  const closed = portfolio.closed || [];

  if (closed.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      avgWinPct: null,
      avgLossPct: null,
      totalRealizedPnl: 0,
      bestTrade: null,
      worstTrade: null,
      avgHoldDays: null,
      sizingMultiplier: 1.0, // neutral — no history
      streakType: null,
      streakCount: 0,
      lessons: []
    };
  }

  let wins = 0, losses = 0;
  let totalWinPct = 0, totalLossPct = 0;
  let totalPnl = 0;
  let totalHoldDays = 0;
  let bestTrade = null, worstTrade = null;
  const lessons = [];

  // Track recent streak (last 5 trades)
  const recent = closed.slice(-5);
  let streakType = null, streakCount = 0;

  for (const trade of closed) {
    const pnl = trade.netRealizedPnl != null ? trade.netRealizedPnl : (trade.realizedPnl || 0);
    const pnlPct = trade.realizedPnlPct || 0;
    totalPnl += pnl;

    if (trade.entryDate && trade.exitDate) {
      const days = Math.floor((new Date(trade.exitDate) - new Date(trade.entryDate)) / 86400000);
      totalHoldDays += days;
    }

    if (pnl > 0) {
      wins++;
      totalWinPct += pnlPct;
      if (!bestTrade || pnl > bestTrade.pnl) bestTrade = { ticker: trade.ticker, pnl, pnlPct };
    } else {
      losses++;
      totalLossPct += pnlPct;
      if (!worstTrade || pnl < worstTrade.pnl) worstTrade = { ticker: trade.ticker, pnl, pnlPct };
    }
  }

  // Calculate streak from most recent trades
  for (let i = recent.length - 1; i >= 0; i--) {
    const won = (recent[i].realizedPnl || 0) > 0;
    if (streakType === null) {
      streakType = won ? 'win' : 'loss';
      streakCount = 1;
    } else if ((won && streakType === 'win') || (!won && streakType === 'loss')) {
      streakCount++;
    } else {
      break;
    }
  }

  const winRate = closed.length > 0 ? wins / closed.length : null;
  const avgWinPct = wins > 0 ? totalWinPct / wins : null;
  const avgLossPct = losses > 0 ? totalLossPct / losses : null;
  const avgHoldDays = closed.length > 0 ? Math.round(totalHoldDays / closed.length) : null;

  // === Adaptive sizing multiplier ===
  // Adjusts position size based on recent performance
  let sizingMultiplier = 1.0;

  // Losing streak → size down (protect capital)
  if (streakType === 'loss' && streakCount >= 3) {
    sizingMultiplier = 0.6;
    lessons.push(`Losing streak (${streakCount}) — reducing position sizes by 40%`);
  } else if (streakType === 'loss' && streakCount >= 2) {
    sizingMultiplier = 0.8;
    lessons.push(`2 consecutive losses — reducing position sizes by 20%`);
  }

  // Winning streak → can size up slightly (but stay disciplined)
  if (streakType === 'win' && streakCount >= 3) {
    sizingMultiplier = 1.15; // only +15%, not reckless
    lessons.push(`Winning streak (${streakCount}) — slightly increasing sizes (+15%)`);
  }

  // Overall poor win rate → be conservative
  if (closed.length >= 5 && winRate < 0.35) {
    sizingMultiplier = Math.min(sizingMultiplier, 0.7);
    lessons.push(`Low win rate (${(winRate * 100).toFixed(0)}%) — staying conservative on sizing`);
  }

  // Good win rate → slight confidence boost
  if (closed.length >= 5 && winRate > 0.6) {
    sizingMultiplier = Math.max(sizingMultiplier, 1.1);
    lessons.push(`Strong win rate (${(winRate * 100).toFixed(0)}%) — sizing with moderate confidence`);
  }

  // Avg loss bigger than avg win → tighten stops, reduce size
  if (avgWinPct != null && avgLossPct != null && Math.abs(avgLossPct) > Math.abs(avgWinPct) * 1.5) {
    sizingMultiplier = Math.min(sizingMultiplier, 0.75);
    lessons.push(`Avg loss (${avgLossPct.toFixed(1)}%) much larger than avg win (${avgWinPct.toFixed(1)}%) — reduce sizing, tighten stops`);
  }

  // Learn from sector patterns
  const sectorResults = {};
  for (const trade of closed) {
    const sector = trade.sector || trade.industry || 'unknown';
    if (!sectorResults[sector]) sectorResults[sector] = { wins: 0, losses: 0 };
    if ((trade.realizedPnl || 0) > 0) sectorResults[sector].wins++;
    else sectorResults[sector].losses++;
  }
  for (const [sector, stats] of Object.entries(sectorResults)) {
    if (stats.wins + stats.losses >= 3 && stats.losses > stats.wins * 2) {
      lessons.push(`Struggling in "${sector}" (${stats.wins}W/${stats.losses}L) — consider avoiding this sector`);
    }
    if (stats.wins + stats.losses >= 3 && stats.wins > stats.losses * 2) {
      lessons.push(`Strong in "${sector}" (${stats.wins}W/${stats.losses}L) — lean into this sector`);
    }
  }

  return {
    totalTrades: closed.length,
    wins,
    losses,
    winRate: winRate != null ? +winRate.toFixed(3) : null,
    avgWinPct: avgWinPct != null ? +avgWinPct.toFixed(2) : null,
    avgLossPct: avgLossPct != null ? +avgLossPct.toFixed(2) : null,
    totalRealizedPnl: Math.round(totalPnl),
    bestTrade,
    worstTrade,
    avgHoldDays,
    sizingMultiplier: +sizingMultiplier.toFixed(2),
    streakType,
    streakCount,
    lessons
  };
}

/**
 * Calculate position size based on score + adaptive performance.
 * Higher score = larger position. Adjusted by recent win/loss streak.
 * @param {number} score - Short score (0-100)
 * @param {number} currentPrice
 * @param {object} config - Portfolio config
 * @returns {object} { shares, dollarAmount, pctOfPortfolio, tier, adjustment }
 */
function calculatePositionSize(score, currentPrice, config) {
  if (!config) config = loadPositions().config;

  let basePct;
  let tier;

  if (score >= 80) {
    basePct = 0.07; // 7% = ~$21k
    tier = 'high-conviction';
  } else if (score >= 70) {
    basePct = 0.055; // 5.5% = ~$16.5k
    tier = 'medium-conviction';
  } else if (score >= 60) {
    basePct = 0.04; // 4% = ~$12k
    tier = 'starter';
  } else {
    basePct = 0.025; // 2.5% = ~$7.5k
    tier = 'watchlist-only';
  }

  // Apply adaptive sizing from performance history
  const perf = analyzePerformance();
  const adjustedPct = basePct * perf.sizingMultiplier;

  // Cap at max per position
  const pctOfPortfolio = Math.min(adjustedPct, config.maxPerPosition);

  const dollarAmount = Math.round(config.totalCapital * pctOfPortfolio);
  const shares = currentPrice > 0 ? Math.floor(dollarAmount / currentPrice) : 0;

  return {
    shares,
    dollarAmount,
    pctOfPortfolio,
    basePct,
    tier,
    adjustment: perf.sizingMultiplier !== 1.0
      ? { multiplier: perf.sizingMultiplier, reason: perf.lessons.join('; ') }
      : null
  };
}

/**
 * Calculate stop loss and take profit levels.
 * @param {number} entryPrice - Short entry price
 * @param {object} config - Portfolio config
 * @returns {object} { hardStop, softAlert, takeProfitLevels }
 */
function calculateLevels(entryPrice, config) {
  if (!config) config = loadPositions().config;

  return {
    hardStop: +(entryPrice * (1 + config.hardStopLossPct)).toFixed(2),
    softAlert: +(entryPrice * (1 + config.softAlertPct)).toFixed(2),
    takeProfitLevels: config.takeProfitTiers.map(pct => ({
      pct: pct,
      price: +(entryPrice * (1 - pct)).toFixed(2),
      label: `-${(pct * 100).toFixed(0)}%`
    }))
  };
}

/**
 * Check portfolio exposure against limits.
 * @returns {object} { totalExposure, pctExposure, positionCount, withinLimits, warnings }
 */
function checkExposure() {
  const portfolio = loadPositions();
  const config = portfolio.config;
  const openPositions = portfolio.positions.filter(p => p.status === 'open');

  const totalExposure = openPositions.reduce((sum, p) => {
    return sum + Math.abs(p.shares * (p.currentPrice || p.entryPrice));
  }, 0);

  const pctExposure = totalExposure / config.totalCapital;
  const maxDollars = config.totalCapital * config.maxShortExposure;
  const warnings = [];

  if (pctExposure > config.maxShortExposure) {
    warnings.push(`OVER LIMIT: ${(pctExposure * 100).toFixed(1)}% exposure exceeds ${(config.maxShortExposure * 100)}% max`);
  } else if (pctExposure > config.maxShortExposure * 0.8) {
    warnings.push(`NEAR LIMIT: ${(pctExposure * 100).toFixed(1)}% exposure approaching ${(config.maxShortExposure * 100)}% max`);
  }

  if (openPositions.length >= config.maxPositions) {
    warnings.push(`MAX POSITIONS: ${openPositions.length}/${config.maxPositions} slots filled`);
  }

  return {
    totalExposure: Math.round(totalExposure),
    pctExposure: +pctExposure.toFixed(4),
    positionCount: openPositions.length,
    maxPositions: config.maxPositions,
    maxDollars: Math.round(maxDollars),
    remainingCapacity: Math.round(maxDollars - totalExposure),
    withinLimits: pctExposure <= config.maxShortExposure && openPositions.length < config.maxPositions,
    warnings,
    mode: config.mode
  };
}

/**
 * Check a single position against stop/take-profit levels.
 * @param {object} position - Position from positions.json
 * @param {number} currentPrice - Current market price
 * @returns {object} { alerts, pnl, pnlPct, shouldClose }
 */
function checkPosition(position, currentPrice) {
  const config = loadPositions().config;
  const levels = calculateLevels(position.entryPrice, config);
  const alerts = [];

  // P&L for short: profit when price goes down
  const pnl = (position.entryPrice - currentPrice) * position.shares;
  const pnlPct = (position.entryPrice - currentPrice) / position.entryPrice;
  const daysHeld = position.entryDate ? Math.max(0, (Date.now() - new Date(position.entryDate).getTime()) / 86400000) : 0;
  const borrowApr = position.borrowApr ?? config.defaultBorrowApr ?? 0;
  const borrowCost = (position.entryPrice * position.shares) * borrowApr * (daysHeld / 365);
  const netPnl = pnl - borrowCost;

  let shouldClose = false;

  // Check hard stop
  if (currentPrice >= levels.hardStop) {
    alerts.push({
      type: 'HARD_STOP',
      severity: 'critical',
      message: `${position.ticker} hit hard stop at $${levels.hardStop} (current: $${currentPrice}). CLOSE POSITION.`,
      loss: Math.round(-pnl)
    });
    shouldClose = true;
  }
  // Check soft alert
  else if (currentPrice >= levels.softAlert) {
    alerts.push({
      type: 'SOFT_ALERT',
      severity: 'warning',
      message: `${position.ticker} approaching stop at $${levels.softAlert} (current: $${currentPrice}). Review position.`,
      loss: Math.round(-pnl)
    });
  }

  // Check take profit levels
  for (const tp of levels.takeProfitLevels) {
    if (currentPrice <= tp.price) {
      alerts.push({
        type: 'TAKE_PROFIT',
        severity: 'info',
        message: `${position.ticker} reached ${tp.label} target at $${tp.price} (current: $${currentPrice}). Consider taking profit.`,
        profit: Math.round(netPnl)
      });
    }
  }

  return {
    ticker: position.ticker,
    entryPrice: position.entryPrice,
    currentPrice,
    shares: position.shares,
    pnl: Math.round(pnl),
    borrowCost: Math.round(borrowCost * 100) / 100,
    netPnl: Math.round(netPnl),
    borrowApr,
    pnlPct: +(pnlPct * 100).toFixed(2),
    levels,
    alerts,
    shouldClose
  };
}

/**
 * Generate a suggested position entry for a scored ticker.
 * @param {object} scoreResult - Result from screener.scoreForShort()
 * @param {number} currentPrice - Current price
 * @returns {object} Suggested position parameters
 */
function suggestEntry(scoreResult, currentPrice) {
  const portfolio = loadPositions();
  const config = portfolio.config;
  const exposure = checkExposure();

  const sizing = calculatePositionSize(scoreResult.score, currentPrice, config);
  const levels = calculateLevels(currentPrice, config);
  const perf = analyzePerformance();

  const canOpen = exposure.withinLimits && sizing.dollarAmount <= exposure.remainingCapacity;

  return {
    ticker: scoreResult.ticker,
    score: scoreResult.score,
    currentPrice,
    suggestedShares: sizing.shares,
    suggestedDollarAmount: sizing.dollarAmount,
    pctOfPortfolio: sizing.pctOfPortfolio,
    convictionTier: sizing.tier,
    sizingAdjustment: sizing.adjustment,
    hardStop: levels.hardStop,
    softAlert: levels.softAlert,
    takeProfitLevels: levels.takeProfitLevels,
    maxLossPerShare: +(levels.hardStop - currentPrice).toFixed(2),
    maxLossDollars: Math.round((levels.hardStop - currentPrice) * sizing.shares),
    canOpen,
    mode: config.mode,
    blockers: canOpen ? [] : [
      ...(!exposure.withinLimits ? ['Portfolio exposure or position limit reached'] : []),
      ...(sizing.dollarAmount > exposure.remainingCapacity ? [`Insufficient capacity ($${exposure.remainingCapacity} remaining)`] : [])
    ],
    performanceSummary: perf.totalTrades > 0 ? {
      totalTrades: perf.totalTrades,
      winRate: perf.winRate,
      sizingMultiplier: perf.sizingMultiplier,
      streak: perf.streakType ? `${perf.streakCount} ${perf.streakType}s` : null,
      lessons: perf.lessons
    } : null
  };
}

module.exports = {
  loadPositions,
  savePositions,
  getDefaultPortfolio,
  analyzePerformance,
  calculatePositionSize,
  calculateLevels,
  checkExposure,
  checkPosition,
  suggestEntry
};
