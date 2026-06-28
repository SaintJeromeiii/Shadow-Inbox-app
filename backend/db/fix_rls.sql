-- Run once in Supabase SQL editor if inbox sync fails with RLS errors.
-- Also confirm Railway uses SUPABASE_SERVICE_ROLE_KEY (not the anon key).

alter table public.notification_feed disable row level security;
alter table public.finance_transactions disable row level security;
alter table public.auto_pilot_rules disable row level security;
alter table public.expo_push_tokens disable row level security;
alter table public.voice_notes disable row level security;
alter table public.executive_briefs disable row level security;
