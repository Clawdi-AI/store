# Crypto Trader

> Full-stack crypto trading agent powered by **OKX TEE wallet** — DEX swaps with automatic security scan, DeFi yield, on-chain signals, KOL monitoring, and CEX trading across 20+ chains.

**Prerequisite:** An email address is all you need to get started. The agent sets up your wallet on first launch via a one-time email verification code.

---

## ⛓️ Supported Chains

| Chain | Native Token | DEX Swap | DeFi | Portfolio |
|-------|-------------|----------|------|-----------|
| Ethereum | ETH | ✅ | ✅ | ✅ |
| Base | ETH | ✅ | ✅ | ✅ |
| BSC | BNB | ✅ | — | ✅ |
| Arbitrum | ETH | ✅ | ✅ | ✅ |
| Solana | SOL | ✅ | — | ✅ |
| XLayer | OKB | ✅ | — | ✅ |
| Polygon, Optimism, Avalanche, and 13+ more | — | ✅ | — | ✅ |

---

## 🧠 Core Capabilities

| Skill | What it does |
|-------|-------------|
| **okx-agentic-wallet** ⭐ | Email OTP login · TEE-secured wallet · send tokens · transaction history |
| **okx-dex-swap** | DEX token swaps with quote preview, price impact warning, and security scan |
| **okx-security** | Automatic token risk scan before every swap — detects rug pulls, honeypots, malicious contracts |
| **okx-dex-market** | Real-time token prices, K-line charts, wallet PnL |
| **okx-dex-token** | Token research: metadata, holder distribution, trending rankings |
| **okx-dex-signal** | On-chain signals from smart money, whales, and KOLs |
| **okx-dex-trenches** | Meme token scanner — pump.fun / new launches with rug pull and bundle detection |
| **okx-defi-invest** | DeFi deposit and withdrawal across supported yield protocols |
| **okx-defi-portfolio** | DeFi position overview across all protocols |
| **okx-wallet-portfolio** | Multi-chain portfolio total value and all token balances |
| **okx-onchain-gateway** | Gas fee lookup, transaction simulation, raw tx broadcast |
| **okx-audit-log** | Full audit trail of all agent actions |
| **okx-x402-payment** | x402 HTTP micropayments |
| **opentwitter** | Twitter/X KOL tweet monitoring and real-time crypto event tracking |
| **opennews** | Crypto news with AI-generated market impact ratings and trading signals |
| **opentrade-newsliquid** | CEX spot & futures trading — Binance, Bybit, OKX, Hyperliquid |

---

## 🔐 Wallet Setup — How It Works

No seed phrase. No browser extension. No manual configuration.

On your first message, the agent will:

1. Ask for your email address
2. Send a one-time verification code to your inbox
3. Complete login — your wallet is created inside OKX's TEE (Trusted Execution Environment)
4. Show you your wallet addresses (EVM address for all EVM chains + Solana address)

Your private key never leaves the TEE. You authenticate with email OTP — no passwords, no seed phrases to back up.

---

## 🔄 DEX Swap — What You Get

Every swap goes through a 4-step flow before any transaction is signed:

```
1. Quote  →  2. Security scan  →  3. Preview  →  4. Your confirmation  →  Execute
```

**Example swap preview:**
```
Swap Preview
────────────────────────────────
Sell:   100 USDC  (Base)
Buy:    ~0.0341 ETH
Rate:   1 ETH = 2,932.45 USDC

Price impact:   0.08%  ✅
Gas estimate:   ~$0.12
Slippage:       0.5%

Security scan:  ✅ No risks detected

Type "confirm" to execute, or ask to adjust.
```

The agent **never executes a swap without your explicit confirmation.**

---

## 🛡️ Security Scan — Before Every Trade

Before buying any token, the agent automatically runs a risk scan:

- **Safe** — proceeds to show you the swap preview
- **Warning** — shows risk details, asks if you want to continue
- **Block** — refuses to execute, explains the threat (no bypass offered)

You can disable the security scan if you choose to — the agent will warn you first and ask for confirmation. When disabled, every swap shows a ⚠️ reminder.

---

## 🌾 DeFi — Deposit & Earn

Deposit idle assets into yield protocols and withdraw at any time. Ask the agent "show me available yield options" to see current protocols and APYs based on your holdings.

The agent checks for token approvals before depositing and handles the approve step if needed.

---

## 📊 Market Intelligence

**Token prices & charts**
- Spot price for any token by address
- K-line data (1m / 5m / 1H / 1D)
- Real-time gas fees per chain

**Token research**
- Search by name or contract address
- Holder distribution and concentration
- Trending token rankings

**On-chain signals**
- Smart money wallet activity
- Whale movement tracking
- KOL on-chain positions

**Meme token scanner**
- New launches (pump.fun and equivalent platforms)
- Rug pull detection
- Bundle wallet detection

---

## 📰 Social & News Intelligence

**Twitter/X KOL monitoring**
- Fetch tweets from any crypto KOL by username
- Search tweets by keyword with engagement filters
- Track follower events and deleted tweets
- Monitor real-time mentions of any token or event

**AI-rated crypto news**
- Search news by coin, keyword, or topic
- Each article includes an AI-generated impact score (0–100)
- Filter for high-impact news only (score ≥ 80)
- Signals translated to trading context (bullish / bearish / neutral)

---

## 📈 CEX Trading

Connect your Binance, Bybit, OKX, or Hyperliquid account to place spot and futures orders:

- Spot and futures orders (market / limit)
- Position close
- Order status tracking

Exchange API credentials are stored in the runtime user profile for the installed workspace — the agent guides you through setup on first use. Do not commit populated runtime profiles to a public fork.

---

## 💼 Portfolio Tracking

- **Total value** across all chains in a single query
- **All token balances** broken down by chain and token
- **DeFi positions** — what you've deposited, current value, yield earned
- Works for your own wallet or any public address

---

## 🔧 Platform Capabilities Required

The following platform-level features are not yet implemented in ClawDI. Implementing them will improve this agent's reliability and output quality.

| Capability | What it does |
|------------|-------------|
| **Skill scanning mandate** | Forces the agent to fully load SKILL.md and reference files before every reply |
| **Workspace file auto-load** | Automatically injects AGENTS.md, USER.md, TOOLS.md into session context at startup |
| **Runtime metadata injection** | Provides current datetime, model name, and channel type to the agent each session |
| **Reply formatting rules** | Injects output structure directives for consistent table and section formatting |
| **Safety rules** | Injects human-oversight constraints at the platform level |

---

## 📁 Directory Structure

```
crypto-agent/
├── agent.json          # Agent config (22 skills)
├── AGENTS.md           # Agent instructions: onboarding, routing, swap flow, error handling
├── SOUL.md             # Behavioral philosophy
├── IDENTITY.md         # Agent name and personality
├── USER.md             # Wallet addresses, preferences, security settings (filled at runtime)
├── TOOLS.md            # CLI command reference for all skills
├── HEARTBEAT.md        # Periodic task config (placeholder)
└── skills/             # 22 skill directories (OKX + market intelligence + social)
    ├── okx-agentic-wallet/
    ├── okx-dex-swap/
    ├── okx-security/
    ├── okx-dex-market/
    ├── okx-dex-token/
    ├── okx-dex-signal/
    ├── okx-dex-trenches/
    ├── okx-defi-invest/
    ├── okx-defi-portfolio/
    ├── okx-wallet-portfolio/
    ├── okx-onchain-gateway/
    ├── okx-audit-log/
    ├── okx-x402-payment/
    ├── opentwitter/
    ├── opennews/
    ├── opentrade-newsliquid/
    ├── opentrade-market/
    ├── opentrade-token/
    ├── opentrade-portfolio/
    ├── opentrade-gateway/
    ├── opentrade-dex-swap/
    └── opentrade-wallet/
```

---

## Disclaimer

This agent is a tool, not a financial advisor. All trading decisions are yours. Crypto markets are volatile — only trade what you can afford to lose.

Keep API keys, exchange secrets, passphrases, wallet data, and populated USER.md files private. Use least-privilege API permissions and review every transaction preview before confirmation.
