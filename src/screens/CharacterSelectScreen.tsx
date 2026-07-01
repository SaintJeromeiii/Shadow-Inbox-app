import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import DynamicAvatar, { AVATAR_ASPECT_RATIO } from '../components/DynamicAvatar';
import { ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import { useAccount } from '../context/AccountContext';
import { getCharacterRegistryEntry } from '../constants/characters';
import {
  LOCKED_ROSTER_SLOTS,
  PLAYABLE_CHARACTERS,
} from '../data/characters';
import { fetchAllCharacterStats } from '../services/userProgressService';
import {
  startCharacterIntroAmbience,
  stopCharacterIntroAmbience,
} from '../services/retroSoundService';
import type { CharacterId } from '../types/character';
import type { PlayerStats } from '../types/userProgress';
import { buildPlayerStats } from '../utils/playerProgress';
import { arcadeColors, arcadeFonts, neonCyanText, neonPinkText } from '../theme/arcadeTheme';

interface CharacterSelectScreenProps {
  initialCharacterId: CharacterId;
  onConfirm: (characterId: CharacterId) => void;
  variant?: 'intro' | 'switch';
  onCancel?: () => void;
  onOpenDrawer?: () => void;
}

function FighterProgressBar({
  label,
  stats,
  compact = false,
}: {
  label: string;
  stats: PlayerStats;
  compact?: boolean;
}) {
  const percent = Math.round(stats.progress * 100);

  return (
    <View style={[styles.progressBlock, compact && styles.progressBlockCompact]}>
      {!compact ? <Text style={styles.progressLabel}>{label}</Text> : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
      <Text style={[styles.progressMeta, compact && styles.progressMetaCompact]}>
        {compact ? `${percent}%` : `${stats.tierName.toUpperCase()} · ${percent}%`}
      </Text>
    </View>
  );
}

export default function CharacterSelectScreen({
  initialCharacterId,
  onConfirm,
  variant = 'intro',
  onCancel,
  onOpenDrawer,
}: CharacterSelectScreenProps) {
  const insets = useSafeAreaInsets();
  const { activeAccount } = useAccount();
  const blink = useRef(new Animated.Value(1)).current;
  const [selectedId, setSelectedId] = useState<CharacterId>(initialCharacterId);
  const [previewToken, setPreviewToken] = useState(0);
  const [progressByCharacter, setProgressByCharacter] = useState<
    Partial<Record<CharacterId, PlayerStats>>
  >({});

  const isSwitchMode = variant === 'switch';
  const playableIds = PLAYABLE_CHARACTERS.map((character) => character.id);

  const selectedCharacter =
    PLAYABLE_CHARACTERS.find((character) => character.id === selectedId) ??
    PLAYABLE_CHARACTERS[0];
  const selectedRegistry = getCharacterRegistryEntry(selectedId);
  const selectedStats =
    progressByCharacter[selectedId] ?? buildPlayerStats(0);
  const previewVisualLabel =
    selectedRegistry.tiers[1]?.label ?? selectedCharacter.startingTierTitle;

  const loadProgress = useCallback(async () => {
    const statsMap = await fetchAllCharacterStats(activeAccount, playableIds);
    setProgressByCharacter(statsMap);
  }, [activeAccount, playableIds]);

  useEffect(() => {
    setSelectedId(initialCharacterId);
  }, [initialCharacterId]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    if (variant !== 'intro') {
      return;
    }

    const sessionId = `fighter-select-${selectedId}`;
    void startCharacterIntroAmbience(selectedId, sessionId);

    return () => {
      stopCharacterIntroAmbience(sessionId);
    };
  }, [variant, selectedId]);

  useEffect(() => {
    if (variant !== 'intro') {
      return;
    }

    setPreviewToken((token) => token + 1);
  }, [variant]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.25,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [blink]);

  const handleSelect = (characterId: CharacterId) => {
    void Haptics.selectionAsync();
    setSelectedId(characterId);
    setPreviewToken((token) => token + 1);
  };

  const handleConfirm = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm(selectedId);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {isSwitchMode ? (
        <View style={styles.topBar}>
          <Pressable
            style={styles.menuButton}
            onPress={onOpenDrawer}
            accessibilityLabel="Open side deck menu"
          >
            <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
          </Pressable>
          <Pressable onPress={onCancel} accessibilityLabel="Return to play stage">
            <Text style={styles.cancelText}>← BACK</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.headerBlock}>
        <Text style={styles.header}>
          {isSwitchMode ? 'CHANGE FIGHTER' : 'SELECT YOUR FIGHTER'}
        </Text>
        <Text style={styles.subheader}>Each operative tracks XP separately</Text>
        <View style={styles.rule} />
      </View>

      <View style={styles.previewPanel}>
        <View style={styles.previewFrame} collapsable={false}>
          <DynamicAvatar
            characterId={selectedId}
            visualTier={1}
            enableIntro
            enableIntroAudio={false}
            holdIntro={variant === 'intro'}
            replayToken={previewToken}
          />
        </View>

        <Text style={styles.codename}>{selectedCharacter.codename}</Text>
        <Text style={styles.tierTitle}>{previewVisualLabel}</Text>
        <Text style={styles.ethnicityLine}>
          {selectedRegistry.ethnicity.toUpperCase()} · {selectedRegistry.gender.toUpperCase()}
        </Text>
        <Text style={styles.tagline}>&quot;{selectedCharacter.tagline}&quot;</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.rosterRow}>
          {PLAYABLE_CHARACTERS.map((character) => {
            const isSelected = character.id === selectedId;
            const slotStats = progressByCharacter[character.id] ?? buildPlayerStats(0);
            const progressPercent = Math.round(slotStats.progress * 100);

            return (
              <Pressable
                key={character.id}
                style={({ pressed }) => [
                  styles.rosterSlot,
                  isSelected && styles.rosterSlotSelected,
                  pressed && styles.rosterSlotPressed,
                ]}
                onPress={() => handleSelect(character.id)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${character.codename}`}
                accessibilityState={{ selected: isSelected }}
              >
                {isSelected ? (
                  <Text style={styles.rosterCursor}>▶</Text>
                ) : null}
                <Text style={[styles.rosterLabel, isSelected && styles.rosterLabelSelected]}>
                  {character.codename.split(' ')[0]}
                </Text>
                <View style={styles.rosterProgressTrack}>
                  <View
                    style={[
                      styles.rosterProgressFill,
                      { width: `${progressPercent}%` },
                    ]}
                  />
                </View>
                <Text style={styles.rosterProgressText}>{progressPercent}%</Text>
              </Pressable>
            );
          })}
          {Array.from({ length: LOCKED_ROSTER_SLOTS }).map((_, index) => (
            <View key={`locked-${index}`} style={styles.rosterSlotLocked}>
              <Ionicons name="lock-closed" size={12} color={arcadeColors.textDim} />
              <Text style={styles.rosterLockedText}>???</Text>
            </View>
          ))}
        </View>

        <FighterProgressBar
          label="OPERATIVE XP TRACK"
          stats={selectedStats}
        />

        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>CLEARS</Text>
            <Text style={styles.statValue}>{selectedStats.totalDeletions}</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>LVL</Text>
            <Text style={styles.statValue}>{selectedStats.tier}</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>NEXT</Text>
            <Text style={styles.statValue}>
              {selectedStats.maxTier ? 'MAX' : selectedStats.deletesToNext}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={handleConfirm}
          accessibilityRole="button"
          accessibilityLabel={isSwitchMode ? 'Switch fighter' : 'Confirm fighter'}
          style={({ pressed }) => [styles.confirmWrap, pressed && styles.confirmPressed]}
        >
          <Animated.Text style={[styles.confirmText, { opacity: blink }]}>
            {isSwitchMode ? 'SWITCH FIGHTER' : 'CONFIRM FIGHTER'}
          </Animated.Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
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
  cancelText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.4,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    alignItems: 'center',
    gap: 14,
  },
  headerBlock: {
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'center',
    gap: 6,
  },
  scrollArea: {
    flex: 1,
  },
  header: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 1,
    textAlign: 'center',
    ...neonCyanText(),
  },
  subheader: {
    fontFamily: arcadeFonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: arcadeColors.textMuted,
    textAlign: 'center',
    marginTop: -6,
  },
  rule: {
    width: '100%',
    height: 2,
    backgroundColor: arcadeColors.borderMuted,
    marginBottom: 2,
  },
  rosterRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  rosterSlot: {
    flex: 1,
    minHeight: 68,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 3,
  },
  rosterSlotSelected: {
    borderColor: arcadeColors.neonPink,
    backgroundColor: arcadeColors.bgPanelElevated,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 4,
  },
  rosterSlotPressed: {
    opacity: 0.88,
  },
  rosterSlotLocked: {
    flex: 1,
    minHeight: 68,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    opacity: 0.55,
  },
  rosterCursor: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    color: arcadeColors.neonYellow,
    lineHeight: 10,
  },
  rosterLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 9,
    color: arcadeColors.textDim,
    textAlign: 'center',
  },
  rosterLabelSelected: {
    color: arcadeColors.neonCyan,
  },
  rosterProgressTrack: {
    width: '88%',
    height: 5,
    borderRadius: 2,
    backgroundColor: arcadeColors.bgDeep,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    overflow: 'hidden',
  },
  rosterProgressFill: {
    height: '100%',
    backgroundColor: arcadeColors.neonPink,
  },
  rosterProgressText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 5,
    color: arcadeColors.textMuted,
    lineHeight: 8,
  },
  rosterLockedText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    color: arcadeColors.textDim,
  },
  previewPanel: {
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
    borderWidth: 3,
    borderColor: arcadeColors.borderPink,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 20, 40, 0.88)',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginHorizontal: 20,
    marginBottom: 10,
    alignItems: 'center',
    gap: 8,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  previewFrame: {
    width: '72%',
    aspectRatio: AVATAR_ASPECT_RATIO,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: arcadeColors.bgDeep,
  },
  codename: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.8,
    textAlign: 'center',
    ...neonPinkText(),
  },
  tierTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 0.6,
    color: arcadeColors.neonCyan,
    textAlign: 'center',
  },
  ethnicityLine: {
    fontFamily: arcadeFonts.body,
    fontSize: 10,
    lineHeight: 14,
    color: arcadeColors.textDim,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  tagline: {
    fontFamily: arcadeFonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: arcadeColors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 8,
  },
  progressBlock: {
    width: '100%',
    gap: 4,
    marginTop: 2,
  },
  progressBlockCompact: {
    gap: 2,
  },
  progressLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    color: arcadeColors.textMuted,
    letterSpacing: 0.4,
  },
  progressTrack: {
    width: '100%',
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
    shadowOpacity: 0.7,
    shadowRadius: 4,
  },
  progressMeta: {
    fontFamily: arcadeFonts.body,
    fontSize: 10,
    color: arcadeColors.neonCyan,
    textAlign: 'center',
  },
  progressMetaCompact: {
    fontSize: 8,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  statPill: {
    minWidth: 54,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanel,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    color: arcadeColors.textDim,
  },
  statValue: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    color: arcadeColors.neonYellow,
  },
  confirmWrap: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  confirmPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  confirmText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 1,
    color: arcadeColors.neonYellow,
    textAlign: 'center',
    textShadowColor: arcadeColors.neonYellow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
