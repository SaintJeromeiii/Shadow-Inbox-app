-- Daily triage usage caps + clearance streak tracking

create table if not exists public.triage_daily_usage (
  account_key text not null,
  usage_date date not null default current_date,
  triage_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_key, usage_date)
);

create index if not exists idx_triage_daily_usage_date
  on public.triage_daily_usage (usage_date desc);

alter table public.triage_daily_usage disable row level security;

alter table public.user_profiles
  add column if not exists daily_goal integer not null default 10;

alter table public.user_profiles
  add column if not exists clears_today integer not null default 0;

alter table public.user_profiles
  add column if not exists streak_days integer not null default 0;

alter table public.user_profiles
  add column if not exists last_clear_date date;
