# The Vault (v0.1)

Minimal production slice using **Next.js + pnpm + Inngest + Supabase (Postgres)**.

Current scope:
- Queue invite
- Knox sends initial SMS
- Inbound SMS routing (deterministic + model fallback)
- Interest handoff to Ellis
- Decline -> do_not_contact
- Per-member serialized inbound loop
- Memory persistence (summary + facts + retrieval context)

## Stack

- Next.js (App Router)
- Inngest (event orchestration)
- Supabase Postgres (state + transcript persistence)
- Twilio SMS (optional locally; mock send if credentials are missing)
- AI wrapper (OpenAI default, OpenRouter optional)

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Add env vars:

```bash
cp .env.example .env.local
```

Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

Optional (real SMS):
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

Optional (AI fallback classifier):
- `AI_PROVIDER` = `openai` or `openrouter`
- For OpenAI:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `OPENAI_EMBEDDING_MODEL`
- For OpenRouter:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`
  - `OPENROUTER_EMBEDDING_MODEL`
  - `OPENROUTER_SITE_URL`

3. Create tables in Supabase SQL editor:
- Run `/Users/nicholasoneill/Dev/thevault/supabase/schema.sql`

Or use migrations (recommended):
- `/Users/nicholasoneill/Dev/thevault/supabase/migrations/202602130001_initial_schema.sql`
- `/Users/nicholasoneill/Dev/thevault/supabase/migrations/202602130002_semantic_memory.sql`

4. Run app:

```bash
pnpm dev
```

5. Run Inngest dev:

```bash
pnpm inngest-dev
```

## API Endpoints

### `POST /api/invites`
Queue an invite and trigger Knox send.

Payload:

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+13055551234",
  "nominatorFullName": "Nick O'Neill",
  "nominatorContext": "Met at XYZ dinner"
}
```

### `POST /api/sms/inbound`
Inbound SMS webhook (Twilio form payload or JSON).

Twilio-style keys supported:
- `From`
- `Body`
- `OptOutType` (used for STOP-class handling)

## Agent Runtime Files

- Global policy: `/Users/nicholasoneill/Dev/thevault/AGENTS.md`
- Agent souls:
  - `/Users/nicholasoneill/Dev/thevault/src/agents/knox/SOUL.md`
  - `/Users/nicholasoneill/Dev/thevault/src/agents/ellis/SOUL.md`
  - `/Users/nicholasoneill/Dev/thevault/src/agents/sloane/SOUL.md`
  - `/Users/nicholasoneill/Dev/thevault/src/agents/vaughn/SOUL.md`
- Agent-specific hard rules:
  - `/Users/nicholasoneill/Dev/thevault/src/agents/knox/AGENTS.md`
  - `/Users/nicholasoneill/Dev/thevault/src/agents/ellis/AGENTS.md`
  - `/Users/nicholasoneill/Dev/thevault/src/agents/sloane/AGENTS.md`
  - `/Users/nicholasoneill/Dev/thevault/src/agents/vaughn/AGENTS.md`
- Instruction pack loader:
  - `/Users/nicholasoneill/Dev/thevault/src/lib/agents/instructions.ts`

## Memory Layer

- Tables:
  - `conversation_summaries`
  - `member_facts`
  - `memory_events`
- Context builder:
  - `/Users/nicholasoneill/Dev/thevault/src/lib/memory/context.ts`
- Background refresh function:
  - `vault/memory.refresh.requested` -> `memory-refresh-member`

Flow:
1. Inbound message is logged.
2. Inbound router emits `vault/memory.refresh.requested`.
3. Background function extracts summary + durable facts and persists them.
4. Ellis reply generation pulls `latest summary + key facts + recent turns`.

## Inngest Functions

- `vault/invite.queued` -> `invite-send-knox`
- `vault/sms.inbound.received` -> `inbound-route`
- `vault/member.handoff.requested` -> `handoff-to-ellis`

Function organization conventions live at:
- `/Users/nicholasoneill/Dev/thevault/src/lib/inngest/CONVENTIONS.md`

## Notes

- If Twilio env vars are absent, outbound SMS is logged via `console.info` for local development.
- If AI provider keys are absent, inbound intent routing uses deterministic rules only.
- This intentionally does not include Sloane/Vaughn workflows, digest generation, Mercer scoring, or economy logic yet.

## Production Database Recommendation

Use two Supabase projects:
- staging
- production

Promote schema with migrations only (not manual SQL drift), then run app deploys after migration success.
