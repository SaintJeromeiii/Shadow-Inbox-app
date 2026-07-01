# Shadow Inbox — Launch Checklist

Use this before inviting beta testers or submitting to app stores.

## One-time setup

- [ ] Run Supabase migrations `004`–`007` in the SQL editor
- [ ] Set Railway env vars:
  - `OPENAI_API_KEY`
  - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  - `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
  - `AI_LIMIT_EXEMPT_ACCOUNT_KEYS=personal`
  - Optional: `AI_DAILY_*` / `AI_GLOBAL_DAILY_*` overrides
  - Optional: `EXPO_PUBLIC_SENTRY_DSN` (after creating a Sentry project)
- [ ] Set **hard monthly spending limit** on OpenAI ($1 recommended):  
  https://platform.openai.com/settings/organization/limits
- [ ] Deploy: `railway up`

## Automated server checks

```bash
chmod +x scripts/smoke-test-production.sh
npm run smoke:production
```

## Device smoke test

Follow [device-smoke-test.md](./device-smoke-test.md) on a physical Android/iOS device.

## Store submission

Copy from [store-listing.md](./store-listing.md) into Play Console / App Store Connect.

Build internal test track:

```bash
eas build --profile preview --platform android
eas build --profile preview --platform ios
```

## Beta waitlist

Landing page collects emails at `/docs/` → `POST /api/waitlist/signup`.  
View signups in Supabase table `waitlist_signups`.

## Cost safety summary

| Layer | Protection |
| --- | --- |
| Per-user caps | 25 triage / 10 LLM / 15 embedding per day |
| Global pool | 100 triage / 40 LLM / 60 embedding total per day |
| Operator exempt | `personal` account unlimited |
| OpenAI dashboard | Hard $ limit (you set manually) |
