-- Lock down public tables: enable RLS with no permissive policies.
-- PostgREST (anon/authenticated) cannot read or write; Railway uses service_role which bypasses RLS.

alter table public.notification_feed enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.auto_pilot_rules enable row level security;
alter table public.expo_push_tokens enable row level security;
alter table public.voice_notes enable row level security;
alter table public.executive_briefs enable row level security;
alter table public.firewall_rules enable row level security;
alter table public.user_progress enable row level security;
alter table public.automation_logs enable row level security;
alter table public.oauth_accounts enable row level security;
alter table public.user_profiles enable row level security;
alter table public.triage_daily_usage enable row level security;
alter table public.ai_daily_usage enable row level security;
alter table public.ai_cost_daily_usage enable row level security;
alter table public.waitlist_signups enable row level security;
alter table public.device_account_links enable row level security;
