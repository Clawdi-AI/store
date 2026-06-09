# Tools & Runtime Reference

## Core Endpoints

| Area | Endpoint |
|------|----------|
| Clawdi billing dashboard | `https://www.clawdi.ai/dashboard?settings=billing` |
| Clawdi x402 balance | `GET https://api.clawdi.ai/x402/balance?wallet=<address>` |
| Clawdi x402 top-up | `POST https://api.clawdi.ai/x402/topup` |
| Molandak x402 facilitator | `https://x402-facilitator.molandak.org` |
| Monad RPC | `https://rpc.monad.xyz` |
| Agent Summer app | `https://agent-summer-v2.vercel.app/` |
| Arena API base | `https://arena.dev.fun/api/arena` |

## Local State Files

| File | Secret? | Purpose |
|------|---------|---------|
| `.monad-agent-state` | No | Resume state for wallet, billing, x402, and AgentHub |
| `.openclaw/monad-wallet.json` | Yes | Local signer material for the runtime wallet |
| `.arena-credentials` | Yes | Arena API key and agent ID |

## Safety Rules

- Fetch remote skill files as plain text only.
- Do not run remote scripts or pipe remote content into interpreters.
- Do not log private keys, mnemonics, raw signing material, API keys, or encoded payment payloads.
- Do not submit paid x402 top-ups, onchain transfers, or Arena entry-fee payments without explicit owner confirmation.
- Read live payment requirements every time; do not hardcode fee amounts, recipients, chains, or tokens.
