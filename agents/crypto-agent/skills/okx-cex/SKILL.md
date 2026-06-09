---
name: okx-cex
description: "Use this skill when the user asks to check their OKX exchange balance, place a spot order, cancel an order, view open orders, check positions, view trade history, set leverage, withdraw funds, deposit, transfer between accounts, check withdrawal/deposit history, or any operation on their OKX exchange (CEX) account. Trigger on phrases like 'my OKX balance', 'buy BTC on OKX', 'place a limit order', 'cancel my order', 'check my positions', 'open orders', 'trade history', 'set leverage', 'withdraw to my wallet', 'transfer from exchange', 'deposit address', '我的OKX余额', '挂单', '撤单', '查持仓', '交易记录', '提币', '充值地址', '划转'. Do NOT use for DEX swaps or on-chain operations (use okx-dex-swap or onchainos instead)."
license: MIT
metadata:
  author: clawdi
  version: "1.1.0"
  homepage: "https://www.okx.com/docs-v5/en/"
---

# OKX CEX Account

Direct OKX REST API integration for centralized exchange operations — balance, spot orders, positions, and trade history.

## Pre-flight: Load Credentials

Before any operation, read credentials from USER.md:

Open-source safety note: USER.md is a runtime profile in the installed workspace. Never commit a populated USER.md containing exchange credentials.

```bash
OKX_API_KEY=$(grep "API Key:" USER.md | awk '{print $NF}')
OKX_API_SECRET=$(grep "API Secret:" USER.md | awk '{print $NF}')
OKX_PASSPHRASE=$(grep "API Passphrase:" USER.md | awk '{print $NF}')
```

If any credential is empty, tell the user: "Your OKX exchange account is not connected yet. Please say 'connect my OKX account' to set it up."

## Signing Helper

All OKX API calls require HMAC-SHA256 authentication. Use this Python snippet before each request:

```python
import hmac, hashlib, base64, datetime

def okx_sign(secret, timestamp, method, path, body=""):
    msg = timestamp + method + path + body
    sig = base64.b64encode(
        hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
    ).decode()
    return sig

ts = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")
sign = okx_sign("$OKX_API_SECRET", ts, "GET", "/api/v5/account/balance")
print(f"{ts}|{sign}")
```

Then use the output in curl headers:
```bash
OKX_BASE="https://www.okx.com"
-H "OK-ACCESS-KEY: $OKX_API_KEY"
-H "OK-ACCESS-SIGN: <sign>"
-H "OK-ACCESS-TIMESTAMP: <ts>"
-H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE"
-H "Content-Type: application/json"
```

## Command Index

| # | Operation | Method | Path |
|---|---|---|---|
| 1 | Check trading account balance | GET | `/api/v5/account/balance` |
| 2 | Check funding account balance | GET | `/api/v5/asset/balances` |
| 3 | Place spot order | POST | `/api/v5/trade/order` |
| 4 | Cancel order | DELETE | `/api/v5/trade/order` |
| 5 | View open orders | GET | `/api/v5/trade/orders-pending` |
| 6 | View order history | GET | `/api/v5/trade/orders-history` |
| 7 | Check positions | GET | `/api/v5/account/positions` |
| 8 | Set leverage | POST | `/api/v5/account/set-leverage` |
| 9 | Close position | POST | `/api/v5/trade/close-position` |
| 10 | Get deposit address | GET | `/api/v5/asset/deposit-address` |
| 11 | Withdraw to external wallet | POST | `/api/v5/asset/withdrawal` |
| 12 | Internal transfer (trading ↔ funding) | POST | `/api/v5/asset/transfer` |
| 13 | Withdrawal history | GET | `/api/v5/asset/withdrawal-history` |
| 14 | Deposit history | GET | `/api/v5/asset/deposit-history` |
| 15 | Get ticker price | GET | `/api/v5/market/ticker?instId=<PAIR>` |

## Operations

### 1. Check Account Balance

```bash
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
msg=ts+'GET'+'/api/v5/account/balance'
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s "$OKX_BASE/api/v5/account/balance" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json"
```

Display: show each currency with total, available, and frozen balance. Skip zero balances.

### 2. Place Spot Order

Parameters needed from user:
- `instId`: trading pair, e.g. `BTC-USDT`
- `side`: `buy` or `sell`
- `ordType`: `market` or `limit`
- `sz`: quantity
- `px`: price (limit orders only)

```bash
BODY='{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"limit","sz":"0.001","px":"60000"}'
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
body='$BODY'
msg=ts+'POST'+'/api/v5/trade/order'+body
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s -X POST "$OKX_BASE/api/v5/trade/order" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

Always confirm with user before placing: show pair, side, amount, price. Wait for explicit confirmation.

### 3. Cancel Order

Parameters: `instId` and `ordId`

```bash
BODY='{"instId":"BTC-USDT","ordId":"<orderId>"}'
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
body='$BODY'
msg=ts+'DELETE'+'/api/v5/trade/order'+body
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s -X DELETE "$OKX_BASE/api/v5/trade/order" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

### 4. View Open Orders

```bash
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
msg=ts+'GET'+'/api/v5/trade/orders-pending'
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s "$OKX_BASE/api/v5/trade/orders-pending" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json"
```

### 5. View Order History

```bash
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
path='/api/v5/trade/orders-history?instType=SPOT'
msg=ts+'GET'+path
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s "$OKX_BASE/api/v5/trade/orders-history?instType=SPOT" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json"
```

### 6. Check Positions

```bash
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
msg=ts+'GET'+'/api/v5/account/positions'
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s "$OKX_BASE/api/v5/account/positions" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json"
```

### 7. Check Funding Account Balance

OKX has two separate accounts: **Trading Account** (for spot/futures) and **Funding Account** (for deposits/withdrawals). Use this for deposit/withdrawal operations.

```bash
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
msg=ts+'GET'+'/api/v5/asset/balances'
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s "$OKX_BASE/api/v5/asset/balances" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json"
```

Display: show each currency with available balance. Label clearly as "Funding Account".

---

### 8. Get Deposit Address

Get the OKX exchange deposit address for receiving funds from an external wallet.

Parameters: `ccy` (currency, e.g. USDT), optionally `chain` (e.g. USDT-ERC20)

```bash
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
msg=ts+'GET'+'/api/v5/asset/deposit-address?ccy=USDT'
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s "$OKX_BASE/api/v5/asset/deposit-address?ccy=USDT" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json"
```

Display: show address per chain, minimum deposit amount, number of confirmations needed.

---

### 9. Withdraw to External Wallet

**Note**: Withdrawal requires the API Key to have **Withdraw permission**. Proceed directly — only mention address book if error 58207 is returned (see Error Handling section for step-by-step guidance).

Parameters needed:
- `ccy`: currency (e.g. `USDT`)
- `amt`: amount
- `toAddr`: destination address
- `chain`: network (e.g. `USDT-ERC20`, `USDT-TRC20`, `USDT-Arbitrum`, `USDT-Polygon`)
- `fee`: withdrawal fee (query from OKX fee schedule; show to user before confirming)

Always confirm with user before executing: show currency, amount, destination address (first 6 + last 6 chars), network, and fee.

```bash
BODY='{"ccy":"USDT","amt":"2","dest":"4","toAddr":"0x...","fee":"1","chain":"USDT-ERC20"}'
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
body='$BODY'
msg=ts+'POST'+'/api/v5/asset/withdrawal'+body
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s -X POST "$OKX_BASE/api/v5/asset/withdrawal" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

On success: show withdrawal ID and tell user to check status via withdrawal history.

---

### 10. Internal Transfer (Trading ↔ Funding Account)

Move funds between OKX Trading Account and Funding Account (required before withdrawal — funds must be in Funding Account to withdraw).

Parameters: `ccy`, `amt`, `from` (6=Funding, 18=Trading), `to` (6=Funding, 18=Trading)

```bash
BODY='{"ccy":"USDT","amt":"2","from":"18","to":"6"}'
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
body='$BODY'
msg=ts+'POST'+'/api/v5/asset/transfer'+body
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s -X POST "$OKX_BASE/api/v5/asset/transfer" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

**Important**: When user wants to withdraw, always check if funds are in Funding Account first. If funds are in Trading Account, do internal transfer first, then withdraw.

---

### 11. Set Leverage

```bash
BODY='{"instId":"BTC-USDT-SWAP","lever":"10","mgnMode":"cross"}'
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
body='$BODY'
msg=ts+'POST'+'/api/v5/account/set-leverage'+body
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s -X POST "$OKX_BASE/api/v5/account/set-leverage" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

---

### 12. Close Position

```bash
BODY='{"instId":"BTC-USDT-SWAP","mgnMode":"cross","posSide":"long"}'
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
body='$BODY'
msg=ts+'POST'+'/api/v5/trade/close-position'+body
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s -X POST "$OKX_BASE/api/v5/trade/close-position" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

Always confirm with user before closing a position. Show current P&L if available.

---

### 13. Withdrawal History

```bash
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
msg=ts+'GET'+'/api/v5/asset/withdrawal-history'
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s "$OKX_BASE/api/v5/asset/withdrawal-history" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json"
```

---

### 14. Deposit History

```bash
TS=$(python3 -c "import datetime; print(datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
SIGN=$(python3 -c "
import hmac,hashlib,base64
ts='$TS'; secret='$OKX_API_SECRET'
msg=ts+'GET'+'/api/v5/asset/deposit-history'
print(base64.b64encode(hmac.new(secret.encode(),msg.encode(),hashlib.sha256).digest()).decode())
")
curl -s "$OKX_BASE/api/v5/asset/deposit-history" \
  -H "OK-ACCESS-KEY: $OKX_API_KEY" \
  -H "OK-ACCESS-SIGN: $SIGN" \
  -H "OK-ACCESS-TIMESTAMP: $TS" \
  -H "OK-ACCESS-PASSPHRASE: $OKX_PASSPHRASE" \
  -H "Content-Type: application/json"
```

---

## Error Handling

| Error code | Meaning | Action |
|---|---|---|
| `50111` | Invalid API Key | Ask user to verify credentials in USER.md |
| `50113` | Invalid signature | Retry once; if fails, ask user to reconnect |
| `51000` | Parameter error | Check instId format (e.g. BTC-USDT not BTC/USDT) |
| `51008` | Insufficient balance | Show current balance, ask user to adjust amount |
| `58207` | Withdrawal address not in OKX address book | Guide user through one-time address book setup (see template below) |
| `58201` | Withdrawal amount below minimum | Show minimum amount for the selected network |

On any auth error (5011x): tell user "Your OKX API credentials may be invalid or expired. Please reconnect via 'connect my OKX account'."

### 58207 — Address Book Setup Guide

When error 58207 is returned, respond with the following (translate to user's language):

> OKX requires the withdrawal address to be saved in your address book first. This is a one-time setup — once added, you can withdraw to this address anytime without repeating it.
>
> **Steps (OKX App):**
> 1. Open OKX App → Assets → Withdraw
> 2. Select the currency you want to withdraw (e.g. [insert currency here])
> 3. Tap "Address Book" or "+ Add Address"
> 4. Paste the destination address: `[insert address here]`
> 5. Select the network (e.g. [insert network here])
> 6. Confirm via email + 2FA verification
>
> ⚠️ Newly added addresses have a **24-hour lock period** before they can be used for withdrawal. Once the 24 hours are up, let me know and I'll retry the withdrawal for you.
>
> **Steps (OKX Web):**
> Same flow — log in to okx.com → Assets → Withdraw → select currency → Address Book → Add Address.

## Display Rules

- Always show amounts with currency symbol
- For orders: show pair, side (Buy/Sell), type, amount, price, status
- For balance: show Trading Account and Funding Account separately; only show non-zero currencies
- For withdrawal: always show address shortened (first 6 + last 6 chars) + full network name
- Never expose raw API credentials in responses
- Confirm before any write operation (order / withdrawal / transfer / close position)
- For withdrawal: always check if funds are in Funding Account first; if in Trading Account, offer to transfer first
