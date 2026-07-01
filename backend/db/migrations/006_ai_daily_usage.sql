-- Unified per-account AI usage limits (triage + LLM + embeddings)

create table if not exists public.ai_daily_usage (
  account_key text not null,
  usage_date date not null default current_date,
  triage_count integer not null default 0,
  llm_count integer not null default 0,
  embedding_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_key, usage_date)
);

create index if not exists idx_ai_daily_usage_date
  on public.ai_daily_usage (usage_date desc);

alter table public.ai_daily_usage disable row level security;

-- Migrate any existing triage-only counters
insert into public.ai_daily_usage (account_key, usage_date, triage_count, updated_at)
select account_key, usage_date, triage_count, updated_at
from public.triage_daily_usage
on conflict (account_key, usage_date) do update
set
  triage_count = excluded.triage_count,
  updated_at = excluded.updated_at;
