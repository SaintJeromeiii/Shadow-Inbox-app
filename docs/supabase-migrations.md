# Supabase Migrations

Run these in the **Supabase SQL Editor** (or `npx supabase db query --linked -f <file>`).

## Order

1. `backend/db/schema.sql` — base tables (if fresh project)
2. `backend/db/migrations/003_oauth_accounts.sql` — **required for Gmail sign-in**
3. `backend/db/migrations/004_user_profiles.sql`
4. `backend/db/migrations/005_triage_usage_and_streaks.sql`
5. `backend/db/migrations/006_ai_daily_usage.sql`
6. `backend/db/migrations/007_waitlist_signups.sql`
7. `backend/db/migrations/008_device_account_links.sql` — **required for per-device Gmail isolation**
8. `backend/db/migrations/009_ai_cost_daily_usage.sql` — **required for token-based AI cost tracking in Run Cost**
9. `backend/db/migrations/010_enable_rls_lockdown.sql` — **required: closes public table access via anon key**

## Railway env vars

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Use the **service role** key on Railway, not the anon key. With RLS enabled and no permissive policies, only the service role can read/write tables. The mobile app never talks to Supabase directly.

## Verify

After migrations, production smoke test should pass waitlist + AI usage endpoints:

```bash
npm run smoke:production
```

Check AI usage for a public account:

```bash
curl -s -H "x-account-key: google_shadowinboxtest_gmail_com" \
  https://shadow-inbox-production.up.railway.app/api/user/ai-usage | python3 -m json.tool
```
