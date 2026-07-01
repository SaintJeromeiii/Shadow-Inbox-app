# Shadow Inbox Privacy Policy

**Last updated:** June 30, 2026

Shadow Inbox ("the app") helps you triage email, draft replies, and clear your inbox. This policy explains what we collect, how we use it, and your choices.

## What we collect

- **Email content** you connect via Google OAuth (subject, body, sender, timestamps) to power triage, drafts, archive, and trash actions.
- **Account identifiers** such as your Gmail address and an internal account key.
- **Profile information** you provide during onboarding (name, role, communication preferences).
- **Knowledge Core notes** you add to personalize AI triage and drafts.
- **Usage data** such as deletion counts, character progress, and automation logs needed for app features.
- **Device push tokens** if you enable notifications.

## How we use data

- Sort messages into action-required, FYI, and low-priority categories.
- Generate reply drafts in your voice using AI.
- Send replies, archive, and trash messages when you confirm those actions.
- Sync labels and inbox state with Gmail.
- Deliver push alerts for new action-required items (if enabled).

## Third-party services

Shadow Inbox may send data to:

- **Google** — Gmail OAuth, inbox sync, and send/archive/trash via Gmail API.
- **OpenAI (or compatible LLM provider)** — message triage and draft generation on our server. Message content is sent only to generate categorization and reply suggestions.
- **Supabase** — cloud storage for OAuth tokens, inbox cache, user profiles, and progress when configured.
- **Railway (or your configured relay host)** — backend API that processes inbox operations.

We do not sell your personal data.

## Data retention

- Inbox messages and triage results are stored on your configured relay backend and on your device cache.
- OAuth tokens are stored server-side to maintain Gmail access until you disconnect.
- You can disconnect Google from the app and clear local cached messages on your device.

## Security

- OAuth tokens are stored server-side; API keys for AI are kept on the server, not in the mobile app.
- Use a strong Google account and keep your device secure.

## Your choices

- **Disconnect Gmail** at any time from account settings in the app.
- **Edit or remove** Knowledge Core notes that shape AI behavior.
- **Disable notifications** in system settings.

## Children's privacy

Shadow Inbox is not intended for users under 13.

## Changes

We may update this policy as the app evolves. Continued use after changes means you accept the updated policy.

## Contact

Questions about privacy: contact the app operator through your Shadow Inbox support channel or repository maintainer.
