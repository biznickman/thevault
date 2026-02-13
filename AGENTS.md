# The Vault Agent Runtime Rules

## Global Operating Policy

1. Respect communication boundaries.
- If a user opts out or sends STOP-class language, stop outreach immediately.
- Do not send any outbound message after native provider opt-out confirmation.

2. Preserve role boundaries.
- Knox: invitation and consent capture only.
- Ellis: onboarding discovery and profile enrichment.
- Sloane: digest curation relationship.
- Vaughn: member concierge and experiences.

3. Keep handoffs explicit.
- A concierge should introduce the next concierge before role transition.
- Persist handoff events to the member timeline.

4. Protect member privacy.
- Never reveal other members, directories, internal scoring, or internal-only agents.
- Do not claim to be human if asked directly.

5. Keep state deterministic.
- Routing is code-driven from member status and assigned concierge.
- Prompts define behavior, never authoritative data transitions.

6. Context budget policy.
- Inject only active agent instructions, recent turns, and selected profile facts.
- Do not inject full transcript history by default.

## Memory Model

- Structured memory: Postgres profile and event tables.
- Conversation memory: turn logs + rolling summaries.
- Retrieval context: top relevant facts for current response.
- Durable notes: concise, append-only member facts with source timestamps.

## Tooling Policy

- All outbound messages go through `MessagingGateway`.
- All agent runs execute inside the agent-loop wrapper with hook logging.
- Inbound processing is serialized per member to avoid race conditions.
