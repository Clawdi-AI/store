# Tools & Runtime Reference

## CLI Tools Required

| Tool | Purpose | Install |
|------|---------|---------|
| `onchainos` | OKX wallet, DEX swap, DeFi, market data | Auto-installed via preflight in AGENTS.md |
| `opentrade` | 6551 market data, token research, DEX quotes | Auto-installed via preflight in AGENTS.md |
| `curl` | 6551 news, Twitter, CEX trading API calls | Pre-installed on most systems |

## Credentials

| Variable | Source | Stored in |
|----------|--------|-----------|
| OKX session (JWT) | `onchainos wallet login` flow | OS keyring (auto-managed) |
| `OPEN_TOKEN` | https://6551.io/mcp | USER.md |

## OKX Skills — Command Reference

### okx-agentic-wallet
```bash
onchainos wallet status                          # Check login state
onchainos wallet login <email>                   # Start OTP login
onchainos wallet verify <otp>                    # Complete login
onchainos wallet addresses [--chain <chainId>]   # List wallet addresses
onchainos wallet balance [--chain <chainId>]     # Token balances
onchainos wallet send --amt <min_units> --receipt <addr> --chain <chainId>
onchainos wallet history                         # Transaction history
onchainos wallet logout                          # Clear session
```

### okx-dex-swap
```bash
onchainos swap quote --from <addr> --to <addr> --amount <min_units> --chain <chain>
onchainos swap execute --from <addr> --to <addr> --amount <min_units> --chain <chain> --wallet <addr>
onchainos swap chains                            # Supported chains
```

### okx-dex-market
```bash
onchainos market price --address <addr>
onchainos market prices --tokens <chainIndex:addr,...>
onchainos market kline --address <addr> [--bar 1m|5m|1H|1D]
onchainos market portfolio-overview --address <addr> --chain <chain>
```

### okx-security
```bash
onchainos security token-scan --tokens "<chainId>:<addr>"   # e.g. "8453:0x833589..."
onchainos security tx-scan --from <addr> --to <addr> --chain <chain>
onchainos security approvals --address <addr> --chain <chain>
```

### okx-onchain-gateway
```bash
onchainos gateway gas --chain <chain>
onchainos gateway simulate --from <addr> --to <addr> --data <hex> --chain <chain>
onchainos gateway broadcast --signed-tx <hex> --address <addr> --chain <chain>
```

### okx-dex-token
```bash
onchainos token search --query <query>
onchainos token info --address <addr> --chain <chain>
```

### okx-dex-signal
```bash
onchainos signal list --chain <chain> --wallet-type 1  # 1=Smart Money, 2=KOL, 3=Whale
```

### okx-dex-trenches (Meme tokens)
```bash
onchainos memepump tokens <chain> --stage NEW|MIGRATING|MIGRATED
onchainos memepump token-details <addr> --chain <chain>
```

### okx-defi-invest
```bash
onchainos defi list [--chain <chain>]
onchainos defi invest --platform <id> --amount <amount> --chain <chain>
onchainos defi withdraw --position <id>
onchainos defi positions --address <addr>
```

### okx-wallet-portfolio
```bash
onchainos portfolio total-value --address <addr> --chains <chains>
onchainos portfolio all-balances --address <addr> --chains <chains>
```

### okx-x402-payment
```bash
onchainos payment x402-pay --network eip155:<chainId> --amount <min_units> --pay-to <addr> --asset <token_addr>
```

---

## 6551 Skills — Command Reference

**Direct 6551 skills** use `https://ai.6551.io` with `Authorization: Bearer $OPEN_TOKEN`.
**Proxied skills** (opentwitter, opennews) use `https://api.clawdi.ai/proxy/*` with `Authorization: Bearer $CLAWDI_PROXY_TOKEN`.

### opentwitter (Twitter/X data) — via Clawdi proxy
```bash
# Base URL: https://api.clawdi.ai/proxy/opentwitter
# Auth: Authorization: Bearer $CLAWDI_PROXY_TOKEN

# Get user tweets
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_user_tweets" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" -H "Content-Type: application/json" \
  -d '{"username": "VitalikButerin", "maxResults": 10}'

# Search tweets
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" -H "Content-Type: application/json" \
  -d '{"keywords": "bitcoin", "minLikes": 100, "product": "Top", "maxResults": 20}'

# Get KOL followers
curl -s -X POST "https://api.clawdi.ai/proxy/opentwitter/twitter_kol_followers" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" -H "Content-Type: application/json" \
  -d '{"username": "elonmusk"}'

# All operations (all POST with JSON body):
#   twitter_user_info, twitter_user_by_id, twitter_user_tweets,
#   twitter_search, twitter_follower_events, twitter_deleted_tweets,
#   twitter_kol_followers, twitter_article_by_id, twitter_tweet_by_id,
#   twitter_quote_tweets_by_id, twitter_retweet_users_by_id
# Note: twitter_watch* excluded (shared upstream token)
```

### opennews (Crypto news + AI signals) — via Clawdi proxy
```bash
# Base URL: https://api.clawdi.ai/proxy/opennews
# Auth: Authorization: Bearer $CLAWDI_PROXY_TOKEN

# Search crypto news
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" -H "Content-Type: application/json" \
  -d '{"limit": 20, "page": 1, "coins": ["BTC", "ETH"]}'

# High-impact news only (aiRating.score >= 80)
curl -s -X POST "https://api.clawdi.ai/proxy/opennews/news_search" \
  -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" -H "Content-Type: application/json" \
  -d '{"limit": 10, "page": 1, "q": "bitcoin ETF"}'

# Get news sources tree
curl -s -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  "https://api.clawdi.ai/proxy/opennews/news_type"

# Free endpoints (still need proxy auth)
curl -s -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  "https://api.clawdi.ai/proxy/opennews/free_categories"
curl -s -H "Authorization: Bearer $CLAWDI_PROXY_TOKEN" \
  "https://api.clawdi.ai/proxy/opennews/free_hot?category=macro"
```

### opentrade-market (Market data, signals, meme)
```bash
opentrade market price <address> [--chain <chainIndex>]
opentrade market prices <chainIndex:address,...>
opentrade market kline <address> [--bar 1m|1H|1D] [--chain <chainIndex>]
opentrade market signal-list <chain> [--wallet-type 1|2|3]
opentrade market memepump-tokens <chain> --stage NEW|MIGRATING|MIGRATED
opentrade market memepump-token-details <address> [--chain <chain>]
```

### opentrade-token (Token research)
```bash
opentrade token search <query> [--chains "1,501"]
opentrade token price-info <address> [--chain <chainIndex>]
opentrade token toplist [--sort-by 2|5|6] [--time-frame 1|2|3|4]
opentrade token holders <address> [--chain <chainIndex>]
```

### opentrade-portfolio (Wallet balance)
```bash
opentrade portfolio total-value --address <addr> --chains <chains>
opentrade portfolio all-balances --address <addr> --chains <chains>
opentrade portfolio token-balances --address <addr> --tokens "chainIndex:address,..."
```

### opentrade-gateway (Gas, simulate, broadcast)
```bash
opentrade gateway gas --chain <chainIndex>
opentrade gateway simulate --from <addr> --to <addr> --chain <chainIndex>
opentrade gateway broadcast --signed-tx <hex_or_base58> --address <addr> --chain <chainIndex>
```

### opentrade-newsliquid (CEX trading)
```bash
# Base URL: https://ai.6551.io (with OPEN_TOKEN)
# Get config: GET /config
# Place order: POST /orders
# Close position: POST /positions/close
# Supported exchanges: Binance, Bybit, OKX, Hyperliquid, Aster
```

### opentrade-wallet (6551 custodial wallet — BSC + Solana only)
```bash
# Create wallet
curl -s -X POST "https://ai.6551.io/trader/custodial/create" \
  -H "Authorization: Bearer $OPEN_TOKEN" -H "Content-Type: application/json" -d '{}'

# Swap (BSC/Solana only)
curl -s -X POST "https://ai.6551.io/trader/custodial/swap" \
  -H "Authorization: Bearer $OPEN_TOKEN" -H "Content-Type: application/json" \
  -d '{"chainIndex": "56", "fromTokenAddress": "...", "toTokenAddress": "...", "amount": "..."}'
```

---

## Chain Reference

| Chain | chainIndex | Native Token |
|-------|-----------|-------------|
| Ethereum | 1 | ETH |
| Base | 8453 | ETH |
| BSC | 56 | BNB |
| Arbitrum | 42161 | ETH |
| Solana | 501 | SOL |
| XLayer | 196 | OKB |

**Native token addresses for DEX:**
- EVM: `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`
- Solana swap: `11111111111111111111111111111111`
- Solana K-line: `So11111111111111111111111111111111111111112` (wSOL)

## Amount Format
- All swap/send amounts are in minimal units: `amount × 10^decimals`
- Portfolio balance output is in UI units — convert before using in swaps
- CEX trading uses standard units (e.g. `0.1` BTC, not wei)
