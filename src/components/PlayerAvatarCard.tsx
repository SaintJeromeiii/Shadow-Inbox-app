import { View, Text, StyleSheet } from 'react-native';
import type { PlayerStats } from '../types/userProgress';
import DynamicAvatar from './DynamicAvatar';
import { useCharacter } from '../context/CharacterContext';
import { getCharacterVisualTierAssets } from '../constants/characters';
import { getVisualTierFromInboxCount } from '../utils/visualTier';
import {
  arcadeColors,
  arcadePanel,
  arcadeTypography,
} from '../theme/arcadeTheme';

interface PlayerAvatarCardProps {
  stats: PlayerStats;
  inboxCount?: number;
  enableIntro?: boolean;
  replayToken?: number;
}

export default function PlayerAvatarCard({
  stats,
  inboxCount = 0,
  enableIntro = false,
  replayToken = 0,
}: PlayerAvatarCardProps) {
  const { character, characterId } = useCharacter();
  const progressPercent = Math.round(stats.progress * 100);
  const progressLabel = stats.maxTier
    ? 'MAX TIER UNLOCKED'
    : `${stats.deletesToNext} clears to ${stats.nextTierName?.toUpperCase() ?? 'NEXT TIER'}`;

  const visualTier = getVisualTierFromInboxCount(inboxCount, character.maxVisualTier);
  const visualArmorLabel = getCharacterVisualTierAssets(characterId, visualTier).label;

  return (
    <View style={styles.wrapper}>
      <View style={styles.glow} />
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <Text style={styles.kicker}>PLAYER PROFILE</Text>
          <Text style={styles.levelBadge}>LVL {stats.tier}</Text>
        </View>

        <Text style={styles.codename}>{character.codename}</Text>
        <Text style={styles.tierName}>{visualArmorLabel}</Text>
        <Text style={styles.deletionCount}>{stats.totalDeletions} ARCHIVES / DELETES</Text>

        <View style={styles.avatarFrame}>
          <DynamicAvatar
            inboxCount={inboxCount}
            enableIntro={enableIntro}
            replayToken={replayToken}
          />
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>XP TO NEXT ARMOR</Text>
            <Text style={styles.progressValue}>{progressPercent}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressHint}>{progressLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: 56,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 102, 204, 0.14)',
  },
  panel: {
    ...arcadePanel('pink'),
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kicker: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.neonPink,
  },
  levelBadge: {
    ...arcadeTypography.pixelSubtitle,
    color: arcadeColors.neonCyan,
    fontSize: 8,
  },
  codename: {
    ...arcadeTypography.pixelTitle,
    marginBottom: 4,
  },
  tierName: {
    ...arcadeTypography.pixelTitlePink,
    fontSize: 8,
    lineHeight: 12,
    marginBottom: 4,
  },
  deletionCount: {
    ...arcadeTypography.retroMeta,
    marginBottom: 12,
  },
  avatarFrame: {
    width: '100%',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    borderRadius: 8,
    backgroundColor: arcadeColors.bgPanelElevated,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
  progressSection: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.textMuted,
  },
  progressValue: {
    ...arcadeTypography.retroMeta,
    color: arcadeColors.neonCyan,
    fontWeight: '700',
  },
  progressTrack: {
    height: 10,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgDeep,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: arcadeColors.neonPink,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  progressHint: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textMuted,
  },
});
