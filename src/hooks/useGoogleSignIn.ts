import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { exchangeGoogleAuthCode } from '../services/authService';
import type { AccountProfile } from '../types/account';

WebBrowser.maybeCompleteAuthSession();

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'openid',
  'email',
  'profile',
];

/** Native Android redirect — package-based, no Web Client redirect URI needed. */
export function getGoogleNativeRedirectUri(): string {
  const applicationId =
    Application.applicationId ?? 'com.saintjeromeiii.shadowinbox';

  return AuthSession.makeRedirectUri({
    native: `${applicationId}:/oauthredirect`,
  });
}

interface UseGoogleSignInOptions {
  onSuccess?: (account: AccountProfile) => void | Promise<void>;
}

export function useGoogleSignIn(options: UseGoogleSignInOptions = {}) {
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '';
  const [isSigningIn, setIsSigningIn] = useState(false);
  const handledCodeRef = useRef<string | null>(null);
  const onSuccessRef = useRef(options.onSuccess);

  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
  }, [options.onSuccess]);

  const [request, response, promptAsync] = Google.useAuthRequest(
    {
      androidClientId,
      scopes: GMAIL_SCOPES,
      shouldAutoExchangeCode: false,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
    {
      native: `${Application.applicationId ?? 'com.saintjeromeiii.shadowinbox'}:/oauthredirect`,
    },
  );

  const nativeRedirectUri = request?.redirectUri ?? getGoogleNativeRedirectUri();

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error') {
        setIsSigningIn(false);
        Alert.alert(
          'Google Sign-In Failed',
          response.error?.message ?? 'Authorization was cancelled or denied.',
        );
      }
      return;
    }

    const code = response.params.code;
    if (!code || handledCodeRef.current === code) {
      return;
    }

    handledCodeRef.current = code;

    void (async () => {
      setIsSigningIn(true);
      try {
        const result = await exchangeGoogleAuthCode({
          code,
          redirectUri: nativeRedirectUri,
          codeVerifier: request?.codeVerifier,
          clientId: androidClientId,
          clientType: 'android',
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
        Alert.alert(
          'Google Sign-In Failed',
          error instanceof Error
            ? error.message
            : 'Could not reach the email relay for OAuth exchange.',
        );
      } finally {
        setIsSigningIn(false);
      }
    })();
  }, [androidClientId, nativeRedirectUri, request?.codeVerifier, response]);

  const signInWithGoogle = useCallback(async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Android Only',
        'Native Google sign-in is configured for the Android dev client.',
      );
      return;
    }

    if (!androidClientId) {
      Alert.alert(
        'Google OAuth Not Configured',
        'Add EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID to your .env, then restart Expo.',
      );
      return;
    }

    if (!request) {
      Alert.alert('Google Sign-In', 'OAuth request is still initializing. Try again.');
      return;
    }

    setIsSigningIn(true);
    try {
      await promptAsync({
        showInRecents: true,
        preferEphemeralSession: false,
      });
    } finally {
      if (response?.type !== 'success') {
        setIsSigningIn(false);
      }
    }
  }, [androidClientId, promptAsync, request, response?.type]);

  return {
    signInWithGoogle,
    isSigningIn,
    isGoogleConfigured: Boolean(androidClientId),
    redirectUri: nativeRedirectUri,
  };
}
