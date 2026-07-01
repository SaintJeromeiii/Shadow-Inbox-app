-- Persist linked Google OAuth tokens (survives Railway redeploys)

create table if not exists public.oauth_accounts (
  account_key text primary key,
  email text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_oauth_accounts_email
  on public.oauth_accounts (email);
