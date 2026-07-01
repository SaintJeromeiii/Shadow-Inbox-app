import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAccount } from '../context/AccountContext';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import PrivacyPolicyScreen from './PrivacyPolicyScreen';
import { setOnboardingComplete } from '../services/onboardingStorage';
import {
  saveUserProfile,
} from '../services/userProfileService';
import { unhideAccountOnDevice } from '../services/accountStorage';
import type { UserProfile } from '../types/userProfile';
import { TONE_PRESETS } from '../types/userProfile';
import { arcadeColors, arcadeFonts, neonCyanText, neonPinkText } from '../theme/arcadeTheme';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const STEPS = ['WELCOME', 'VOICE', 'GMAIL', 'PRIVACY'] as const;

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { refreshAccounts, setActiveAccount } = useAccount();
  const [stepIndex, setStepIndex] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [email, setEmail] = useState('');
  const [toneNotes, setToneNotes] = useState(TONE_PRESETS[0].text);
  const [signOff, setSignOff] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gmailLinked, setGmailLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  const handleGoogleLinked = useCallback(
    async (account: { key: string; email: string }) => {
      await unhideAccountOnDevice(account.key);
      await refreshAccounts();
      await setActiveAccount(account.key);
      setEmail(account.email);
      setGmailLinked(true);
    },
    [refreshAccounts, setActiveAccount],
  );

  const { signInWithGoogle, isSigningIn, isGoogleConfigured } = useGoogleSignIn({
    onSuccess: handleGoogleLinked,
  });

  const canContinue = useMemo(() => {
    if (step === 'WELCOME') {
      return displayName.trim().length >= 2 && roleTitle.trim().length >= 2;
    }
    if (step === 'VOICE') {
      return toneNotes.trim().length >= 12;
    }
    if (step === 'GMAIL') {
      return true;
    }
    return acceptedPrivacy;
  }, [acceptedPrivacy, displayName, roleTitle, step, toneNotes]);

  const goNext = () => {
    if (!canContinue) return;
    void Haptics.selectionAsync();
    setError(null);
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  };

  const goBack = () => {
    void Haptics.selectionAsync();
    setError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  const finishOnboarding = async () => {
    if (!acceptedPrivacy || saving) return;

    setSaving(true);
    setError(null);

    try {
      const profile: UserProfile = {
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        roleTitle: roleTitle.trim(),
        toneNotes: toneNotes.trim(),
        signOff: signOff.trim(),
        knowledgeText: '',
        onboardingCompleted: true,
      };

      await saveUserProfile(profile);
      await setOnboardingComplete(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : 'Could not save your profile. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.kicker}>SHADOW INBOX</Text>
          <Text style={styles.heading}>Operator setup</Text>
          <Text style={styles.stepLabel}>
            STEP {stepIndex + 1}/{STEPS.length} · {step}
          </Text>
          <View style={styles.rule} />

          {step === 'WELCOME' ? (
            <View style={styles.block}>
              <Text style={styles.copy}>
                Tell us who you are so triage and drafts sound like you — not a generic bot.
              </Text>
              <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Alex Morgan"
                placeholderTextColor={arcadeColors.textDim}
                autoCapitalize="words"
              />
              <Text style={styles.fieldLabel}>ROLE / TITLE</Text>
              <TextInput
                style={styles.input}
                value={roleTitle}
                onChangeText={setRoleTitle}
                placeholder="Founder, PM, analyst..."
                placeholderTextColor={arcadeColors.textDim}
                autoCapitalize="sentences"
              />
              <Text style={styles.fieldLabel}>EMAIL (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                placeholderTextColor={arcadeColors.textDim}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          ) : null}

          {step === 'VOICE' ? (
            <View style={styles.block}>
              <Text style={styles.copy}>
                Pick a tone preset or edit it. This shapes every AI draft Shadow Inbox writes.
              </Text>
              <View style={styles.presetRow}>
                {TONE_PRESETS.map((preset) => {
                  const selected = toneNotes === preset.text;
                  return (
                    <Pressable
                      key={preset.id}
                      style={[styles.presetChip, selected && styles.presetChipSelected]}
                      onPress={() => setToneNotes(preset.text)}
                    >
                      <Text
                        style={[styles.presetChipText, selected && styles.presetChipTextSelected]}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.fieldLabel}>COMMUNICATION TONE</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={toneNotes}
                onChangeText={setToneNotes}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.fieldLabel}>SIGN-OFF (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={signOff}
                onChangeText={setSignOff}
                placeholder="- Alex"
                placeholderTextColor={arcadeColors.textDim}
              />
            </View>
          ) : null}

          {step === 'GMAIL' ? (
            <View style={styles.block}>
              <Text style={styles.copy}>
                Connect Gmail to pull your real inbox. You can skip and link later from the inbox
                screen.
              </Text>
              {gmailLinked ? (
                <View style={styles.linkedBanner}>
                  <Ionicons name="checkmark-circle" size={18} color={arcadeColors.neonGreen} />
                  <Text style={styles.linkedText}>Gmail linked{email ? `: ${email}` : ''}</Text>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.googleButton,
                    pressed && styles.googleButtonPressed,
                    (!isGoogleConfigured || isSigningIn) && styles.googleButtonDisabled,
                  ]}
                  onPress={() => void signInWithGoogle()}
                  disabled={!isGoogleConfigured || isSigningIn}
                >
                  {isSigningIn ? (
                    <ActivityIndicator color={arcadeColors.bgDeep} size="small" />
                  ) : (
                    <Text style={styles.googleButtonText}>CONNECT GMAIL</Text>
                  )}
                </Pressable>
              )}
              {!isGoogleConfigured ? (
                <Text style={styles.hint}>
                  Google OAuth is not configured in this build. Skip for now and add your account
                  later.
                </Text>
              ) : null}
            </View>
          ) : null}

          {step === 'PRIVACY' ? (
            <View style={styles.block}>
              <Text style={styles.copy}>
                Shadow Inbox reads your email to triage and draft replies. AI runs on our server —
                your API keys stay off your phone.
              </Text>
              <Pressable onPress={() => setPrivacyVisible(true)} style={styles.policyLink}>
                <Text style={styles.policyLinkText}>Read full privacy policy</Text>
              </Pressable>
              <Pressable
                style={styles.privacyRow}
                onPress={() => setAcceptedPrivacy((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedPrivacy }}
              >
                <Ionicons
                  name={acceptedPrivacy ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={acceptedPrivacy ? arcadeColors.neonCyan : arcadeColors.textDim}
                />
                <Text style={styles.privacyLabel}>
                  I agree to the Privacy Policy and understand my email is processed to provide
                  triage and drafts.
                </Text>
              </Pressable>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            {stepIndex > 0 ? (
              <Pressable onPress={goBack} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>BACK</Text>
              </Pressable>
            ) : (
              <View style={styles.actionSpacer} />
            )}

            {step === 'PRIVACY' ? (
              <Pressable
                onPress={() => void finishOnboarding()}
                disabled={!canContinue || saving}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (!canContinue || saving) && styles.primaryButtonDisabled,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={arcadeColors.bgDeep} size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>ENTER SHADOW INBOX</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={goNext}
                disabled={!canContinue}
                style={({ pressed }) => [
                  styles.primaryButton,
                  !canContinue && styles.primaryButtonDisabled,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>CONTINUE</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={privacyVisible} animationType="slide" onRequestClose={() => setPrivacyVisible(false)}>
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setPrivacyVisible(false)}>
              <Text style={styles.modalClose}>CLOSE</Text>
            </Pressable>
          </View>
          <PrivacyPolicyScreen />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 12,
  },
  kicker: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 1,
    textAlign: 'center',
    ...neonPinkText(),
  },
  heading: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    ...neonCyanText(),
  },
  stepLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.textDim,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  rule: {
    height: 2,
    backgroundColor: arcadeColors.borderCyan,
    opacity: 0.5,
    marginVertical: 4,
  },
  block: {
    gap: 10,
    paddingTop: 4,
  },
  copy: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 12,
    color: arcadeColors.textPrimary,
  },
  fieldLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  input: {
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 8,
    backgroundColor: arcadeColors.bgPanel,
    color: arcadeColors.textPrimary,
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiline: {
    minHeight: 96,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(10, 20, 40, 0.7)',
  },
  presetChipSelected: {
    borderColor: arcadeColors.neonCyan,
    backgroundColor: 'rgba(0, 255, 255, 0.12)',
  },
  presetChipText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textDim,
  },
  presetChipTextSelected: {
    color: arcadeColors.neonCyan,
  },
  googleButton: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: arcadeColors.neonCyan,
    paddingVertical: 14,
    alignItems: 'center',
  },
  googleButtonPressed: {
    opacity: 0.85,
  },
  googleButtonDisabled: {
    opacity: 0.5,
  },
  googleButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.bgDeep,
    letterSpacing: 0.4,
  },
  linkedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: arcadeColors.neonGreen,
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'rgba(0, 255, 128, 0.08)',
  },
  linkedText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonGreen,
    flex: 1,
  },
  hint: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textDim,
  },
  policyLink: {
    paddingVertical: 4,
  },
  policyLinkText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonCyan,
    textDecorationLine: 'underline',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
  },
  privacyLabel: {
    flex: 1,
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 12,
    color: arcadeColors.textPrimary,
  },
  error: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonPink,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 'auto',
    paddingTop: 20,
  },
  actionSpacer: {
    width: 88,
  },
  secondaryButton: {
    minWidth: 88,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 8,
  },
  secondaryButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonCyan,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: arcadeColors.neonPink,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.bgDeep,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: arcadeColors.bgDeep,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  modalClose: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonCyan,
  },
});
