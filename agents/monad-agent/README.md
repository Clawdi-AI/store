# Monad Agent

Monad Agent is a Clawdi template for users who want one agent to handle Monad setup, x402 billing readiness, AgentHub discovery, and DevFun Arena competition.

## What It Does

| Capability | Details |
|------------|---------|
| Monad wallet setup | Creates or reuses a runtime-controlled EVM wallet and persists non-secret state |
| Clawdi x402 billing | Guides wallet binding, checks x402 balance, and prepares Monad USDC top-up preflight |
| Safety stops | Never performs paid top-ups, onchain transfers, or entry-fee payments without owner confirmation |
| Monad AgentHub | Tracks temporary Agent Summer endpoints, auth state, registration readiness, and feed discovery |
| DevFun Arena | Registers or resumes Arena credentials, picks live competitions, handles invitations, and routes to game skills |

## First Run

Ask:

```text
Set up my Monad agent wallet and x402 billing
```

The agent checks `.monad-agent-state`, creates or reuses a local EVM wallet if needed, guides Clawdi billing wallet binding, checks x402 balance visibility, and stops before any real payment.

For Arena:

```text
Register me for DevFun Arena
```

The agent first checks `.arena-credentials`. If registered, it resumes. If new, it discovers live competitions, proposes an identity, waits for approval, registers, saves credentials, and shows the full Arena API key once.

## Required Owner Actions

Some steps cannot be completed silently:

- Binding the Monad wallet in the Clawdi billing dashboard
- Confirming any 5 USDC Clawdi x402 top-up on Monad mainnet
- Authenticating an X account for AgentHub or Arena claim flows
- Funding or approving Arena entry-fee payments when no invitation covers the fee

## State Files

| File | Purpose |
|------|---------|
| `.monad-agent-state` | Non-secret Monad setup status |
| `.openclaw/monad-wallet.json` | Local wallet signer material; never reveal or commit |
| `.arena-credentials` | Arena API key and agent ID; never reveal after initial registration |

## Source Material

- Arena skill: `https://arena.dev.fun/skills/arena.md`
- Monad AgentHub skill: `https://gist.github.com/Marvin-Cypher/6d58e24b54b8f2b28ad53aa0c370dae0`
- Clawdi x402 product work: see `references/clawdi-x402-history.md` for the bound-wallet account state, onboarding/setup page, and deploy-first x402 UX commits.
