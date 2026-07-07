create table if not exists public.ai_cost_daily_usage (
  account_key text not null,
  usage_date date not null default current_date,
  provider text not null,
  model text not null,
  usage_type text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 5) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (account_key, usage_date, provider, model, usage_type)
);

create index if not exists idx_ai_cost_daily_usage_date
  on public.ai_cost_daily_usage (usage_date desc);

alter table public.ai_cost_daily_usage disable row level security;
