/**
 * AI moat detection — two-axis model:
 *
 * Axis 1: BUILT FOR AI (customers are AI/machines)
 *   More AI usage → more revenue. GPU, memory, networking, power, cooling,
 *   cloud infra, EDA, data centers. These get STRONGER as AI grows.
 *   → DANGEROUS to short.
 *
 * Axis 2: BUILT FOR HUMANS (customers are human end-users)
 *   AI replaces human workflows → product becomes redundant.
 *   Design tools, project management, traditional SaaS, document tools.
 *   → GOOD short targets.
 */

// ═══════════════════════════════════════════════
// BUILT FOR AI — more AI = stronger business
// Companies whose products are consumed by AI workloads
// ═══════════════════════════════════════════════

const BUILT_FOR_AI = {
  // GPU / AI compute chips
  gpuCompute: [
    'NVDA', 'AMD', 'AVGO', 'MRVL', 'QCOM', 'TSM',
    'ARM', 'SMCI', 'VRT'
  ],
  // Memory / storage (AI needs massive RAM + fast storage)
  memoryStorage: [
    'MU', 'WDC', 'STX', 'NXPI', 'ON',  // DRAM, NAND, controllers
    'PSTG', 'NTAP'                        // enterprise AI storage
  ],
  // Networking (data center interconnect, AI cluster networking)
  networking: [
    'NET', 'ANET', 'CSCO', 'INFN', 'LITE', 'CIEN'
  ],
  // Semiconductor equipment / EDA (builds the AI chips)
  chipTooling: [
    'ASML', 'AMAT', 'LRCX', 'KLAC', 'SNPS', 'CDNS', 'ANSS'
  ],
  // Power / cooling (AI data centers need massive energy)
  powerCooling: [
    'DELL', 'VRT', 'GEV', 'POWL'
  ],
  // Hyperscalers (sell AI compute to everyone)
  hyperscalers: [
    'MSFT', 'GOOG', 'GOOGL', 'AMZN', 'META', 'ORCL'
  ],
  // AI-native platforms (product IS AI)
  aiNativePlatform: [
    'PLTR', 'AI', 'PATH', 'IOT'
  ]
};

// ═══════════════════════════════════════════════
// BUILT FOR HUMANS — AI replaces the human user
// Products designed for human workflows that AI can automate
// ═══════════════════════════════════════════════

const BUILT_FOR_HUMANS = {
  // Design / creative tools (AI generates designs, mockups, prototypes)
  designCreative: [
    'FROG',  // Figma (if public), currently private
    // Adobe has AI moat via Firefly, but core Photoshop/Illustrator usage is human-facing
  ],
  // Project management / collaboration (AI agents don't need Jira)
  projectManagement: [
    'MNDY', 'ASAN', 'SMAR', 'TEAM',  // Monday, Asana, Smartsheet, Atlassian
    'FIVN'                              // Five9 — call center (AI replaces agents)
  ],
  // Document / e-signature (AI generates and processes docs automatically)
  documentTools: [
    'DOCU', 'BOX', 'DBX'  // DocuSign, Box, Dropbox
  ],
  // HR / recruiting (AI handles screening, scheduling, reviews)
  hrRecruiting: [
    'PCTY', 'PAYC',  // Paylocity, Paycom
    'ZI'              // ZoomInfo — AI replaces data enrichment
  ],
  // Basic analytics / BI (AI does the analysis directly)
  basicAnalytics: [
    'PLAN', 'ALRM'  // Anaplan, Alarm.com
  ],
  // Communication / meetings (AI summarizes, attends, takes action)
  communication: [
    'ZM', 'RNG', 'TWLO'  // Zoom, RingCentral, Twilio
  ],
  // Customer support / ticketing (AI chatbots replace human agents)
  customerSupport: [
    'FIVN', 'NCNO'  // Five9, nCino
  ],
  // Legacy CRM / ERP that AI commoditizes
  legacySaas: [
    'BILL', 'HUBS'  // Bill.com, HubSpot (mid-market CRM)
  ]
};

// ═══════════════════════════════════════════════
// MIXED — has AI exposure both ways, or strong data moats
// Not clearly on either axis
// ═══════════════════════════════════════════════

const AI_MIXED = {
  // Strong proprietary data moats (hard for AI to replicate)
  dataMoats: [
    'VEEV', 'NOW', 'INTU', 'TTD', 'UBER', 'ABNB'
  ],
  // Cybersecurity (AI helps attackers AND defenders — net neutral to positive)
  cybersecurity: [
    'CRWD', 'ZS', 'S', 'PANW', 'OKTA', 'QLYS', 'TENB'
  ],
  // Data infrastructure (serves both AI and human workloads)
  dataInfra: [
    'SNOW', 'DDOG', 'MDB', 'ESTC', 'CFLT', 'GTLB'
  ],
  // Companies with AI pivot potential (legacy but investing heavily)
  aiPivot: [
    'CRM', 'ADBE', 'AAPL'  // Salesforce Agentforce, Adobe Firefly, Apple Intelligence
  ]
};

// Build lookup maps
const BUILT_FOR_AI_SET = new Set(Object.values(BUILT_FOR_AI).flat());
const BUILT_FOR_HUMANS_SET = new Set(Object.values(BUILT_FOR_HUMANS).flat());
const AI_MIXED_SET = new Set(Object.values(AI_MIXED).flat());

// Keywords: product serves AI/machine customers
const AI_CUSTOMER_KEYWORDS = [
  'gpu', 'data center', 'cloud infrastructure', 'ai accelerator',
  'high-bandwidth memory', 'hbm', 'inference', 'training cluster',
  'ai compute', 'semiconductor', 'chip', 'networking equipment',
  'fiber optic', 'power management', 'cooling solution',
  'machine learning platform', 'ai-native', 'large language model'
];

// Keywords: product serves human end-users doing manual work
const HUMAN_CUSTOMER_KEYWORDS = [
  'workflow automation', 'project management', 'collaboration tool',
  'document management', 'reporting tool', 'help desk', 'ticketing',
  'survey', 'form builder', 'email marketing', 'scheduling',
  'time tracking', 'expense management', 'invoice', 'e-signature',
  'design tool', 'prototyping', 'wireframe', 'whiteboard',
  'video conferencing', 'meeting', 'call center', 'contact center',
  'customer relationship', 'human resources', 'recruiting', 'hiring',
  'note-taking', 'knowledge base', 'wiki', 'file sharing',
  'presentation', 'spreadsheet', 'no-code', 'low-code'
];

/**
 * Assess AI moat using the two-axis model.
 * @param {string} ticker
 * @param {string} description - Company business description
 * @param {string} industry - Company industry
 * @returns {{risk: 'high'|'medium'|'low', flags: string[], category: string, axis: string}}
 *   risk='high' means DANGEROUS to short (built for AI, or strong moat)
 *   risk='low' means SAFE to short (built for humans, AI-disruptable)
 *   axis='built-for-ai' | 'built-for-humans' | 'mixed' | 'unknown'
 */
function assessAiMoat(ticker, description = '', industry = '') {
  const flags = [];
  let score = 0; // higher = stronger AI moat = more dangerous to short
  let axis = 'unknown';
  const descLower = (description || '').toLowerCase();
  const indLower = (industry || '').toLowerCase();

  // === Check curated lists ===

  if (BUILT_FOR_AI_SET.has(ticker)) {
    const categories = [];
    for (const [cat, tickers] of Object.entries(BUILT_FOR_AI)) {
      if (tickers.includes(ticker)) categories.push(cat);
    }
    flags.push(`BUILT FOR AI: ${categories.join(', ')} — more AI usage = stronger`);
    score += 45;
    axis = 'built-for-ai';
  }

  if (BUILT_FOR_HUMANS_SET.has(ticker)) {
    const categories = [];
    for (const [cat, tickers] of Object.entries(BUILT_FOR_HUMANS)) {
      if (tickers.includes(ticker)) categories.push(cat);
    }
    flags.push(`BUILT FOR HUMANS: ${categories.join(', ')} — AI replaces human users`);
    score -= 20;
    axis = 'built-for-humans';
  }

  if (AI_MIXED_SET.has(ticker)) {
    const categories = [];
    for (const [cat, tickers] of Object.entries(AI_MIXED)) {
      if (tickers.includes(ticker)) categories.push(cat);
    }
    flags.push(`MIXED AI exposure: ${categories.join(', ')}`);
    score += 15;
    if (axis === 'unknown') axis = 'mixed';
  }

  // === Keyword analysis on business description ===

  const aiCustomerHits = AI_CUSTOMER_KEYWORDS.filter(kw => descLower.includes(kw));
  const humanCustomerHits = HUMAN_CUSTOMER_KEYWORDS.filter(kw => descLower.includes(kw));

  if (aiCustomerHits.length >= 3) {
    flags.push(`AI-customer keywords (${aiCustomerHits.length}): ${aiCustomerHits.slice(0, 4).join(', ')}`);
    score += 20;
    if (axis === 'unknown') axis = 'built-for-ai';
  } else if (aiCustomerHits.length >= 1) {
    flags.push(`Some AI-customer signals: ${aiCustomerHits.join(', ')}`);
    score += 8;
  }

  if (humanCustomerHits.length >= 3) {
    flags.push(`Human-workflow keywords (${humanCustomerHits.length}): ${humanCustomerHits.slice(0, 4).join(', ')}`);
    score -= 18;
    if (axis === 'unknown') axis = 'built-for-humans';
  } else if (humanCustomerHits.length >= 1) {
    flags.push(`Some human-workflow signals: ${humanCustomerHits.join(', ')}`);
    score -= 8;
  }

  // === Industry signals ===

  if (/semiconductor|chip/i.test(indLower)) {
    flags.push('Semiconductor industry — AI infrastructure');
    score += 15;
    if (axis === 'unknown') axis = 'built-for-ai';
  }
  if (/communication.*equipment|network/i.test(indLower)) {
    flags.push('Networking — AI data center buildout beneficiary');
    score += 10;
    if (axis === 'unknown') axis = 'built-for-ai';
  }
  if (/software.*infrastructure|cloud.*platform/i.test(indLower)) {
    flags.push('Infrastructure software — serves both AI and human workloads');
    score += 5;
  }
  if (/cybersecurity|security/i.test(indLower)) {
    flags.push('Cybersecurity — AI helps both attack and defense');
    score += 5;
  }
  if (/application.*software|software.*application/i.test(indLower) && !BUILT_FOR_AI_SET.has(ticker) && !AI_MIXED_SET.has(ticker)) {
    flags.push('Application software — human-facing, AI-disruptable');
    score -= 8;
    if (axis === 'unknown') axis = 'built-for-humans';
  }

  // === Determine risk level ===

  let risk;
  if (score >= 30) {
    risk = 'high'; // Dangerous to short
  } else if (score >= 10) {
    risk = 'medium';
  } else {
    risk = 'low'; // Safe to short (AI-vulnerable)
  }

  // Category label
  let category;
  if (axis === 'built-for-ai') {
    category = 'Built for AI — DO NOT SHORT';
  } else if (axis === 'built-for-humans') {
    category = 'Built for humans — AI disruption target';
  } else if (axis === 'mixed') {
    category = 'Mixed AI exposure — short with caution';
  } else {
    category = risk === 'high' ? 'AI-protected' : risk === 'low' ? 'Likely AI-vulnerable' : 'Unclear AI exposure';
  }

  return { risk, flags, score, category, axis };
}

module.exports = {
  assessAiMoat,
  BUILT_FOR_AI, BUILT_FOR_HUMANS, AI_MIXED,
  BUILT_FOR_AI_SET, BUILT_FOR_HUMANS_SET, AI_MIXED_SET
};
