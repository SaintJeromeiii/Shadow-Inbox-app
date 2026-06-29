import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import { useAccount } from '../context/AccountContext';
import { useCharacter } from '../context/CharacterContext';
import {
  getComingSoonCharacters,
  getUnlockedCharacterIds,
  getUnlockedCharacters,
} from '../constants/characters';
import { fetchAllCharacterStats } from '../services/userProgressService';
import type { CharacterId, CharacterRegistryEntry } from '../types/character';
import type { PlayerStats } from '../types/userProgress';
import { buildPlayerStats } from '../utils/playerProgress';
import { arcadeColors, arcadeFonts, arcadeTypography } from '../theme/arcadeTheme';

interface CharacterRankingScreenProps {
  onOpenDrawer: () => void;
}

interface RankedFighter {
  entry: CharacterRegistryEntry;
  stats: PlayerStats;
  rank: number;
}

const RANK_COLORS = ['#FFE066', '#C0C8D8', '#CD7F32'] as const;

function CharacterProgressBar({ stats }: { stats: PlayerStats }) {
  const percent = Math.round(stats.progress * 100);

  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.progressMeta}>
        {stats.tierName.toUpperCase()} · {percent}% · {stats.totalDeletions} CLEARS
      </Text>
    </View>
  );
}

export default function CharacterRankingScreen({ onOpenDrawer }: CharacterRankingScreenProps) {
  const { activeAccount } = useAccount();
  const { characterId } = useCharacter();
  const [loading, setLoading] = useState(true);
  const [progressByCharacter, setProgressByCharacter] = useState<
    Partial<Record<CharacterId, PlayerStats>>
  >({});

  const unlockedIds = useMemo(() => getUnlockedCharacterIds(), []);

  const loadRankings = useCallback(async () => {
    setLoading(true);
    try {
      const statsMap = await fetchAllCharacterStats(activeAccount, unlockedIds);
      setProgressByCharacter(statsMap);
    } finally {
      setLoading(false);
    }
  }, [activeAccount, unlockedIds]);

  useEffect(() => {
    void loadRankings();
  }, [loadRankings]);

  const rankedFighters = useMemo<RankedFighter[]>(() => {
    const rows = getUnlockedCharacters().map((entry) => ({
      entry,
      stats: progressByCharacter[entry.id] ?? buildPlayerStats(0),
    }));

    rows.sort((a, b) => {
      if (b.stats.totalDeletions !== a.stats.totalDeletions) {
        return b.stats.totalDeletions - a.stats.totalDeletions;
      }
      return a.entry.codename.localeCompare(b.entry.codename);
    });

    return rows.map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
  }, [progressByCharacter]);

  const comingSoonFighters = useMemo(() => getComingSoonCharacters(), []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.menuButton} onPress={onOpenDrawer}>
          <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
        </Pressable>
        <View>
          <Text style={styles.title}>FIGHTER RANKINGS</Text>
          <Text style={styles.subtitle}>Operative XP leaderboard</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={arcadeColors.neonCyan} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionLabel}>ACTIVE ROSTER</Text>
          {rankedFighters.map(({ entry, stats, rank }) => {
            const isActive = entry.id === characterId;
            const thumb = entry.tiers[1]?.still;
            const rankColor = RANK_COLORS[rank - 1] ?? arcadeColors.textMuted;

            return (
              <View
                key={entry.id}
                style={[styles.rankCard, isActive && styles.rankCardActive]}
              >
                <View style={[styles.rankBadge, { borderColor: rankColor }]}>
                  <Text style={[styles.rankText, { color: rankColor }]}>#{rank}</Text>
                </View>

                <View style={styles.thumbFrame}>
                  {thumb ? (
                    <Image source={thumb} style={styles.thumbImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons name="person" size={22} color={arcadeColors.textDim} />
                    </View>
                  )}
                </View>

                <View style={styles.rankCopy}>
                  <View style={styles.nameRow}>
                    <Text style={styles.codename}>{entry.codename}</Text>
                    {isActive ? (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>ACTIVE</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.metaLine}>
                    {entry.ethnicity.toUpperCase()} · {entry.gender.toUpperCase()}
                  </Text>
                  <CharacterProgressBar stats={stats} />
                </View>
              </View>
            );
          })}

          <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>INCOMING OPERATIVES</Text>
          {comingSoonFighters.map((entry) => (
            <View key={entry.id} style={styles.rankCard}>
              <View style={[styles.rankBadge, styles.rankBadgeMuted]}>
                <Text style={styles.rankTextMuted}>—</Text>
              </View>

              <View style={styles.thumbFrame}>
                <View style={styles.thumbPlaceholder}>
                  <Ionicons name="help" size={22} color={arcadeColors.textDim} />
                </View>
                <View style={styles.comingSoonOverlay}>
                  <Ionicons name="lock-closed" size={16} color={arcadeColors.neonYellow} />
                  <Text style={styles.comingSoonText}>COMING SOON</Text>
                </View>
              </View>

              <View style={styles.rankCopy}>
                <Text style={styles.codenameMuted}>{entry.codename}</Text>
                <Text style={styles.metaLine}>
                  {entry.ethnicity.toUpperCase()} · {entry.gender.toUpperCase()}
                </Text>
                <Text style={styles.comingSoonHint}>Awaiting character data load</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: arcadeColors.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
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
  },
  title: {
    ...arcadeTypography.pixelTitle,
    fontSize: 9,
  },
  subtitle: {
    ...arcadeTypography.retroMeta,
    marginTop: 2,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 10,
  },
  sectionLabel: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.neonCyan,
    marginBottom: 2,
  },
  sectionLabelSpaced: {
    marginTop: 10,
  },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 8,
    backgroundColor: arcadeColors.bgPanel,
    padding: 10,
  },
  rankCardActive: {
    borderColor: arcadeColors.neonPink,
    backgroundColor: arcadeColors.bgPanelElevated,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgDeep,
  },
  rankBadgeMuted: {
    borderColor: arcadeColors.borderMuted,
  },
  rankText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 11,
  },
  rankTextMuted: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    color: arcadeColors.textDim,
  },
  thumbFrame: {
    width: 54,
    height: 72,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    backgroundColor: arcadeColors.bgDeep,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanelElevated,
  },
  comingSoonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 8, 18, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  comingSoonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 5,
    lineHeight: 8,
    color: arcadeColors.neonYellow,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  rankCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  codename: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.neonPink,
  },
  codenameMuted: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.textMuted,
  },
  activePill: {
    borderWidth: 1,
    borderColor: arcadeColors.neonCyan,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(51, 255, 255, 0.1)',
  },
  activePillText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 5,
    color: arcadeColors.neonCyan,
  },
  metaLine: {
    ...arcadeTypography.retroCaption,
    fontSize: 10,
  },
  comingSoonHint: {
    fontFamily: arcadeFonts.body,
    fontSize: 10,
    lineHeight: 14,
    color: arcadeColors.textDim,
    fontStyle: 'italic',
  },
  progressBlock: {
    gap: 3,
    marginTop: 2,
  },
  progressTrack: {
    height: 8,
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
  },
  progressMeta: {
    fontFamily: arcadeFonts.body,
    fontSize: 9,
    lineHeight: 12,
    color: arcadeColors.textMuted,
  },
});
