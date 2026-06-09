/**
 * Short-scanner scoring engine.
 * 7-factor composite score (0-100). Higher = better short candidate.
 *
 * Adapted from NickFiorani's fundamental-stock-analysis playbook,
 * but INVERTED: what makes a bad long makes a good short.
 */

const { assessAiMoat } = require('./ai-moat');

/**
 * Score a single ticker for short-selling attractiveness.
 * @param {object} data - Normalized ticker data from data.js fetchTickerData()
 * @returns {object} { score, breakdown, passed, thesis, warnings }
 */
function scoreForShort(data) {
  const breakdown = {};
  const warnings = [];
  let totalScore = 0;

  // --- 1. Valuation Excess (25 pts) ---
  // Higher valuation = better short target
  const valuation = scoreValuation(data);
  breakdown.valuation = valuation;
  totalScore += valuation.score;

  // --- 2. Revenue Deceleration (20 pts) ---
  // Slowing growth = better short
  const revenueDecel = scoreRevenueDecel(data);
  breakdown.revenueDecel = revenueDecel;
  totalScore += revenueDecel.score;

  // --- 3. AI Vulnerability (20 pts) ---
  // More vulnerable to AI disruption = better short
  const aiVuln = scoreAiVulnerability(data);
  breakdown.aiVulnerability = aiVuln;
  totalScore += aiVuln.score;

  // --- 4. Price vs 52-Week High (15 pts) ---
  // Stocks near highs have more room to fall
  const pricePosition = scorePricePosition(data);
  breakdown.pricePosition = pricePosition;
  totalScore += pricePosition.score;

  // --- 5. Cash Flow Health (10 pts) ---
  // Weak/negative FCF = better short
  const cashFlow = scoreCashFlow(data);
  breakdown.cashFlow = cashFlow;
  totalScore += cashFlow.score;

  // --- 6. Insider Activity (5 pts) ---
  // Net insider selling = bearish signal
  const insider = scoreInsiderActivity(data);
  breakdown.insider = insider;
  totalScore += insider.score;

  // --- 7. Short Interest (5 pts) ---
  // Low short interest = less crowded, more room to run
  const shortInt = scoreShortInterest(data);
  breakdown.shortInterest = shortInt;
  totalScore += shortInt.score;

  // Clamp
  totalScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  // --- Pass filter ---
  const passed = checkPassFilter(data, totalScore, aiVuln, warnings);

  // --- Generate thesis ---
  const thesis = generateThesis(data, breakdown, totalScore);

  return {
    ticker: data.ticker,
    name: data.name,
    industry: data.industry || null,
    country: data.country || null,
    description: data.description || null,
    marketCap: data.marketCap || null,
    score: totalScore,
    breakdown,
    passed,
    thesis,
    warnings
  };
}

// --- Factor scoring functions ---

function scoreValuation(data) {
  let score = 0;
  const details = {};

  const fwdPE = data.forwardPE;
  const ps = data.priceToSales;
  const trailingPE = data.trailingPE;

  details.forwardPE = fwdPE;
  details.priceToSales = ps;
  details.trailingPE = trailingPE;

  // Forward P/E scoring (max 13 pts)
  if (fwdPE != null && fwdPE > 0) {
    if (fwdPE > 80) score += 13;
    else if (fwdPE > 60) score += 11;
    else if (fwdPE > 45) score += 9;
    else if (fwdPE > 35) score += 7;
    else if (fwdPE > 30) score += 4;
    else if (fwdPE > 25) score += 2;
  } else if (fwdPE != null && fwdPE < 0) {
    // Negative earnings — could be good short if revenue is also weak
    score += 8;
    details.note = 'Negative forward earnings';
  }

  // P/S scoring (max 12 pts)
  if (ps != null) {
    if (ps > 20) score += 12;
    else if (ps > 15) score += 10;
    else if (ps > 10) score += 8;
    else if (ps > 8) score += 6;
    else if (ps > 5) score += 3;
    else if (ps > 3) score += 1;
  }

  return { score: Math.min(25, score), max: 25, details, label: 'Valuation Excess' };
}

function scoreRevenueDecel(data) {
  let score = 0;
  const details = {};

  const revenueGrowth = data.revenueGrowth;
  const earningsGrowth = data.earningsGrowth;

  details.revenueGrowth = revenueGrowth;
  details.earningsGrowth = earningsGrowth;

  // Revenue growth scoring (max 12 pts) — lower/negative growth = higher score
  if (revenueGrowth != null) {
    if (revenueGrowth < -0.1) score += 12;       // Declining >10%
    else if (revenueGrowth < 0) score += 10;      // Any decline
    else if (revenueGrowth < 0.05) score += 8;    // <5% growth (stalling)
    else if (revenueGrowth < 0.10) score += 5;    // <10% (decelerating)
    else if (revenueGrowth < 0.15) score += 3;    // <15% (slowing)
    else if (revenueGrowth < 0.20) score += 1;    // <20% (still growing)
  }

  // Earnings growth scoring (max 8 pts)
  if (earningsGrowth != null) {
    if (earningsGrowth < -0.2) score += 8;
    else if (earningsGrowth < -0.1) score += 6;
    else if (earningsGrowth < 0) score += 4;
    else if (earningsGrowth < 0.05) score += 2;
  }

  // FMP quarterly revenue trend (bonus, if available)
  if (data.fmp && data.fmp.income && data.fmp.income.length >= 4) {
    const revenues = data.fmp.income.slice(0, 4).map(q => q.revenue).filter(Boolean);
    if (revenues.length >= 4) {
      const recent = revenues[0];
      const older = revenues[3];
      if (older > 0) {
        const qoqTrend = (recent - older) / older;
        details.qoqRevenueTrend = qoqTrend;
        if (qoqTrend < -0.05) score += 3;
        else if (qoqTrend < 0) score += 1;
      }
    }
  }

  return { score: Math.min(20, score), max: 20, details, label: 'Revenue Deceleration' };
}

function scoreAiVulnerability(data) {
  const aiMoat = assessAiMoat(data.ticker, data.description, data.industry);
  let score = 0;

  // Two-axis scoring:
  // "Built for AI" companies (serve machine/AI customers) → low score (don't short)
  // "Built for humans" companies (serve human workflows) → high score (good short)
  if (aiMoat.axis === 'built-for-ai') {
    score = 1; // Almost zero — these get STRONGER with more AI
  } else if (aiMoat.axis === 'built-for-humans') {
    score = 19; // Maximum — AI replaces their human users
  } else if (aiMoat.axis === 'mixed') {
    score = 8; // Cautious middle ground
  } else {
    // Unknown axis — fall back to risk level
    if (aiMoat.risk === 'low') score = 16;
    else if (aiMoat.risk === 'medium') score = 10;
    else score = 3;
  }

  // Bonus for industry keywords indicating human-facing tools
  if (/workflow|project management|collaboration|help desk|ticketing|document|e-sign/i.test(data.industry || '')) {
    score = Math.min(20, score + 2);
  }

  return {
    score: Math.min(20, score),
    max: 20,
    details: {
      aiMoatRisk: aiMoat.risk,
      axis: aiMoat.axis,
      flags: aiMoat.flags,
      category: aiMoat.category
    },
    label: 'AI Vulnerability'
  };
}

function scorePricePosition(data) {
  let score = 0;
  const details = {};

  const price = data.price;
  const high52 = data.fiftyTwoWeekHigh;
  const low52 = data.fiftyTwoWeekLow;

  if (price && high52 && high52 > 0) {
    const pctFromHigh = (high52 - price) / high52;
    details.pctFromHigh = pctFromHigh;
    details.fiftyTwoWeekHigh = high52;
    details.price = price;

    // Stocks near their 52w high are better shorts (more room to fall)
    if (pctFromHigh < 0.05) score = 15;       // Within 5% of high
    else if (pctFromHigh < 0.10) score = 13;
    else if (pctFromHigh < 0.15) score = 10;
    else if (pctFromHigh < 0.20) score = 7;
    else if (pctFromHigh < 0.30) score = 4;
    else score = 1; // Already >30% off — limited downside conviction
  }

  if (price && low52 && high52) {
    details.rangePosition = (price - low52) / (high52 - low52); // 1.0 = at high, 0.0 = at low
  }

  return { score: Math.min(15, score), max: 15, details, label: 'Price Near 52w High' };
}

function scoreCashFlow(data) {
  let score = 0;
  const details = {};

  const fcf = data.freeCashflow;
  const revenue = data.totalRevenue;
  const opMargin = data.operatingMargins;

  details.freeCashflow = fcf;
  details.operatingMargins = opMargin;

  // Negative FCF is bearish (max 6 pts)
  if (fcf != null) {
    if (fcf < 0) {
      score += 6;
      details.fcfNote = 'Negative FCF — cash burn';
    } else if (revenue && revenue > 0) {
      const fcfMargin = fcf / revenue;
      details.fcfMargin = fcfMargin;
      if (fcfMargin < 0.05) score += 4;
      else if (fcfMargin < 0.10) score += 2;
    }
  }

  // Low/negative operating margins (max 4 pts)
  if (opMargin != null) {
    if (opMargin < 0) score += 4;
    else if (opMargin < 0.05) score += 3;
    else if (opMargin < 0.10) score += 2;
    else if (opMargin < 0.15) score += 1;
  }

  // FMP cash flow trend (bonus)
  if (data.fmp && data.fmp.cashFlow && data.fmp.cashFlow.length >= 2) {
    const flows = data.fmp.cashFlow.map(q => q.freeCashFlow).filter(f => f != null);
    if (flows.length >= 2 && flows[1] > 0 && flows[0] < flows[1]) {
      score += 1; // Declining FCF trend
      details.fcfTrendNote = 'FCF declining QoQ';
    }
  }

  return { score: Math.min(10, score), max: 10, details, label: 'Cash Flow Weakness' };
}

function scoreInsiderActivity(data) {
  let score = 0;
  const details = {};

  const txns = data.insiderTransactions || [];
  if (txns.length === 0) {
    return { score: 2, max: 5, details: { note: 'No insider data — neutral' }, label: 'Insider Selling' };
  }

  // Count recent insider buys vs sells (last 6 months)
  const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
  let netSelling = 0;
  let totalTxns = 0;

  for (const txn of txns.slice(0, 20)) {
    const date = txn.startDate?.raw || txn.startDate || 0;
    const dateMs = typeof date === 'number' && date < 1e12 ? date * 1000 : date;
    if (dateMs < sixMonthsAgo) continue;

    totalTxns++;
    const shares = txn.shares?.raw || txn.shares || txn.change || 0;
    const type = (txn.transactionText || txn.transactionType || '').toLowerCase();

    if (type.includes('sale') || type.includes('sell') || shares < 0) {
      netSelling++;
    } else if (type.includes('purchase') || type.includes('buy') || (type.includes('acquisition') && shares > 0)) {
      netSelling--;
    }
  }

  details.netSelling = netSelling;
  details.totalTxns = totalTxns;

  if (netSelling >= 5) score = 5;
  else if (netSelling >= 3) score = 4;
  else if (netSelling >= 1) score = 3;
  else if (netSelling === 0) score = 2;
  else score = 0; // Net buying — bad for shorts

  return { score: Math.min(5, score), max: 5, details, label: 'Insider Selling' };
}

function scoreShortInterest(data) {
  let score = 0;
  const details = {};

  const siPct = data.shortPercentOfFloat;
  details.shortPercentOfFloat = siPct;

  if (siPct != null) {
    // Low short interest = less crowded = better for us (less squeeze risk)
    if (siPct < 0.03) score = 5;
    else if (siPct < 0.05) score = 4;
    else if (siPct < 0.08) score = 3;
    else if (siPct < 0.15) score = 2;
    else {
      score = 1; // High SI = crowded, squeeze risk
      details.warning = 'High short interest — squeeze risk';
    }
  } else {
    score = 2; // No data — neutral
  }

  return { score: Math.min(5, score), max: 5, details, label: 'Short Interest (uncrowded)' };
}

// --- Pass filter ---

function checkPassFilter(data, totalScore, aiVuln, warnings) {
  let passed = true;

  // --- Hard filters (these BLOCK passing) ---

  // Must not be "built for AI" (these get stronger with AI growth)
  if (aiVuln.details.axis === 'built-for-ai') {
    warnings.push(`BUILT FOR AI — more AI = stronger business (${aiVuln.details.flags.join('; ')})`);
    passed = false;
  } else if (aiVuln.details.aiMoatRisk === 'high' && aiVuln.details.axis !== 'built-for-humans') {
    warnings.push(`High AI moat — dangerous to short (${aiVuln.details.flags.join('; ')})`);
    passed = false;
  }

  // Industry relevance — our thesis targets software/SaaS/IT, not biotech/pharma/utilities/trucking
  const ind = (data.industry || '').toLowerCase();
  const IRRELEVANT_INDUSTRIES = [
    // Biotech / pharma
    'biotechnology', 'drug manufacturer', 'pharmaceutical',
    // Energy / utilities
    'utilities', 'regulated electric', 'regulated gas', 'renewable', 'solar',
    'oil & gas', 'coal', 'uranium',
    // Transportation
    'trucking', 'railroads', 'marine shipping', 'airlines',
    // Finance (non-fintech)
    'banks', 'savings & loans', 'insurance', 'asset management',
    // Real estate
    'reit', 'real estate',
    // Manufacturing / industrial
    'building materials', 'farm products', 'agricultural',
    'metal fabrication', 'steel', 'aluminum', 'copper',
    'aerospace & defense', 'auto manufacturer', 'auto parts',
    'electrical equipment', 'industrial distribution',
    // Consumer / hospitality
    'restaurants', 'resorts', 'lodging', 'gambling',
    'beverages', 'tobacco', 'household products', 'packaged foods',
    'apparel', 'footwear', 'luxury',
    // Hardware / physical tech (not SaaS)
    'electronic components', 'electronics & computer distribution',
    'computer hardware', 'semiconductor equipment',
    'scientific & technical instruments', 'communication equipment',
    'consumer electronics', 'semiconductors',
    // Media / entertainment / sports (not software)
    'entertainment', 'broadcasting', 'advertising',
    'publishing', 'media - diversified',
    'leisure', 'sports', 'gambling',
    // Telecom (not software)
    'telecom', 'wireless', 'pay tv',
    // Other non-software
    'shell companies', 'conglomerates', 'staffing', 'consulting',
    'waste management', 'security & protection', 'diagnostics & research'
  ];
  if (ind && IRRELEVANT_INDUSTRIES.some(kw => ind.includes(kw))) {
    warnings.push(`Industry "${data.industry}" outside our SaaS/software/IT thesis`);
    passed = false;
  }

  // Country filter — US stocks only, no Chinese-domiciled companies
  const country = (data.country || '').toLowerCase();
  if (country && (country === 'china' || country === 'hong kong')) {
    warnings.push(`Domiciled in ${data.country} — US-only thesis`);
    passed = false;
  }

  // Core product must be SOFTWARE — reject companies whose primary business
  // is patent licensing, crypto mining, hardware manufacturing, or outsourcing/services
  const desc = (data.description || '').toLowerCase();
  const NON_SOFTWARE_KEYWORDS = [
    { pattern: /patent\s*(licens|royalt|portfolio)/i, label: 'patent licensing company' },
    { pattern: /technolog\w+.{0,50}licens\w+\s+to\s+compan/i, label: 'technology licensing company' },
    { pattern: /\bresearch and development company\b/i, label: 'R&D/patent licensing company' },
    { pattern: /\b(bitcoin|crypto|digital asset)\s*(min|treasury)/i, label: 'crypto mining/treasury' },
    { pattern: /manufactur\w+.{0,30}(display|lcd|oled|panel|chip|sensor|hardware)/i, label: 'hardware manufacturer' },
    { pattern: /quantum\s*comput/i, label: 'quantum computing hardware' },
    { pattern: /\b(outsourc|staffing|body\s*shop)/i, label: 'outsourcing/staffing' }
  ];
  for (const { pattern, label } of NON_SOFTWARE_KEYWORDS) {
    if (pattern.test(desc) || pattern.test(data.industry || '')) {
      warnings.push(`Core business is ${label}, not software`);
      passed = false;
      break;
    }
  }

  // Must have minimum composite score (the 7-factor score IS the primary filter)
  if (totalScore < 50) {
    warnings.push(`Score ${totalScore} below minimum threshold of 50`);
    passed = false;
  }

  // --- Soft filters (warnings only, don't block passing) ---

  // Valuation context — warn if not classically overvalued, but don't block
  const fwdPE = data.forwardPE;
  if (fwdPE != null && fwdPE > 0 && fwdPE < 20) {
    warnings.push(`Forward P/E ${fwdPE.toFixed(1)} is low — may not be overvalued`);
  }

  const ps = data.priceToSales;
  if (ps != null && ps < 3) {
    warnings.push(`P/S ratio ${ps.toFixed(1)} is low — value territory`);
  }

  // Price position — warn if already beaten down significantly
  if (data.price && data.fiftyTwoWeekHigh && data.fiftyTwoWeekHigh > 0) {
    const pctOff = (data.fiftyTwoWeekHigh - data.price) / data.fiftyTwoWeekHigh;
    if (pctOff > 0.40) {
      warnings.push(`Already ${(pctOff * 100).toFixed(0)}% off 52w high — limited downside`);
      passed = false; // 40%+ off is a hard block — truly beaten down
    } else if (pctOff > 0.30) {
      warnings.push(`${(pctOff * 100).toFixed(0)}% off 52w high — consider smaller position`);
    }
  }

  // Market cap check ($1B-$100B)
  if (data.marketCap && (data.marketCap < 1e9 || data.marketCap > 100e9)) {
    warnings.push(`Market cap $${(data.marketCap / 1e9).toFixed(1)}B outside $1-100B range`);
  }

  return passed;
}

// --- Thesis generator ---

function generateThesis(data, breakdown, score) {
  const parts = [];

  // Top factors
  const sorted = Object.entries(breakdown)
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => (b.score / b.max) - (a.score / a.max));

  const top = sorted.slice(0, 3);
  for (const factor of top) {
    const pct = ((factor.score / factor.max) * 100).toFixed(0);
    if (factor.score / factor.max >= 0.6) {
      parts.push(`${factor.label} (${pct}%)`);
    }
  }

  if (parts.length === 0) {
    return `Weak short candidate (score ${score}) — no strong bearish signals.`;
  }

  return `Short candidate (score ${score}): Strongest bearish signals from ${parts.join(', ')}.`;
}

/**
 * Batch score multiple tickers.
 * @param {object[]} dataArray - Array of normalized ticker data
 * @param {object} opts - { minScore: 55, limit: 10 }
 * @returns {object[]} Sorted results, highest score first
 */
function batchScore(dataArray, opts = {}) {
  const minScore = opts.minScore || 0;
  const limit = opts.limit || 50;

  const results = dataArray
    .map(d => scoreForShort(d))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}

module.exports = { scoreForShort, batchScore };
