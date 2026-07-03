import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PushSetupStatus } from '../context/PushStatusContext';
import { arcadeColors, arcadeTypography } from '../theme/arcadeTheme';

interface PushStatusBannerProps {
  status: PushSetupStatus;
  onDismiss?: () => void;
}

function buildCopy(status: PushSetupStatus): { title: string; body: string } | null {
  switch (status.state) {
    case 'fis_auth_error':
      return {
        title: 'Push alerts unavailable',
        body: 'Firebase could not verify this build. Fix SHA-1 + google-services.json in Firebase, then rebuild the app.',
      };
    case 'permission_denied':
      return {
        title: 'Notifications disabled',
        body: 'Enable notifications in system settings to get urgent email alerts.',
      };
    case 'no_project_id':
      return {
        title: 'Push not configured',
        body: 'Missing Expo project ID — EAS builds are required for device push tokens.',
      };
    case 'simulator':
      return {
        title: 'Push requires a physical device',
        body: 'Install the dev build on your phone to test urgent email alerts.',
      };
    default:
      return null;
  }
}

export default function PushStatusBanner({ status, onDismiss }: PushStatusBannerProps) {
  const copy = buildCopy(status);
  if (!copy) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <Ionicons name="notifications-off-outline" size={18} color="#FFB4B4" />
      <View style={styles.copy}>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.body}>{copy.body}</Text>
      </View>
      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="Dismiss push setup notice"
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color="#8B93A8" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 138, 138, 0.35)',
    backgroundColor: 'rgba(255, 138, 138, 0.08)',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...arcadeTypography.retroMeta,
    color: '#FFB4B4',
    fontWeight: '700',
  },
  body: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textMuted,
    lineHeight: 16,
  },
});
