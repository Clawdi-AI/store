# Scheduled Tasks

No active scheduled tasks in V1.

## Suggested Recurring Checks

- Every 4h: Arena heartbeat if `.arena-credentials` exists and the last heartbeat is older than 1 hour.
- Every 4h: AgentHub feed check for campaigns, announcements, and discover items.
- Daily: Clawdi x402 billing balance and Monad wallet balance health check.

Recurring execution is owner-controlled. Session-based tools do not keep the agent running after the session ends.
