---
name: bridge
description: "Use this skill when the user mentions cross-chain, bridge tokens, transfer across chains, move assets to another chain, 跨链, 桥接, 转到另一条链, 跨到Polygon, 跨到Arbitrum, 跨到Base, 跨链转账, bridge USDC, bridge ETH, move funds to another network, cross-chain swap."
license: MIT
metadata:
  author: clawdi
  version: "1.0.0"
---

# Cross-Chain Bridge

Transfer tokens across chains using deBridge (primary) with Li.Fi as fallback.

**Always tell the user which bridge was used and why.**

---

## Bridge Selection Logic

```
1. Call deBridge quote API
   → Valid quote returned → use deBridge, inform user
   → Error / unsupported route → fall back to Li.Fi, inform user why
```

Display to user when using deBridge:
> 本次跨链通过 **deBridge** 执行

Display to user when falling back to Li.Fi:
> deBridge 暂不支持此路由，改用 **Li.Fi** 聚合

---

## API Reference

### deBridge (Primary)
Base URL: `https://api.dln.trade/v1.0`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/dln/order/create-tx` | GET | Get quote + transaction data |
| `/dln/order/{orderId}/status` | GET | Check order status |
| `/supported-chains` | GET | List supported chain IDs |

### Li.Fi (Fallback)
Base URL: `https://li.quest/v1`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/quote` | GET | Get quote + transaction data |
| `/status` | GET | Check transfer status |

---

## Chain ID Reference

| Chain | EVM Chain ID | deBridge supported |
|-------|--------------|--------------------|
| Ethereum | 1 | ✅ |
| BSC | 56 | ✅ |
| Polygon | 137 | ✅ |
| Arbitrum | 42161 | ✅ |
| Base | 8453 | ✅ |
| Optimism | 10 | ✅ |
| Avalanche | 43114 | ✅ |
| Linea | 59144 | ✅ |
| Solana | 7565164 | ✅ |

---

## Flow 1 — deBridge (Primary)

### Step 1: Get quote

```bash
SRC_CHAIN_ID=<source chain ID>
DST_CHAIN_ID=<destination chain ID>
TOKEN_IN=<source token contract address>
TOKEN_IN_AMOUNT=<amount in minimal units>
TOKEN_OUT=<destination token contract address>
WALLET_ADDR=<user EVM address from USER.md>

curl -s "https://api.dln.trade/v1.0/dln/order/create-tx?\
srcChainId=${SRC_CHAIN_ID}\
&srcChainTokenIn=${TOKEN_IN}\
&srcChainTokenInAmount=${TOKEN_IN_AMOUNT}\
&dstChainId=${DST_CHAIN_ID}\
&dstChainTokenOut=${TOKEN_OUT}\
&dstChainTokenOutAmount=auto\
&dstChainTokenOutRecipient=${WALLET_ADDR}\
&srcChainOrderAuthorityAddress=${WALLET_ADDR}\
&dstChainOrderAuthorityAddress=${WALLET_ADDR}"
```

Response fields to extract:
- `estimation.srcChainTokenIn.symbol` + `amount` — what user sends
- `estimation.dstChainTokenOut.amount` — what user receives (minimal units)
- `estimation.dstChainTokenOut.approximateUsdValue` — USD value of received amount
- `estimation.costsDetails` — fee breakdown
- `tx.to` — contract to call
- `tx.data` — calldata
- `tx.value` — native token fee to include (in wei)
- `orderId` — for status tracking

If API returns error or `estimation` is missing → fall back to Li.Fi (Flow 2).

### Step 2: Check token approval

If `TOKEN_IN` is not a native token (ETH/BNB/etc.), check and run approval:

```bash
# ERC-20 approve(tx.to, type(uint256).max)
APPROVE_CALLDATA="0x095ea7b3\
$(printf '%064s' "${TX_TO#0x}" | tr ' ' '0')\
ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"

onchainos wallet contract-call \
  --to ${TOKEN_IN} \
  --chain ${SRC_CHAIN_ID} \
  --input-data ${APPROVE_CALLDATA}
```

> ⚠️ Before running approval: tell the user you're approving the deBridge contract to spend their tokens, and wait for confirmation.

### Step 3: Show preview and wait for confirm

```
跨链预览 — deBridge
─────────────────────────────
从：[amount] [token] on [source chain]
到：~[amount] [token] on [dest chain]（约 $X）

手续费：~$X（含协议费 + gas）
预计到账：2-5 分钟
桥接方：deBridge

输入「确认」执行跨链
```

### Step 4: Execute

```bash
onchainos wallet contract-call \
  --to ${TX_TO} \
  --chain ${SRC_CHAIN_ID} \
  --input-data ${TX_DATA} \
  --amt ${TX_VALUE}
```

> `--amt` = `tx.value` from deBridge response (native token protocol fee, in wei)
> For native token inputs (ETH/BNB): `--amt` = `tx.value` + `TOKEN_IN_AMOUNT`

Save `orderId` from response for status tracking.

### Step 5: Status monitoring

```bash
ORDER_ID=<orderId from step 1>
curl -s "https://api.dln.trade/v1.0/dln/order/${ORDER_ID}/status"
```

Status values:
- `Created` / `Fulfilled` / `SentUnlock` / `ClaimedUnlock` → in progress
- `ClaimedUnlock` → completed ✅
- `SentOrderCancel` / `ClaimedOrderCancel` → cancelled / refunded

After execution, tell user:
> 跨链交易已提交 ✅（deBridge）
> 订单 ID：[orderId]
> 预计 2-5 分钟到账。我会在完成后通知你，或你可以随时问我「跨链进度」。

---

## Flow 2 — Li.Fi (Fallback)

### Step 1: Get quote

```bash
curl -s "https://li.quest/v1/quote?\
fromChain=${SRC_CHAIN_ID}\
&toChain=${DST_CHAIN_ID}\
&fromToken=${TOKEN_IN}\
&toToken=${TOKEN_OUT}\
&fromAmount=${TOKEN_IN_AMOUNT}\
&fromAddress=${WALLET_ADDR}\
&slippage=0.005"
```

Response fields to extract:
- `estimate.fromAmount` — what user sends
- `estimate.toAmount` — what user receives
- `estimate.toAmountUSD` — USD value received
- `estimate.feeCosts` — fee breakdown
- `toolDetails.name` — which underlying bridge Li.Fi selected
- `transactionRequest.to` — contract to call
- `transactionRequest.data` — calldata
- `transactionRequest.value` — native token value (hex)
- `transactionRequest.gasLimit` — gas estimate

### Step 2: Show preview and wait for confirm

```
跨链预览 — Li.Fi
─────────────────────────────
从：[amount] [token] on [source chain]
到：~[amount] [token] on [dest chain]（约 $X）

路由：Li.Fi → [toolDetails.name]（最优路径）
手续费：~$X
预计到账：[estimate.executionDuration]秒
桥接方：Li.Fi（内部路由：[bridge name]）

输入「确认」执行跨链
```

### Step 3: Execute

```bash
# Convert hex value to decimal for --amt
TX_VALUE_DEC=$(python3 -c "print(int('${TX_VALUE_HEX}', 16))")

onchainos wallet contract-call \
  --to ${TRANSACTION_REQUEST_TO} \
  --chain ${SRC_CHAIN_ID} \
  --input-data ${TRANSACTION_REQUEST_DATA} \
  --amt ${TX_VALUE_DEC}
```

### Step 4: Status check

```bash
TX_HASH=<txHash from execution>
BRIDGE_NAME=<toolDetails.name>

curl -s "https://li.quest/v1/status?\
txHash=${TX_HASH}\
&bridge=${BRIDGE_NAME}\
&fromChain=${SRC_CHAIN_ID}\
&toChain=${DST_CHAIN_ID}"
```

Status: `PENDING` → `DONE` (substatus: `COMPLETED`) or `FAILED` → `REFUNDED`

---

## Full Checklist

```
□ 1. Parse user intent: source chain, token, amount, destination chain, destination token
□ 2. Resolve token addresses (use onchainos token search if needed)
□ 3. Check source chain balance: onchainos wallet balance --chain <srcChain>
□ 4. Check native token for gas on source chain
□ 5. Try deBridge quote → success? use deBridge : fall back to Li.Fi
□ 6. Check and run token approval if needed (wait for user confirm)
□ 7. Show bridge preview with bridge name, amounts, fees, ETA
□ 8. Wait for explicit user "确认" / "confirm"
□ 9. Execute bridge transaction
□ 10. Return txHash + orderId + status tracking note
□ 11. Write to TRADE_LOG.md after confirmed on-chain
```

---

## TRADE_LOG.md Entry

After successful bridge execution, append to TRADE_LOG.md:

```
| 2026-03-28 22:14 | Bridge | USDT(BSC) → USDC(Polygon) via deBridge | BSC→Polygon | 9.99 USDT | orderId_abc |
```

---

## Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| deBridge returns error | Unsupported route or API issue | Fall back to Li.Fi automatically, inform user |
| Insufficient balance | Not enough tokens | Show current balance, shortfall amount |
| No native token for gas | Gas wallet empty | Tell user which native token needed and how much |
| Token approval failed | Contract interaction failed | Retry once, then ask user to check wallet |
| Bridge tx failed simulation | Contract revert | Do not broadcast, show error, suggest retry |
| Li.Fi status = FAILED | Bridge failed | Inform user funds will be refunded automatically |
| Status = REFUNDED | Bridge cancelled | Confirm refund received, check balance |

---

## Safety Rules

<rules>
<must>
  - Always show bridge preview with bridge name, amounts, fees, and ETA before executing
  - Always tell user which bridge was used (deBridge or Li.Fi) and which underlying route
  - Always check native token balance for gas before attempting bridge
  - Always warn before running token approval — explain what permission is being granted
  - Write to TRADE_LOG.md after every successful bridge
  - Provide order/tx tracking link after execution
</must>
<never>
  - Never execute bridge without explicit user confirmation
  - Never bridge without checking balance first
  - Never hide which bridge or route was used
  - Never retry a failed bridge automatically — always inform user and ask how to proceed
</never>
</rules>
