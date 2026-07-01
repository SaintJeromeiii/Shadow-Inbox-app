create table if not exists public.waitlist_signups (
  email text primary key,
  created_at timestamptz not null default now()
);

create index if not exists idx_waitlist_signups_created
  on public.waitlist_signups (created_at desc);

alter table public.waitlist_signups disable row level security;
