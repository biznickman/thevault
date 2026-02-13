create extension if not exists pgcrypto;

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

create index if not exists idx_invites_member_id on invites (member_id);
create index if not exists idx_conversations_member_id on conversations (member_id);
create index if not exists idx_conversations_created_at on conversations (created_at desc);
