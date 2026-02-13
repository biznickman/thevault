create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text not null unique,
  nominated_by_full_name text not null,
  nominator_context text,
  status text not null check (status in ('prospect', 'guest', 'vaulted', 'do_not_contact')),
  level integer not null default 1,
  assigned_concierge text not null check (assigned_concierge in ('Knox', 'Ellis', 'Sloane', 'Vaughn', 'System')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  status text not null check (status in ('queued', 'sent', 'responded', 'declined', 'no_response')),
  channel text not null check (channel in ('sms')),
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  concierge text not null check (concierge in ('Knox', 'Ellis', 'Sloane', 'Vaughn', 'System')),
  level integer not null,
  channel text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_text text not null,
  created_at timestamptz not null default now()
);

create table if not exists conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  summary_text text not null,
  source_message_count integer not null default 0,
  summary_embedding vector(1536),
  created_at timestamptz not null default now()
);

create table if not exists member_facts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  category text not null default 'general',
  fact text not null,
  confidence real not null default 0.7 check (confidence >= 0 and confidence <= 1),
  source text not null default 'inferred',
  is_active boolean not null default true,
  fact_embedding vector(1536),
  last_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, category, fact)
);

create table if not exists memory_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_invites_member_id on invites (member_id);
create index if not exists idx_conversations_member_id on conversations (member_id);
create index if not exists idx_conversations_created_at on conversations (created_at desc);
create index if not exists idx_summaries_member_id on conversation_summaries (member_id, created_at desc);
create index if not exists idx_member_facts_member_id on member_facts (member_id, updated_at desc);
create index if not exists idx_member_facts_active on member_facts (member_id) where is_active = true;
create index if not exists idx_member_facts_embedding on member_facts
  using hnsw (fact_embedding vector_cosine_ops);
create index if not exists idx_memory_events_member_id on memory_events (member_id, created_at desc);

create or replace function match_member_facts_by_embedding(
  p_member_id uuid,
  p_query_embedding vector(1536),
  p_limit integer default 5
)
returns table (
  category text,
  fact text,
  confidence real,
  updated_at timestamptz,
  similarity real
)
language sql
stable
as $$
  select
    mf.category,
    mf.fact,
    mf.confidence,
    mf.updated_at,
    (1 - (mf.fact_embedding <=> p_query_embedding))::real as similarity
  from member_facts mf
  where mf.member_id = p_member_id
    and mf.is_active = true
    and mf.fact_embedding is not null
  order by mf.fact_embedding <=> p_query_embedding
  limit greatest(p_limit, 1);
$$;
