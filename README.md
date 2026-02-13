# The Vault (v0.1)

Minimal production slice using **Next.js + pnpm + Inngest + Supabase (Postgres)**.

Current scope:
- Queue invite
- Knox sends initial SMS
- Inbound SMS routing
- Interest handoff to Ellis
- Decline -> do_not_contact

## Stack

- Next.js (App Router)
- Inngest (event orchestration)
- Supabase Postgres (state + transcript persistence)
- Twilio SMS (optional locally; mock send if credentials are missing)

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

Optional (for real SMS sending):
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

3. Create tables in Supabase SQL editor:
- Run `/Users/nicholasoneill/Dev/thevault/supabase/schema.sql`

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

## Inngest Functions

- `vault/invite.queued` -> `invite-send-knox`
- `vault/sms.inbound.received` -> `inbound-route`
- `vault/member.handoff.requested` -> `handoff-to-ellis`

Function organization conventions live at:
- `/Users/nicholasoneill/Dev/thevault/src/lib/inngest/CONVENTIONS.md`

## Notes

- If Twilio env vars are absent, outbound SMS is logged via `console.info` for local development.
- This intentionally does not include Sloane/Vaughn, digest generation, Mercer scoring, or economy logic yet.
