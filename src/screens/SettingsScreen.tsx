import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
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
import { ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import PrivacyPolicyScreen from './PrivacyPolicyScreen';
import { useAccount } from '../context/AccountContext';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { removeRelayAccount } from '../services/authService';
import { hideAccountOnDevice, unhideAccountOnDevice } from '../services/accountStorage';
import { clearPersistedNotifications } from '../services/notificationStorage';
import { getRelayUrl } from '../services/emailService';
import { fetchUserProfile, saveUserProfile } from '../services/userProfileService';
import { setOnboardingComplete } from '../services/onboardingStorage';
import { setArcadeGateComplete } from '../services/sessionStorage';
import { refreshTriageMode, getTriageMode } from '../services/triageService';
import { fetchAiUsage, type AiUsageSummary } from '../services/aiUsageService';
import type { UserProfile } from '../types/userProfile';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface SettingsScreenProps {
  visible: boolean;
  onClose: () => void;
  variant?: 'modal' | 'screen';
  onOpenDrawer?: () => void;
}

const PRIVACY_URL = `${getRelayUrl()}/docs/privacy.html`;

export default function SettingsScreen({
  visible,
  onClose,
  variant = 'screen',
  onOpenDrawer,
}: SettingsScreenProps) {
  const { activeAccount, activeProfile, accounts, refreshAccounts, setActiveAccount } =
    useAccount();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [triageMode, setTriageMode] = useState(getTriageMode());
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchUserProfile();
      setProfile(next);
      setTriageMode(await refreshTriageMode());
      setAiUsage(await fetchAiUsage());
    } catch (error) {
      Alert.alert(
        'Profile Error',
        error instanceof Error ? error.message : 'Could not load profile.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void loadProfile();
  }, [visible, loadProfile]);

  const { signInWithGoogle, signOutFromGoogle, isSigningIn, isGoogleConfigured } =
    useGoogleSignIn({
      onSuccess: async (account) => {
        await unhideAccountOnDevice(account.key);
        await refreshAccounts();
        await setActiveAccount(account.key);
        await loadProfile();
      },
    });

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const saved = await saveUserProfile(profile);
      setProfile(saved);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Your operator profile was updated.');
    } catch (error) {
      Alert.alert('Save Failed', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectGoogle = () => {
    const oauthAccount = accounts.find((account) => account.oauth);
    if (!oauthAccount) {
      Alert.alert('No Google Account', 'No linked Gmail account on this device.');
      return;
    }

    Alert.alert(
      'Disconnect Gmail',
      `Remove ${oauthAccount.email} from Shadow Inbox on this device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await removeRelayAccount(oauthAccount.key);
              if (!result.success) {
                Alert.alert('Disconnect Failed', result.error ?? 'Could not disconnect.');
                return;
              }
              await signOutFromGoogle();
              await clearPersistedNotifications(oauthAccount.key);
              await hideAccountOnDevice(oauthAccount.key);
              const remaining = await refreshAccounts();
              if (activeAccount === oauthAccount.key) {
                await setActiveAccount(remaining[0]?.key ?? 'personal');
              }
              Alert.alert('Disconnected', 'Gmail was removed from this device.');
            })();
          },
        },
      ],
    );
  };

  const handleClearLocalData = () => {
    Alert.alert(
      'Clear Local Data',
      'Clears cached inbox messages and resets onboarding flags on this device. Your relay account data stays intact.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              for (const account of accounts) {
                await clearPersistedNotifications(account.key);
              }
              await setOnboardingComplete(false);
              await setArcadeGateComplete(false);
              Alert.alert('Cleared', 'Restart the app to run setup again.');
            })();
          },
        },
      ],
    );
  };

  const content = (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {variant === 'screen' && onOpenDrawer ? (
          <Pressable style={styles.menuButton} onPress={onOpenDrawer}>
            <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
          </Pressable>
        ) : null}
        <View>
          <Text style={styles.title}>SETTINGS</Text>
          <Text style={styles.subtitle}>Operator profile & privacy</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={22} color={arcadeColors.neonCyan} />
        </Pressable>
      </View>

      {loading || !profile ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={arcadeColors.neonCyan} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>AI STATUS</Text>
            <Text style={styles.metaText}>
              Mode: {triageMode === 'live' ? 'Live AI (server)' : 'Simulation fallback'}
            </Text>
            <Text style={styles.metaText}>Relay: {getRelayUrl()}</Text>
            <Text style={styles.metaText}>Account: {activeProfile.label}</Text>
            {aiUsage ? (
              <>
                <Text style={[styles.metaText, styles.usageHeading]}>DAILY AI LIMITS</Text>
                {aiUsage.exempt ? (
                  <Text style={styles.metaText}>Unlimited (operator account)</Text>
                ) : (
                  <>
                    <Text style={styles.metaText}>
                      Triage: {aiUsage.triage.used}/{aiUsage.triage.limit}
                    </Text>
                    <Text style={styles.metaText}>
                      Drafts & replies: {aiUsage.llm.used}/{aiUsage.llm.limit}
                    </Text>
                    <Text style={styles.metaText}>
                      Memory search: {aiUsage.embedding.used}/{aiUsage.embedding.limit}
                    </Text>
                  </>
                )}
              </>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>OPERATOR PROFILE</Text>
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.input}
              value={profile.displayName}
              onChangeText={(displayName) => setProfile({ ...profile, displayName })}
            />
            <Text style={styles.fieldLabel}>ROLE</Text>
            <TextInput
              style={styles.input}
              value={profile.roleTitle}
              onChangeText={(roleTitle) => setProfile({ ...profile, roleTitle })}
            />
            <Text style={styles.fieldLabel}>TONE</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={profile.toneNotes}
              onChangeText={(toneNotes) => setProfile({ ...profile, toneNotes })}
              multiline
            />
            <Pressable
              style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
              onPress={() => void handleSaveProfile()}
              disabled={saving}
            >
              <Text style={styles.primaryButtonText}>{saving ? 'SAVING…' : 'SAVE PROFILE'}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>GMAIL</Text>
            {isGoogleConfigured ? (
              <Pressable style={styles.secondaryButton} onPress={() => void signInWithGoogle()}>
                <Text style={styles.secondaryButtonText}>
                  {isSigningIn ? 'CONNECTING…' : 'CONNECT / SWITCH GMAIL'}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.metaText}>Google OAuth is not configured in this build.</Text>
            )}
            <Pressable style={styles.dangerButton} onPress={handleDisconnectGoogle}>
              <Text style={styles.dangerButtonText}>DISCONNECT GMAIL</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>PRIVACY & DATA</Text>
            <Pressable style={styles.linkRow} onPress={() => setPrivacyVisible(true)}>
              <Text style={styles.linkText}>View privacy policy in app</Text>
            </Pressable>
            <Pressable style={styles.linkRow} onPress={() => void Linking.openURL(PRIVACY_URL)}>
              <Text style={styles.linkText}>Open hosted privacy page</Text>
            </Pressable>
            <Pressable style={styles.dangerButton} onPress={handleClearLocalData}>
              <Text style={styles.dangerButtonText}>CLEAR LOCAL DATA</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      <Modal visible={privacyVisible} animationType="slide" onRequestClose={() => setPrivacyVisible(false)}>
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setPrivacyVisible(false)}>
              <Text style={styles.linkText}>CLOSE</Text>
            </Pressable>
          </View>
          <PrivacyPolicyScreen />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );

  if (variant === 'modal') {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        {content}
      </Modal>
    );
  }

  if (!visible) {
    return null;
  }

  return content;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: arcadeColors.borderCyan,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    marginRight: 8,
  },
  title: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    lineHeight: 14,
    color: arcadeColors.neonCyan,
  },
  subtitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textDim,
    marginTop: 2,
  },
  closeButton: { padding: 8 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 28 },
  card: {
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 20, 40, 0.82)',
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.neonPink,
  },
  fieldLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonCyan,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  metaText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textPrimary,
  },
  usageHeading: {
    marginTop: 8,
    color: arcadeColors.neonCyan,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: arcadeColors.neonCyan,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    color: arcadeColors.bgDeep,
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    color: arcadeColors.neonCyan,
  },
  dangerButton: {
    borderWidth: 2,
    borderColor: arcadeColors.neonPink,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  dangerButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    color: arcadeColors.neonPink,
  },
  linkRow: { paddingVertical: 6 },
  linkText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonCyan,
    textDecorationLine: 'underline',
  },
  modalSafeArea: { flex: 1, backgroundColor: arcadeColors.bgDeep },
  modalHeader: { padding: 16, alignItems: 'flex-end' },
});
