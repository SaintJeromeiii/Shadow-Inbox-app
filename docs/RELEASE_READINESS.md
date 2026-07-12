# Release Readiness

Use this checklist before inviting more beta testers or promoting a build to production on Google Play. Work top to bottom; each phase blocks the next.

**Current production target:** Android AAB (`eas build --profile production --platform android`)

---

## Phase 1 — Backend & database

- [ ] All Supabase migrations applied in order (see [supabase-migrations.md](./supabase-migrations.md)):
  - [ ] `003_oauth_accounts.sql`
  - [ ] `004_user_profiles.sql`
  - [ ] `005_triage_usage_and_streaks.sql`
  - [ ] `006_ai_daily_usage.sql`
  - [ ] `007_waitlist_signups.sql`
  - [ ] `008_device_account_links.sql`
  - [ ] `009_ai_cost_daily_usage.sql`
  - [ ] `010_enable_rls_lockdown.sql` *(required — closes anon-key table access)*
- [ ] Railway env vars set:
  - [ ] `OPENAI_API_KEY`
  - [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role, not anon)
  - [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
  - [ ] `AI_LIMIT_EXEMPT_ACCOUNT_KEYS=personal` (or your operator key)
  - [ ] Optional overrides: `AI_DAILY_*` / `AI_GLOBAL_DAILY_*`
- [ ] OpenAI org **hard monthly spending limit** set (e.g. $1):  
  https://platform.openai.com/settings/organization/limits
- [ ] Latest backend deployed (`railway up` or push to deploy branch)
- [ ] Production smoke test passes:

```bash
chmod +x scripts/smoke-test-production.sh
npm run smoke:production
```

- [ ] AI limits verified for a non-exempt account:

```bash
curl -s -H "x-account-key: google_shadowinboxtest_gmail_com" \
  https://shadow-inbox-production.up.railway.app/api/user/ai-usage | python3 -m json.tool
```

  - [ ] `exempt: false`, limits `25` / `10` / `15`
  - [ ] Operator account shows `exempt: true`

- [ ] Client never calls OpenAI directly:

```bash
chmod +x scripts/verify-no-client-openai.sh
./scripts/verify-no-client-openai.sh
```

---

## Phase 2 — Observability & incident response

- [ ] Sentry project created; DSN copied
- [ ] `EXPO_PUBLIC_SENTRY_DSN` set in **EAS production** env (not Railway).  
  Use **plain text** or **sensitive** visibility — not **secret**. Any `EXPO_PUBLIC_*` var is embedded in the app bundle; the Sentry DSN is meant to be client-visible (not a private key).

```bash
npx eas-cli env:create \
  --name EXPO_PUBLIC_SENTRY_DSN \
  --value "https://…@….ingest.sentry.io/…" \
  --environment production \
  --visibility plaintext \
  --force
```

Or set it in [expo.dev](https://expo.dev) → Project → Environment variables → production → visibility **Plain text**.

- [ ] New production build shipped **after** Sentry env is set (DSN is baked in at build time)
- [ ] Send a test event: **Settings → SEND SENTRY TEST EVENT** → confirm issue appears in Sentry → **Issues** within ~1 minute
- [ ] Know how to check Railway logs and `/health` during an incident
- [ ] Support contact ready (email or URL in store listing — see [store-listing.md](./store-listing.md))

---

## Phase 3 — Google OAuth & user access

Choose **one** path before adding users:

### Option A — Closed beta (consent screen in Testing)

- [ ] Google Cloud → **OAuth consent screen** stays in **Testing**
- [ ] Every tester Gmail added under **Test users**
- [ ] Wait 5–10 minutes after adding users before they sign in
- [ ] Communicate to testers: “You must use a Gmail on the test-user list”

### Option B — Public / open beta (recommended before wide release)

- [ ] OAuth consent screen moved to **Production**
- [ ] App verification completed if Google requests it (sensitive scopes)
- [ ] Privacy policy URL matches store listing  
  https://shadow-inbox-production.up.railway.app/docs/privacy.html

---

## Phase 4 — Push notifications (Android)

Follow [push-setup.md](./push-setup.md). Summary:

- [ ] Firebase project `shadow-inbox-app`, package `com.saintjeromeiii.shadowinbox`
- [ ] **Play App Signing SHA-1** in Firebase (Play Console → App integrity)
- [ ] **EAS upload keystore SHA-1** in Firebase (`eas credentials -p android`)
- [ ] Google Cloud **Android API key** allows Firebase Installations + FCM; app restriction lists package + both SHA-1s
- [ ] FCM V1 service account uploaded to Expo project credentials
- [ ] `GOOGLE_SERVICES_JSON` secret set in EAS production (if not using committed file)
- [ ] Rebuild production AAB after fingerprint / `google-services.json` changes

**On device (production or internal-track install):**

- [ ] Settings → **AI STATUS** → **Push alerts: Active**
- [ ] Logs show `ExponentPushToken[...]` (not `FIS_AUTH_ERROR`)
- [ ] High-priority test email → notification arrives
- [ ] Tap notification → correct message / account opens
- [ ] Return from background → inbox refreshes

---

## Phase 5 — Production build

- [ ] `versionCode` / release notes updated for this ship
- [ ] Production AAB built:

```bash
npm run build:production:android
```

- [ ] AAB downloaded; SHA / build number recorded below
- [ ] Install via Play **Internal testing** (or closed track) — do not skip real Play signing

| Field | Value |
| --- | --- |
| Build number (`versionCode`) | |
| Git commit | |
| EAS build URL | |
| Date | |

---

## Phase 6 — Device smoke test (physical Android)

Install the **same build** you will give users (internal track or production AAB). Full detail: [device-smoke-test.md](./device-smoke-test.md).

### Account & onboarding

- [ ] Fresh install or **Settings → Clear local data**
- [ ] **Press Start** + onboarding complete
- [ ] Gmail connect via Google sign-in succeeds
- [ ] Settings → **AI STATUS** shows live mode and daily limits

### Inbox & triage

- [ ] Pull to refresh — inbox loads from relay
- [ ] Auto-triage runs (categories / urgency / **reason labels** e.g. Billing, Reply needed)
- [ ] Search bar filters messages
- [ ] Quick filter chips work (including **Snoozed** when items are snoozed)
- [ ] Tap message — detail expands
- [ ] Quick replies (3 options) generate
- [ ] Edit draft → **Redraft** with tone — draft updates
- [ ] **Archive** / **Trash** — message leaves inbox; XP / daily goal updates
- [ ] **Undo** bar appears (~5s) — undo restores message; Gmail sync deferred until window ends
- [ ] **Snooze** (card button) — message hidden from main feed
- [ ] **Swipe-to-snooze** (if configured in Settings → swipe actions)
- [ ] Snoozed chip shows snoozed items; clearing snooze or waiting for expiry resurfaces with badge
- [ ] Swipe archive/trash (if configured) matches Settings

### Intel & arcade

- [ ] **Intel Deck** — executive briefing loads or generates
- [ ] Dismiss briefing — stays hidden for the day
- [ ] Clear **Action required** → Inbox Zero / bonus hub unlocks (Gmail connected)
- [ ] At least one bonus minigame completes without crash

### AI limits (non-exempt account)

- [ ] Settings shows finite limits (not “Unlimited”)
- [ ] Heavy use surfaces “Daily AI limit reached” on redraft/replies

### Regression

- [ ] Fighter select video/audio on intro and **Change Fighter**
- [ ] No `stopAllCharacterIntroAmbience` error on home load
- [ ] `./scripts/verify-no-client-openai.sh` passes

### Sign-off

| Date | Device model | Build (`versionCode`) | Result | Tester | Notes |
| --- | --- | --- | --- | --- | --- |
| | | | ☐ Pass / ☐ Fail | | |

---

## Phase 7 — Play Store listing

Copy from [store-listing.md](./store-listing.md). Before submit:

- [ ] Short + full description updated (snooze, undo, reason labels, server-side AI)
- [ ] Privacy policy URL live
- [ ] Support URL live
- [ ] Screenshots captured (dark theme, store sizes):
  1. Home / triaged inbox with reason labels
  2. Message detail + quick replies
  3. Snooze or swipe actions (optional)
  4. Intel Deck briefing
  5. Settings — AI status + profile
- [ ] Content rating questionnaire complete
- [ ] Data safety form matches privacy policy (email processed server-side for AI)
- [ ] Microphone / optional voice features disclosed if enabled

**Suggested release notes (customize per build):**

- Gmail connect + AI triage on sync
- Snooze, undo, and “why this matters” labels
- Quick replies and tone-aware redrafts
- Daily goals, streaks, Inbox Zero bonus arcade
- Server-side AI with daily usage limits
- Privacy policy and onboarding

---

## Phase 8 — Staged rollout

Do not jump straight to 100% production traffic.

- [ ] Upload AAB to **Internal testing** → install on your device → Phase 6 pass
- [ ] Promote to **Closed testing** (waitlist / trusted testers)
- [ ] Monitor Sentry + Railway for 48–72 hours
- [ ] Promote to **Production** at **10%** → **50%** → **100%**
- [ ] Rollback plan: halt rollout in Play Console; hotfix branch ready

---

## Phase 9 — Operations & user expectations

- [ ] Waitlist flow tested: landing `POST /api/waitlist/signup` → `waitlist_signups` in Supabase
- [ ] Users know: email is processed on **your server** for triage/drafts (not on-device-only)
- [ ] Users know: **snooze is local to Shadow Inbox** (not Gmail-native snooze)
- [ ] Users know: disconnect Gmail in Settings removes local session
- [ ] Account deletion / data request process documented (even if manual at first)
- [ ] Optional: in-app **Report a problem** or feedback link in Settings

---

## Cost safety (reference)

| Layer | Protection |
| --- | --- |
| Per-user caps | 25 triage / 10 LLM / 15 embedding per day |
| Global pool | 100 triage / 40 LLM / 60 embedding per day |
| Operator exempt | `personal` account unlimited |
| OpenAI dashboard | Hard $ limit (manual) |
| RLS | Anon key cannot read/write app tables |

---

## Release gate

**Do not widen access until all are true:**

1. ☐ `npm run smoke:production` passes on deployed Railway
2. ☐ Migrations through `010` applied
3. ☐ Device smoke test **Pass** on target build
4. ☐ Sentry receiving events from that build
5. ☐ OAuth path chosen (test users **or** production consent)
6. ☐ Push **Active** on Play-signed install (if advertising alerts)
7. ☐ Play listing + privacy + support URLs live
8. ☐ Staged rollout plan in place

---

## Related docs

| Doc | Purpose |
| --- | --- |
| [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md) | Short operator summary |
| [beta-release.md](./beta-release.md) | Android beta build steps |
| [device-smoke-test.md](./device-smoke-test.md) | Detailed on-device steps |
| [push-setup.md](./push-setup.md) | Firebase / FCM / SHA-1 |
| [supabase-migrations.md](./supabase-migrations.md) | SQL migration order |
| [store-listing.md](./store-listing.md) | Play Store copy |
