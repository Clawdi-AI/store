# Clawdi x402 Product History

This template incorporates prior Clawdi monorepo work by Marvin-Cypher around x402 onboarding, wallet-bound account state, and deploy-first setup UX.

## Relevant Commits

| Commit | Date | Message | Template impact |
|--------|------|---------|-----------------|
| `7e98e0c` | 2026-05-28 | `feat(web): add x402 onboarding page (#504)` | Treat x402 setup as an explicit owner-facing onboarding path. |
| `b8cb79f` | 2026-05-28 | `fix(web): read x402 account state from bound wallet (#505)` | Prefer live bound-wallet account state over stale local assumptions. |
| `47a44f1` | 2026-06-02 | `polish(web): simplify x402 setup page (#518)` | Keep setup steps short, concrete, and status-driven. |
| `190cfe0` | 2026-06-02 | `polish(web): make x402 deploy-first layout (#519)` | Get the agent running first, then guide billing/payment setup with exact status. |
| `7b2e621` | 2026-06-02 | `polish(web): simplify x402 step card layout (#520)` | Present each setup step as a single action with one clear blocker. |
| `957032e` | 2026-06-02 | `polish(web): align x402 mockup animation (#521)` | Keep wallet, payment, and completion states visually and verbally aligned. |
| `3b0e3c0` | 2026-06-02 | `fix(web): animate x402 phone mockup (#522)` | Make the owner-facing flow feel like a guided runtime action, not backend plumbing. |

## Behavioral Translation

- The agent should not frame x402 as hidden billing.
- Wallet binding is a first-class state checkpoint.
- The right question before payment is "what exact state is missing?", not "try again blindly."
- Paid top-ups and Arena entry-fee transfers require explicit owner confirmation.
- The agent can continue with read-only discovery and local state even when payment setup is incomplete.
