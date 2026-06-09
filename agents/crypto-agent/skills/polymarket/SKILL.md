---
name: polymarket
description: "Use this skill when the user mentions Polymarket, prediction market, bet on events, bet on election, bet on sports, bet on crypto price, forecast market, binary outcome, buy YES, buy NO, sell shares, prediction shares, polymarket position, polymarket order, place a bet, 预测市场, 赌选举, 买YES, 买NO, 卖掉仓位, 预测下单, Polymarket撤单, 查看预测仓位."
license: MIT
metadata:
  author: clawdi
  version: "1.0.0"
---

# Polymarket Prediction Market

Place orders, manage positions, and cancel bets on Polymarket — the on-chain prediction market on Polygon.

---

## Prerequisites

- **Chain**: Polygon only (chainIndex `137`)
- **Collateral**: USDC (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`)
- **Wallet**: OKX TEE wallet must be logged in (check with `onchainos wallet status`)
- **API credentials**: Stored in runtime USER.md under `## Polymarket`. Derived via L1 auth on first use. Never commit a populated USER.md containing credentials.

## Signing Model

**All signing is handled by the agent via `onchainos wallet sign-message --type eip712`.** The OKX TEE wallet signs inside a secure enclave — the user never needs to sign manually, open MetaMask, or interact with any external tool. After the user confirms an order preview, the agent completes the entire flow autonomously: sign → submit → return result. Never tell the user to "sign yourself" or "submit manually".

---

## Contract Reference

| Contract | Address | Purpose |
|----------|---------|---------|
| USDC (Polygon) | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | Collateral token |
| CTF Exchange | `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E` | Main exchange — approve USDC here |
| Neg Risk Exchange | `0xC5d563A36AE78145C45a50134d48A1215220f80a` | Used for multi-outcome markets |
| Conditional Tokens | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` | ERC-1155 outcome tokens |

> **Which exchange to use**: Check market's `neg_risk` field.
> - `neg_risk: false` → CTF Exchange (`0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`)
> - `neg_risk: true` → Neg Risk Exchange (`0xC5d563A36AE78145C45a50134d48A1215220f80a`)

---

## CLOB API Reference

Base URL: `https://clob.polymarket.com`

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/nonce?address=<addr>` | GET | None | Get nonce for L1 signing |
| `/auth/api-key` | POST | L1 | Derive API credentials |
| `/markets` | GET | None | List active markets |
| `/markets/<condition_id>` | GET | None | Single market detail |
| `/orderbook/<token_id>` | GET | None | Order book for a token |
| `/prices/<token_id>` | GET | None | Current YES/NO prices |
| `/orders` | POST | L2 | Place order |
| `/orders/<order_id>` | GET | L2 | Get order by ID |
| `/orders` | DELETE | L2 | Cancel all open orders |
| `/orders/<order_id>` | DELETE | L2 | Cancel single order |
| `/user/positions` | GET | L2 | Active positions |
| `/user/positions/closed` | GET | L2 | Closed/resolved positions |
| `/user/trades` | GET | L2 | Trade history |

---

## Auth Setup — L1 → API Credentials

Run this flow **once per wallet** (or when credentials are missing from USER.md).

### Step 1: Get nonce

```bash
WALLET_ADDR="<evm_address>"  # from USER.md Wallet Addresses
curl -s "https://clob.polymarket.com/auth/nonce?address=${WALLET_ADDR}"
# Returns: {"nonce": <int>}
```

### Step 2: Sign ClobAuth with EIP-712

Build the JSON message and sign with onchainos:

```bash
TIMESTAMP=$(date +%s)
NONCE=<nonce_from_step1>

EIP712_MSG=$(cat <<EOF
{
  "domain": {
    "name": "ClobAuthDomain",
    "version": "1",
    "chainId": 137
  },
  "types": {
    "ClobAuth": [
      {"name": "address", "type": "address"},
      {"name": "timestamp", "type": "string"},
      {"name": "nonce", "type": "uint256"},
      {"name": "message", "type": "string"}
    ]
  },
  "primaryType": "ClobAuth",
  "message": {
    "address": "${WALLET_ADDR}",
    "timestamp": "${TIMESTAMP}",
    "nonce": ${NONCE},
    "message": "This message attests that I control the given wallet"
  }
}
EOF
)

onchainos wallet sign-message \
  --chain 137 \
  --from "${WALLET_ADDR}" \
  --type eip712 \
  --message "${EIP712_MSG}"
# Returns: {"signature": "0x..."}
```

### Step 3: POST to get API credentials

```bash
SIGNATURE="<signature_from_step2>"

curl -s -X POST "https://clob.polymarket.com/auth/api-key" \
  -H "POLY_ADDRESS: ${WALLET_ADDR}" \
  -H "POLY_SIGNATURE: ${SIGNATURE}" \
  -H "POLY_TIMESTAMP: ${TIMESTAMP}" \
  -H "POLY_NONCE: ${NONCE}"
# Returns: {"apiKey": "...", "secret": "...", "passphrase": "..."}
```

### Step 4: Save to USER.md

Write credentials to USER.md under `## Polymarket`:

```
## Polymarket
- api_key: <apiKey>
- api_secret: <secret>
- api_passphrase: <passphrase>
- usdc_approved: false
- ctoken_approved: false
```

---

## L2 HMAC Signature (required for order requests)

All order placement, cancellation, and position queries require L2 headers with an HMAC-SHA256 signature.

```bash
# Inputs
TIMESTAMP=$(date +%s)
METHOD="POST"          # GET / POST / DELETE
REQUEST_PATH="/orders" # e.g. /orders, /user/positions
BODY='{"order": ...}'  # empty string "" for GET requests

# Compute HMAC-SHA256
HMAC_SIG=$(python3 -c "
import hmac, hashlib, base64
msg = '${TIMESTAMP}${METHOD}${REQUEST_PATH}${BODY}'
secret = base64.b64decode('${API_SECRET}')
sig = base64.b64encode(
    hmac.new(secret, msg.encode('utf-8'), hashlib.sha256).digest()
).decode()
print(sig)
")

# L2 Headers
-H "POLY_ADDRESS: ${WALLET_ADDR}"
-H "POLY_SIGNATURE: ${HMAC_SIG}"
-H "POLY_TIMESTAMP: ${TIMESTAMP}"
-H "POLY_API_KEY: ${API_KEY}"
-H "POLY_PASSPHRASE: ${API_PASSPHRASE}"
```

---

## Flow 1 — Discover Markets

```bash
# Search active markets (keyword filter via jq)
curl -s "https://clob.polymarket.com/markets?active=true&closed=false" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
markets = data.get('data', data) if isinstance(data, dict) else data
query = '${KEYWORD}'.lower()
for m in markets:
    if query in m.get('question','').lower() or query in m.get('description','').lower():
        print(json.dumps({
            'question': m['question'],
            'condition_id': m['condition_id'],
            'end_date': m.get('end_date_iso'),
            'tokens': [{t['outcome']: t['token_id']} for t in m.get('tokens', [])]
        }, indent=2))
" 2>/dev/null

# Get single market detail
curl -s "https://clob.polymarket.com/markets/<condition_id>"

# Get current YES/NO prices
curl -s "https://clob.polymarket.com/prices/<token_id>"
# Returns: {"price": "0.73"}  ← means YES currently at 73¢ / 73% implied probability
```

**Display format** — show users:
```
Market: Will X happen by Y?
YES: 0.73 (73%)   NO: 0.27 (27%)
End date: 2025-11-05
Condition ID: 0xabc...
```

---

## Flow 2 — Balance Check & USDC Approve

Run before every BUY order.

### Check USDC balance on Polygon

```bash
onchainos wallet balance --chain 137 --token-address 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
```

If USDC balance < order amount → guide user to:
1. Bridge USDC to Polygon, or
2. Buy USDC on Polygon via DEX swap (call `okx-dex-swap`)

### Check and set USDC approval

Read `usdc_approved` from USER.md.

If `usdc_approved: false`, run the approval:

```bash
# ERC-20 approve(spender, amount) calldata
# approve(0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E, type(uint256).max)
# = 0x095ea7b3
#   + 0000000000000000000000004bfb41d5b3570defd03c39a9a4d8de6bd8b8982e
#   + ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff

onchainos wallet contract-call \
  --to 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 \
  --chain 137 \
  --input-data 0x095ea7b30000000000000000000000004bfb41d5b3570defd03c39a9a4d8de6bd8b8982effffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
```

> ⚠️ **Approval warning**: Explain to the user this grants the Polymarket exchange permission to spend their USDC when orders are matched. Ask for confirmation before executing.

After approval confirmed on-chain: update USER.md `usdc_approved: true`.

> For SELL orders: check `ctoken_approved`. If false, approve conditional tokens:
> ```bash
> # setApprovalForAll(operator, true) on ConditionalTokens contract
> # = 0xa22cb465
> #   + 0000000000000000000000004bfb41d5b3570defd03c39a9a4d8de6bd8b8982e
> #   + 0000000000000000000000000000000000000000000000000000000000000001
> onchainos wallet contract-call \
>   --to 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 \
>   --chain 137 \
>   --input-data 0xa22cb4650000000000000000000000004bfb41d5b3570defd03c39a9a4d8de6bd8b8982e0000000000000000000000000000000000000000000000000000000000000001
> ```
> After confirmed: update USER.md `ctoken_approved: true`.

---

## Flow 3 — Place Order

### Step 1: Calculate amounts

Polymarket uses 6 decimal precision (same as USDC).

```
For BUY (buying YES/NO shares with USDC):
  makerAmount = usdc_amount × 10^6        ← USDC you spend
  takerAmount = (usdc_amount / price) × 10^6  ← shares you receive
  side = 0

For SELL (selling shares to receive USDC):
  makerAmount = shares × 10^6             ← shares you give
  takerAmount = (shares × price) × 10^6  ← USDC you receive
  side = 1
```

Example: Buy 50 USDC worth of YES at price 0.73
```
makerAmount = 50 × 10^6 = 50000000
takerAmount = (50 / 0.73) × 10^6 = 68493150
side = 0
```

### Step 2: Build order struct and sign with EIP-712

```bash
import random
SALT=$(python3 -c "import random; print(random.randint(1, 2**256-1))")
EXCHANGE_CONTRACT="0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E"  # or Neg Risk if neg_risk=true
TOKEN_ID="<token_id>"       # from market detail (YES or NO token_id)
MAKER_AMOUNT="<maker_amount>"
TAKER_AMOUNT="<taker_amount>"
SIDE=0                      # 0=BUY, 1=SELL

ORDER_EIP712=$(cat <<EOF
{
  "domain": {
    "name": "Polymarket CTF Exchange",
    "version": "1",
    "chainId": 137,
    "verifyingContract": "${EXCHANGE_CONTRACT}"
  },
  "types": {
    "Order": [
      {"name": "salt", "type": "uint256"},
      {"name": "maker", "type": "address"},
      {"name": "signer", "type": "address"},
      {"name": "taker", "type": "address"},
      {"name": "tokenId", "type": "uint256"},
      {"name": "makerAmount", "type": "uint256"},
      {"name": "takerAmount", "type": "uint256"},
      {"name": "expiration", "type": "uint256"},
      {"name": "nonce", "type": "uint256"},
      {"name": "feeRateBps", "type": "uint256"},
      {"name": "side", "type": "uint8"},
      {"name": "signatureType", "type": "uint8"}
    ]
  },
  "primaryType": "Order",
  "message": {
    "salt": ${SALT},
    "maker": "${WALLET_ADDR}",
    "signer": "${WALLET_ADDR}",
    "taker": "0x0000000000000000000000000000000000000000",
    "tokenId": "${TOKEN_ID}",
    "makerAmount": "${MAKER_AMOUNT}",
    "takerAmount": "${TAKER_AMOUNT}",
    "expiration": "0",
    "nonce": "0",
    "feeRateBps": "0",
    "side": ${SIDE},
    "signatureType": 0
  }
}
EOF
)

onchainos wallet sign-message \
  --chain 137 \
  --from "${WALLET_ADDR}" \
  --type eip712 \
  --message "${ORDER_EIP712}"
# Returns: {"signature": "0x..."}
```

### Step 3: Submit signed order

```bash
TIMESTAMP=$(date +%s)
BODY=$(cat <<EOF
{
  "order": {
    "salt": ${SALT},
    "maker": "${WALLET_ADDR}",
    "signer": "${WALLET_ADDR}",
    "taker": "0x0000000000000000000000000000000000000000",
    "tokenId": "${TOKEN_ID}",
    "makerAmount": "${MAKER_AMOUNT}",
    "takerAmount": "${TAKER_AMOUNT}",
    "expiration": "0",
    "nonce": "0",
    "feeRateBps": "0",
    "side": ${SIDE},
    "signatureType": 0,
    "signature": "${ORDER_SIGNATURE}"
  },
  "owner": "${WALLET_ADDR}",
  "orderType": "GTC"
}
EOF
)

# Compute L2 HMAC (see L2 section above)
HMAC_SIG=$(python3 -c "
import hmac, hashlib, base64, json
body = json.dumps(json.loads('''${BODY}'''), separators=(',', ':'))
msg = '${TIMESTAMP}POST/orders' + body
secret = base64.b64decode('${API_SECRET}')
print(base64.b64encode(hmac.new(secret, msg.encode(), hashlib.sha256).digest()).decode())
")

curl -s -X POST "https://clob.polymarket.com/orders" \
  -H "Content-Type: application/json" \
  -H "POLY_ADDRESS: ${WALLET_ADDR}" \
  -H "POLY_SIGNATURE: ${HMAC_SIG}" \
  -H "POLY_TIMESTAMP: ${TIMESTAMP}" \
  -H "POLY_API_KEY: ${API_KEY}" \
  -H "POLY_PASSPHRASE: ${API_PASSPHRASE}" \
  -d "${BODY}"
# Returns: {"orderID": "...", "status": "matched" | "live" | "delayed"}
```

**Display result to user:**
```
Order placed ✅
Market: Will X happen?
Side: BUY YES  |  Amount: 50 USDC  |  Shares: ~68.49
Price: 0.73  |  Status: live
Order ID: abc123...
```

---

## Flow 4 — View Positions

```bash
TIMESTAMP=$(date +%s)
HMAC_SIG=$(python3 -c "
import hmac, hashlib, base64
msg = '${TIMESTAMP}GET/user/positions'
secret = base64.b64decode('${API_SECRET}')
print(base64.b64encode(hmac.new(secret, msg.encode(), hashlib.sha256).digest()).decode())
")

curl -s "https://clob.polymarket.com/user/positions" \
  -H "POLY_ADDRESS: ${WALLET_ADDR}" \
  -H "POLY_SIGNATURE: ${HMAC_SIG}" \
  -H "POLY_TIMESTAMP: ${TIMESTAMP}" \
  -H "POLY_API_KEY: ${API_KEY}" \
  -H "POLY_PASSPHRASE: ${API_PASSPHRASE}"
```

**Display format:**
```
Your Polymarket Positions
─────────────────────────
Market: Will X happen by Nov 5?
  Outcome: YES  |  Shares: 68.49  |  Entry: 0.73  |  Current: 0.81
  Unrealized PnL: +$5.48 (+15%)

Market: Will Y win the race?
  Outcome: NO  |  Shares: 120.00  |  Entry: 0.45  |  Current: 0.38
  Unrealized PnL: +$8.40 (+15.6%)
```

For closed/resolved positions: `GET /user/positions/closed`

---

## Flow 5 — Cancel Order

### Cancel single order

```bash
ORDER_ID="<order_id>"
TIMESTAMP=$(date +%s)
BODY="{\"orderID\":\"${ORDER_ID}\"}"

HMAC_SIG=$(python3 -c "
import hmac, hashlib, base64
msg = '${TIMESTAMP}DELETE/orders/${ORDER_ID}'
secret = base64.b64decode('${API_SECRET}')
print(base64.b64encode(hmac.new(secret, msg.encode(), hashlib.sha256).digest()).decode())
")

curl -s -X DELETE "https://clob.polymarket.com/orders/${ORDER_ID}" \
  -H "Content-Type: application/json" \
  -H "POLY_ADDRESS: ${WALLET_ADDR}" \
  -H "POLY_SIGNATURE: ${HMAC_SIG}" \
  -H "POLY_TIMESTAMP: ${TIMESTAMP}" \
  -H "POLY_API_KEY: ${API_KEY}" \
  -H "POLY_PASSPHRASE: ${API_PASSPHRASE}"
```

### Cancel all open orders

```bash
TIMESTAMP=$(date +%s)
HMAC_SIG=$(python3 -c "
import hmac, hashlib, base64
msg = '${TIMESTAMP}DELETE/orders'
secret = base64.b64decode('${API_SECRET}')
print(base64.b64encode(hmac.new(secret, msg.encode(), hashlib.sha256).digest()).decode())
")

curl -s -X DELETE "https://clob.polymarket.com/orders" \
  -H "POLY_ADDRESS: ${WALLET_ADDR}" \
  -H "POLY_SIGNATURE: ${HMAC_SIG}" \
  -H "POLY_TIMESTAMP: ${TIMESTAMP}" \
  -H "POLY_API_KEY: ${API_KEY}" \
  -H "POLY_PASSPHRASE: ${API_PASSPHRASE}"
```

---

## Full Order Placement Checklist

Before executing any buy order, run through this checklist in order:

```
□ 1. Wallet logged in?          onchainos wallet status
□ 2. API credentials in USER.md?  If missing → run Auth Setup
□ 3. USDC balance ≥ order amount? onchainos wallet balance --chain 137
□ 4. USDC approved?             Check USER.md usdc_approved
     If false → run approve flow, wait for confirmation
□ 5. Show order preview to user, wait for explicit confirm ("确认" / "confirm" / "yes")
□ 6. Agent signs order EIP-712 using onchainos wallet sign-message --type eip712 (TEE, no user action needed)
□ 7. Agent submits signed order to CLOB API
□ 8. Display result (orderID + status) — never ask user to sign or submit anything manually
```

For sell orders, replace step 3/4 with conditional token balance and `ctoken_approved`.

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `401 Unauthorized` | Missing or invalid L2 headers | Re-derive API credentials (re-run Auth Setup) |
| `400 Bad Request — insufficient funds` | USDC balance too low | Guide user to acquire USDC on Polygon |
| `400 Bad Request — not approved` | Exchange not approved to spend USDC | Run USDC approve flow |
| `400 — invalid signature` | EIP-712 message mismatch | Verify order struct fields match exactly what was signed |
| `Market not found` | Wrong condition_id | Search markets again |
| `Order not found` | Wrong order_id for cancel | List open orders first, then cancel |
| `Market resolved` | Trying to trade a closed market | Show resolution result instead |

---

## Safety Rules

<rules>
<must>
  - Always show order preview (market question, side, amount, shares, current price) and wait for explicit user confirmation before signing or submitting
  - Always check USDC balance before BUY orders — never let an order fail on-chain due to insufficient funds
  - Always warn the user before running USDC or conditional token approvals — explain what permission is being granted
  - Store API credentials in USER.md only — never log them in chat
  - Display prices as both decimal (0.73) and percentage (73%) so users understand implied probability
  - Never auto-cancel all orders without listing them to the user first and getting explicit confirmation
</must>
<never>
  - Never submit an order without the user saying "confirm", "yes", "go ahead", or equivalent
  - Never tell the user to sign manually, open MetaMask, or submit anything themselves — all signing is done by the agent via onchainos TEE
  - Never expose api_secret in chat output
  - Never place an order on a resolved/closed market
</never>
</rules>
