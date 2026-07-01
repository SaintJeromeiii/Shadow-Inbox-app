# Device Smoke Test

Run on a **physical device** with a production or preview build (`npx expo run:android --device`).

## Account setup

1. Fresh install or **Settings → Clear local data** then restart.
2. Complete **Press Start** (first time only).
3. **Onboarding**: enter profile, connect Gmail via Google sign-in.
4. Confirm **Settings → AI STATUS** shows live mode and daily limits.

## Inbox flow

- [ ] Pull to refresh — inbox loads from relay
- [ ] Auto-triage runs (messages get categories / urgency)
- [ ] Tap a message — expand detail
- [ ] **Quick replies** generate three options
- [ ] Edit draft → **Redraft** with a tone — draft updates
- [ ] **Archive** or **Trash** — message leaves inbox, XP updates
- [ ] Daily goal / streak banner updates after clearing mail

## Intel & briefing

- [ ] Open **Intel Deck** — executive briefing loads or generates
- [ ] Dismiss briefing — stays hidden for the day

## Push (if configured)

- [ ] Send yourself a high-priority test email
- [ ] Tap push notification — app opens correct message / account

## AI limits (second Gmail account)

Google OAuth blocks sign-in for emails **not** on your consent screen test list while the app is in **Testing** mode. You do **not** need Play Store publication for this — only add the tester in Google Cloud Console.

### Allow `shadowinboxtest@gmail.com` (or any tester)

1. [Google Cloud Console](https://console.cloud.google.com/) → same project as your OAuth clients
2. **APIs & Services → OAuth consent screen**
3. Under **Test users** → **+ Add users** → `shadowinboxtest@gmail.com`
4. **Save**, wait 5–10 minutes
5. On device: disconnect Gmail in Settings, sign in with that account

If you still see “app blocked” / “in testing”, the signed-in Gmail is not on that list yet (or Google hasn’t propagated the change).

### On device (after test user is added)

- [ ] Settings shows non-exempt limits (not “Unlimited”)
- [ ] Heavy use eventually shows “Daily AI limit reached” on redraft/replies

### Alternative — no second sign-in (API only)

Verify caps from your Mac without a second Google account:

```bash
curl -s -H "x-account-key: google_shadowinboxtest_gmail_com" \
  https://shadow-inbox-production.up.railway.app/api/user/ai-usage | python3 -m json.tool
```

`exempt` should be `false` and limits should show `25` / `10` / `15`. Your `personal` account should show `exempt: true`.

## Regression

- [ ] Fighter select video/audio plays on character screen
- [ ] Home screen loads without `stopAllCharacterIntroAmbience` error
- [ ] No client-side OpenAI key in app bundle (AI only via relay)

## Sign-off

| Date | Device | Result | Notes |
| --- | --- | --- | --- |
| | | ☐ Pass / ☐ Fail | |
