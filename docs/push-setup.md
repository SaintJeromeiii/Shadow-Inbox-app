# Android Push Setup

Shadow Inbox uses **Expo push tokens** backed by **Firebase Cloud Messaging (FCM)** on Android.

## Quick checklist

1. Firebase project: **`shadow-inbox-app`** (`52549680215`)
2. Android app package: `com.saintjeromeiii.shadowinbox`
3. Add **debug SHA-1** (local `expo run:android` builds):

   ```
   5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
   ```

4. Add **Play App Signing SHA-1** (Play Internal Testing / production installs):

   ```
   BE:DD:90:86:88:AE:9D:BA:B8:97:44:88:75:E8:63:1F:29:D3:2B:0C
   ```

   Source: Play Console → **Test and release → App integrity → App signing key certificate**

5. Add **SHA-256** (debug, for local builds):

   ```
   FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C
   ```

6. Download `google-services.json` → copy to project root **and** `android/app/`
7. Fix API key in [Google Cloud → shadow-inbox-app → Credentials](https://console.cloud.google.com/apis/credentials?project=shadow-inbox-app):
   - Open the **Android key** whose value matches `client.api_key.current_key` in your local `google-services.json` (do not commit that file)
   - Enable **Firebase Installations API** + **Firebase Cloud Messaging API**
   - Application restrictions: **None** (testing) or Android app + SHA-1 above
8. Rebuild from repo root (not `android/`):

   ```bash
   npx expo run:android --device
   ```

## Empty `oauth_client` in google-services.json

**Normal.** Gmail OAuth lives in a separate Google Cloud project (`1097406504040`). Push uses `api_key` + SHA fingerprints, not `oauth_client`.

## Yellow SHA-1 warning in Firebase

Means the same SHA-1 is also registered on your OAuth project. You can ignore it for push testing.

## Verify on device

Logs should show:

```text
[Push Token Generated]: ExponentPushToken[...]
```

Settings → **AI STATUS → Push alerts: Active**

If misconfigured, Home shows a dismissible banner instead of silently using a mock token.

## EAS / Play Store builds

Add **each** signing certificate SHA-1 to Firebase:

| Build | SHA-1 source |
| --- | --- |
| EAS preview/APK | `eas credentials -p android` |
| Play internal | Play Console → App integrity → App signing key |

Re-download `google-services.json` after adding fingerprints.

## Do not use `./gradlew clean`

On React Native new architecture it can break CMake codegen. To refresh native caches:

```bash
rm -rf android/app/.cxx android/app/build android/build
npx expo run:android --device
```
