import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { exchangeGoogleAuthCode } from '../services/authService';
import { normalizeGoogleClientId } from '../utils/googleOAuthRedirect';
import type { AccountProfile } from '../types/account';

const PLACEHOLDER_CLIENT_IDS = new Set([
  '',
  'your_android_client_id.apps.googleusercontent.com',
  'your_google_android_client_id.apps.googleusercontent.com',
  'your_google_web_client_id.apps.googleusercontent.com',
]);

function isPlaceholderClientId(value: string): boolean {
  const normalized = normalizeGoogleClientId(value).toLowerCase();
  return PLACEHOLDER_CLIENT_IDS.has(normalized) || normalized.includes('your_');
}

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'openid',
  'email',
  'profile',
];

interface UseGoogleSignInOptions {
  onSuccess?: (account: AccountProfile) => void | Promise<void>;
}

export function useGoogleSignIn(options: UseGoogleSignInOptions = {}) {
  const webClientId = normalizeGoogleClientId(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const onSuccessRef = useRef(options.onSuccess);

  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
  }, [options.onSuccess]);

  useEffect(() => {
    if (!webClientId || isPlaceholderClientId(webClientId)) {
      return;
    }

    GoogleSignin.configure({
      webClientId,
      offlineAccess: true,
      forceCodeForRefreshToken: true,
      scopes: GMAIL_SCOPES,
    });
  }, [webClientId]);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Android Only',
        'Native Google sign-in is configured for the Android dev client.',
      );
      return;
    }

    if (!webClientId || isPlaceholderClientId(webClientId)) {
      Alert.alert(
        'Google OAuth Not Configured',
        'Create a Web OAuth client in Google Cloud Console, then set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env. Rebuild the Android dev client after updating env vars.',
      );
      return;
    }

    setIsSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();

      if (!isSuccessResponse(signInResult)) {
        return;
      }

      const serverAuthCode = signInResult.data.serverAuthCode;
      if (!serverAuthCode) {
        Alert.alert(
          'Google Sign-In Failed',
          'Google did not return a server auth code. Confirm EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is your Web application client ID (not the Android client ID), then rebuild the app.',
        );
        return;
      }

      const result = await exchangeGoogleAuthCode({
        code: serverAuthCode,
        clientId: webClientId,
        clientType: 'web',
      });

      if (!result.success || !result.account) {
        Alert.alert(
          'Google Sign-In Failed',
          result.error ?? 'Could not complete account linking on the relay.',
        );
        return;
      }

      await onSuccessRef.current?.(result.account);
    } catch (error) {
      if (isErrorWithCode(error)) {
        if (error.code === statusCodes.SIGN_IN_CANCELLED) {
          return;
        }

        if (error.code === statusCodes.IN_PROGRESS) {
          Alert.alert('Google Sign-In', 'Sign-in is already in progress.');
          return;
        }

        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          Alert.alert(
            'Google Play Services',
            'Google Play Services is missing or outdated on this device.',
          );
          return;
        }

        if (
          error.message.includes('DEVELOPER_ERROR') ||
          error.code === '10'
        ) {
          Alert.alert(
            'Google Sign-In: Developer Error',
            'Your Android OAuth client in Google Cloud Console does not match this APK.\n\n' +
              'Fix:\n' +
              '1. Credentials → Android OAuth client\n' +
              '2. Package: com.saintjeromeiii.shadowinbox\n' +
              '3. SHA-1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25\n' +
              '4. Web + Android clients must be in the same project\n' +
              '5. Run: node scripts/printGoogleOAuthConfig.js\n' +
              '6. Wait ~10 min, reinstall APK, try again',
          );
          return;
        }

        Alert.alert('Google Sign-In Failed', error.message);
        return;
      }

      Alert.alert(
        'Google Sign-In Failed',
        error instanceof Error
          ? error.message
          : 'Could not reach the email relay for OAuth exchange.',
      );
    } finally {
      setIsSigningIn(false);
    }
  }, [webClientId]);

  return {
    signInWithGoogle,
    isSigningIn,
    isGoogleConfigured:
      Boolean(webClientId) && !isPlaceholderClientId(webClientId),
  };
}
