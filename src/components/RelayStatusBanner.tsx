import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { arcadeColors, arcadeTypography } from '../theme/arcadeTheme';

interface RelayStatusBannerProps {
  message: string;
  stale?: boolean;
}

export default function RelayStatusBanner({ message, stale = true }: RelayStatusBannerProps) {
  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={18} color="#FFD28A" />
      <View style={styles.copy}>
        <Text style={styles.title}>
          {stale ? 'Showing cached inbox' : 'Relay unreachable'}
        </Text>
        <Text style={styles.body}>{message}</Text>
      </View>
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
    borderColor: 'rgba(255, 210, 138, 0.35)',
    backgroundColor: 'rgba(255, 210, 138, 0.08)',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...arcadeTypography.retroMeta,
    color: '#FFD28A',
    fontWeight: '700',
  },
  body: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textMuted,
    lineHeight: 16,
  },
});
