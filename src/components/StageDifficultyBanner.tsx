import { View, Text, StyleSheet } from 'react-native';
import type { StageDifficulty } from '../utils/stageDifficulty';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface StageDifficultyBannerProps {
  difficulty: StageDifficulty;
  signalCount: number;
  folderLabel: string;
}

export default function StageDifficultyBanner({
  difficulty,
  signalCount,
  folderLabel,
}: StageDifficultyBannerProps) {
  return (
    <View style={[styles.wrapper, { borderColor: difficulty.color, shadowColor: difficulty.color }]}>
      <View style={[styles.glow, { backgroundColor: `${difficulty.color}22` }]} />
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <Text style={styles.kicker}>STAGE DIFFICULTY</Text>
          <View style={[styles.badge, { borderColor: difficulty.color }]}>
            <Text style={[styles.badgeText, { color: difficulty.color }]}>
              {difficulty.label}
            </Text>
          </View>
        </View>
        <Text style={[styles.folderLine, { color: difficulty.color }]}>
          {folderLabel.toUpperCase()} · {signalCount} SIGNAL{signalCount === 1 ? '' : 'S'}
        </Text>
        <Text style={styles.description}>{difficulty.description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 6,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  inner: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(10, 20, 40, 0.9)',
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kicker: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.textMuted,
    letterSpacing: 0.4,
  },
  badge: {
    borderWidth: 2,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: arcadeColors.bgDeep,
  },
  badgeText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    letterSpacing: 0.3,
  },
  folderLine: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 0.3,
  },
  description: {
    fontFamily: arcadeFonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: arcadeColors.textMuted,
  },
});
