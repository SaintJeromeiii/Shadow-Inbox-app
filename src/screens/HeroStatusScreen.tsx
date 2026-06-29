import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccount } from '../context/AccountContext';
import { useCharacter } from '../context/CharacterContext';
import PlayerAvatarCard from '../components/PlayerAvatarCard';
import { ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import { fetchPlayerStats } from '../services/userProgressService';
import type { PlayerStats } from '../types/userProgress';
import { PLAYER_TIER_NAMES, PLAYER_TIER_THRESHOLDS } from '../types/userProgress';
import { buildPlayerStats } from '../utils/playerProgress';
import { arcadeColors, arcadeFonts, arcadeTypography } from '../theme/arcadeTheme';

interface HeroStatusScreenProps {
  onOpenDrawer: () => void;
}

const TIER_ORDER = [1, 2, 3, 4] as const;

export default function HeroStatusScreen({ onOpenDrawer }: HeroStatusScreenProps) {
  const { activeAccount } = useAccount();
  const { character, characterId } = useCharacter();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchPlayerStats(activeAccount, characterId);
      setStats(next);
    } catch (error) {
      console.warn('[Hero Status] Failed to load stats:', error);
      setStats(buildPlayerStats(0));
    } finally {
      setLoading(false);
    }
  }, [activeAccount, characterId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.menuButton} onPress={onOpenDrawer}>
          <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
        </Pressable>
        <View>
          <Text style={styles.title}>HERO STATUS</Text>
          <Text style={styles.subtitle}>Armor upgrades & combat record</Text>
        </View>
      </View>

      {loading && !stats ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={arcadeColors.neonCyan} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {stats ? <PlayerAvatarCard stats={stats} /> : null}

          <View style={styles.tierPanel}>
            <Text style={styles.panelTitle}>ARMOR PROGRESSION</Text>
            {TIER_ORDER.map((tier) => {
              const unlocked = (stats?.tier ?? 1) >= tier;
              const threshold = PLAYER_TIER_THRESHOLDS[tier];
              return (
                <View
                  key={tier}
                  style={[styles.tierRow, unlocked && styles.tierRowUnlocked]}
                >
                  <Text style={[styles.tierLevel, unlocked && styles.tierLevelUnlocked]}>
                    LVL {tier}
                  </Text>
                  <View style={styles.tierCopy}>
                    <Text style={styles.tierName}>{PLAYER_TIER_NAMES[tier].toUpperCase()}</Text>
                    <Text style={styles.tierThreshold}>
                      {threshold === 0 ? 'Start tier' : `${threshold}+ deletes`}
                    </Text>
                  </View>
                  <Text style={styles.tierState}>{unlocked ? 'EQUIPPED' : 'LOCKED'}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.statsPanel}>
            <Text style={styles.panelTitle}>COMBAT STATS</Text>
            <Text style={styles.statLine}>
              Total clears: {stats?.totalDeletions ?? 0}
            </Text>
            <Text style={styles.statLine}>Fighter: {character.codename}</Text>
            <Text style={styles.statLine}>
              Current armor: {stats?.tierName ?? 'Street Civilian'}
            </Text>
            <Text style={styles.statLine}>
              {stats?.maxTier
                ? 'Status: MAX TIER ACHIEVED'
                : `Next unlock in ${stats?.deletesToNext ?? 0} clears`}
            </Text>
          </View>
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
    borderBottomWidth: 2,
    borderBottomColor: arcadeColors.borderMuted,
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
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    lineHeight: 16,
    color: arcadeColors.neonPink,
    letterSpacing: 0.5,
  },
  subtitle: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textMuted,
    marginTop: 2,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  tierPanel: {
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 8,
    backgroundColor: arcadeColors.bgPanel,
    padding: 14,
    gap: 8,
  },
  statsPanel: {
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    borderRadius: 8,
    backgroundColor: arcadeColors.bgPanel,
    padding: 14,
    gap: 8,
  },
  panelTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.neonCyan,
    marginBottom: 4,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: arcadeColors.borderMuted,
  },
  tierRowUnlocked: {
    backgroundColor: 'rgba(51, 255, 255, 0.05)',
  },
  tierLevel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    color: arcadeColors.textDim,
    width: 42,
  },
  tierLevelUnlocked: {
    color: arcadeColors.neonCyan,
  },
  tierCopy: {
    flex: 1,
    gap: 2,
  },
  tierName: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonPink,
  },
  tierThreshold: {
    ...arcadeTypography.retroCaption,
    fontSize: 10,
  },
  tierState: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    color: arcadeColors.textMuted,
  },
  statLine: {
    ...arcadeTypography.retroBody,
    fontSize: 13,
    lineHeight: 20,
  },
});
