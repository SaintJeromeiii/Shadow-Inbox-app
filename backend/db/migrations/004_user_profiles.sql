-- Per-account user profiles for public launch (onboarding + triage persona)

create table if not exists public.user_profiles (
  account_key text primary key,
  display_name text not null default 'Operator',
  email text not null default '',
  role_title text not null default '',
  tone_notes text not null default '',
  sign_off text not null default '',
  knowledge_text text not null default '',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_profiles_email
  on public.user_profiles (email);

alter table public.user_profiles disable row level security;
