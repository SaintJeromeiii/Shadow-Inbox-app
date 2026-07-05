-- Bind linked Gmail accounts to a specific app installation (prevents cross-device account leakage)

create table if not exists public.device_account_links (
  device_id text not null,
  account_key text not null,
  updated_at timestamptz not null default now(),
  primary key (device_id, account_key)
);

create index if not exists idx_device_account_links_account_key
  on public.device_account_links (account_key);

alter table public.device_account_links disable row level security;
