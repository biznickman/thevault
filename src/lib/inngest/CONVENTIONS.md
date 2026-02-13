# Inngest Function Conventions

Use this structure for every new function:

- `src/lib/inngest/functions/<domain>/<action>.ts`
- Export one function per file.
- Keep shared helpers in normal libs (`src/lib/...`) instead of this folder.
- Register functions only in `src/lib/inngest/functions/index.ts`.

## Domains

- `invites/`: invite lifecycle and outbound invite actions
- `sms/`: inbound SMS routing and message interpretation
- `members/`: member transitions and concierge handoffs
- `memory/`: memory extraction, summaries, and durable fact updates
- `events/`: event invitations, reminders, and attendance workflows (future)
- `ops/`: internal maintenance and guardrail jobs (future)

## Naming

- File names: kebab-case action names, e.g. `send-knox-invite.ts`
- Function IDs: stable and explicit, e.g. `invite-send-knox`
- Step names: short, deterministic, and action-oriented

## Safety

- All irreversible updates should happen inside named `step.run` blocks.
- Route all messaging through the messaging gateway.
- Add idempotency keys for outbound sends.
