# Android Beta Release

**Master checklist:** [RELEASE_READINESS.md](./RELEASE_READINESS.md)

## Prerequisites

- [ ] Production smoke test passes: `npm run smoke:production`
- [ ] `./scripts/verify-no-client-openai.sh` passes
- [ ] Supabase migrations applied (see `docs/supabase-migrations.md`)
- [ ] Push configured on device (see `docs/push-setup.md`)
- [ ] Device smoke test signed off (`docs/device-smoke-test.md`)

## Build a preview APK for testers

```bash
npm run build:preview:android
```

Install the APK from the EAS build page, or upload to Play Console **Internal testing**.

### Firebase for EAS builds

After the first EAS Android build, add the **EAS keystore SHA-1** to Firebase:

```bash
eas credentials -p android
```

Then re-download `google-services.json` and rebuild.

## OAuth test users

While the consent screen is in **Testing** mode, add each tester Gmail under:

Google Cloud Console → **OAuth consent screen → Test users**

Wait 5–10 minutes before they sign in.

## Waitlist

Landing page waitlist posts to `/api/waitlist/signup`. Emails persist in Supabase (`waitlist_signups`) when configured.

## Sentry

Set `EXPO_PUBLIC_SENTRY_DSN` in EAS env for crash reports from beta builds.

## Railway deploy

```bash
railway up
```

Or push to the branch connected to Railway. Confirm `/health` returns 200 after deploy.
