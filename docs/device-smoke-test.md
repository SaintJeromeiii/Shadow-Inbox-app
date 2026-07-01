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

Sign in with a **non-personal** Gmail account (or ask a friend):

- [ ] Settings shows non-exempt limits (not “Unlimited”)
- [ ] Heavy use eventually shows “Daily AI limit reached” on redraft/replies

## Regression

- [ ] Fighter select video/audio plays on character screen
- [ ] Home screen loads without `stopAllCharacterIntroAmbience` error
- [ ] No client-side OpenAI key in app bundle (AI only via relay)

## Sign-off

| Date | Device | Result | Notes |
| --- | --- | --- | --- |
| | | ☐ Pass / ☐ Fail | |
