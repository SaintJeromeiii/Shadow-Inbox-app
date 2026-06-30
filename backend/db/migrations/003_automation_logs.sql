-- Automation logs for webhook idempotency and outbound relay retries.
create table if not exists public.automation_logs (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  account_key text not null default 'personal',
  event_type text not null default 'inbound_webhook',
  status text not null default 'pending',
  error_message text,
  retry_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_logs_status_check
    check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter'))
);

create unique index if not exists idx_automation_logs_message_id
  on public.automation_logs (message_id);

create index if not exists idx_automation_logs_status_retry
  on public.automation_logs (status, retry_count, updated_at desc);

create index if not exists idx_automation_logs_account_created
  on public.automation_logs (account_key, created_at desc);

alter table public.automation_logs disable row level security;
