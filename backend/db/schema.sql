-- Shadow Inbox cloud schema (run in Supabase SQL editor)

create table if not exists public.notification_feed (
  id text not null,
  account_key text not null default 'personal',
  payload jsonb not null,
  sort_timestamp timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_key, id)
);

create index if not exists idx_notification_feed_account_sort
  on public.notification_feed (account_key, sort_timestamp desc);

create table if not exists public.finance_transactions (
  id text primary key,
  date date not null,
  vendor text not null,
  amount numeric(12, 2) not null,
  category text not null default 'Operational',
  project_name text not null default 'General',
  billing_date date not null,
  source_notification_id text,
  account_key text not null default 'personal',
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_transactions_account_date
  on public.finance_transactions (account_key, date desc);

create index if not exists idx_finance_transactions_source
  on public.finance_transactions (source_notification_id);

create table if not exists public.auto_pilot_rules (
  id text primary key,
  name text not null,
  platform text not null default 'any',
  condition text not null,
  action text not null default 'reply',
  reply_text text,
  auto_close_task boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.auto_pilot_rules (
  id, name, platform, condition, action, reply_text, auto_close_task, enabled, created_at, updated_at
) values
  (
    '1',
    'Discord fixed acknowledgment',
    'discord',
    'contains word ''fixed''',
    'reply',
    'Awesome, thanks for testing!',
    true,
    true,
    '2026-06-26T00:00:00.000Z',
    '2026-06-26T00:00:00.000Z'
  ),
  (
    '2',
    'Slack LGTM auto-close',
    'slack',
    'contains word ''lgtm''',
    'reply',
    'Thanks — marking this resolved.',
    true,
    true,
    '2026-06-26T00:00:00.000Z',
    '2026-06-26T00:00:00.000Z'
  ),
  (
    '3',
    'FYI newsletter auto-ignore',
    'email',
    'category:fyi',
    'archive',
    null,
    true,
    false,
    '2026-06-26T00:00:00.000Z',
    '2026-06-26T00:00:00.000Z'
  )
on conflict (id) do nothing;

create table if not exists public.expo_push_tokens (
  token text primary key,
  account_key text,
  platform text,
  device_name text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_expo_push_tokens_account
  on public.expo_push_tokens (account_key, last_seen_at desc);

create table if not exists public.voice_notes (
  id text primary key,
  account_key text not null default 'personal',
  category text not null,
  project text not null default 'General',
  summary text not null,
  transcript text not null,
  structured_data jsonb not null default '{}'::jsonb,
  routed_to text,
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_notes_account_created
  on public.voice_notes (account_key, created_at desc);

create index if not exists idx_voice_notes_category
  on public.voice_notes (category, created_at desc);

create table if not exists public.executive_briefs (
  id text primary key,
  account_key text not null default 'all',
  summary_text text not null,
  urgency_level text not null default 'routine',
  signal_count integer not null default 0,
  mode text not null default 'live',
  created_at timestamptz not null default now()
);

create index if not exists idx_executive_briefs_account_created
  on public.executive_briefs (account_key, created_at desc);

create index if not exists idx_executive_briefs_urgency
  on public.executive_briefs (urgency_level, created_at desc);

-- Backend uses the service role key server-side. Disable RLS so inserts succeed.
alter table public.notification_feed disable row level security;
alter table public.finance_transactions disable row level security;
alter table public.auto_pilot_rules disable row level security;
alter table public.expo_push_tokens disable row level security;
alter table public.voice_notes disable row level security;
alter table public.executive_briefs disable row level security;
