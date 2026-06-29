-- Per-character progress tracks (run once on existing Supabase projects).
alter table public.user_progress
  add column if not exists character_id text not null default 'neon_warden';

alter table public.user_progress drop constraint if exists user_progress_pkey;

alter table public.user_progress
  add primary key (account_key, character_id);

create index if not exists idx_user_progress_character
  on public.user_progress (account_key, character_id, updated_at desc);
