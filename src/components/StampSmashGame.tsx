import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  arcadeButtonPrimary,
  arcadeCard,
  arcadeColors,
  arcadeFonts,
  arcadeTypography,
} from '../theme/arcadeTheme';
import { ArcadeArchiveIcon, ArcadeCrosshairIcon, ArcadeTrashIcon } from './ArcadeIcons';

type StampLane = 'priority' | 'archive' | 'trash';
type GamePhase = 'intro' | 'playing' | 'results';

interface StampSmashGameProps {
  onBackToHub: () => void;
}

interface Mole {
  id: string;
  slot: number;
  lane: StampLane;
  sender: string;
  subject: string;
  timeLimitMs: number;
  timeLeftMs: number;
}

const ROUND_DURATION_MS = 45_000;
const TICK_MS = 100;
const STARTING_LIVES = 3;
const SLOT_COUNT = 6;

const LANE_CONFIG: Array<{ key: StampLane; label: string; accent: string }> = [
  { key: 'priority', label: 'PRIORITY', accent: arcadeColors.neonYellow },
  { key: 'archive', label: 'ARCHIVE', accent: arcadeColors.neonCyan },
  { key: 'trash', label: 'TRASH', accent: arcadeColors.neonPink },
];

const MAIL_POOL: Record<StampLane, Array<{ sender: string; subject: string }>> = {
  priority: [
    { sender: 'CEO', subject: 'Need this before standup' },
    { sender: 'On-call', subject: 'Pager firing in prod' },
    { sender: 'Legal', subject: 'Sign by EOD please' },
  ],
  archive: [
    { sender: 'Newsletter', subject: 'Weekly digest ready' },
    { sender: 'Receipt Bot', subject: 'Coffee purchase logged' },
    { sender: 'Calendar', subject: 'Tomorrow at a glance' },
  ],
  trash: [
    { sender: 'Nigerian Prince', subject: 'Funds awaiting transfer' },
    { sender: 'Crypto Bro', subject: '1000x gains inside' },
    { sender: 'Fax Spam', subject: 'Free toner cartridges!!!' },
    { sender: 'Reply-All Demon', subject: 'Thanks, removing myself' },
  ],
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function computeMoleDurationMs(round: number, combo: number): number {
  const baseMs = 4800;
  const comboReduction = Math.min(combo * 130, 2400);
  const roundReduction = Math.min(Math.max(0, round - 1) * 40, 1000);
  const jitter = Math.floor(Math.random() * 280) - 140;

  return Math.max(1500, baseMs - comboReduction - roundReduction + jitter);
}

function laneAccent(lane: StampLane): string {
  return LANE_CONFIG.find((entry) => entry.key === lane)?.accent ?? arcadeColors.neonCyan;
}

function buildMole(round: number, combo: number, occupiedSlots: Set<number>): Mole {
  const openSlots = Array.from({ length: SLOT_COUNT }, (_, index) => index).filter(
    (slot) => !occupiedSlots.has(slot),
  );
  const lane = pickRandom<StampLane>(['trash', 'trash', 'archive', 'priority']);
  const picked = pickRandom(MAIL_POOL[lane]);
  const timeLimitMs = computeMoleDurationMs(round, combo);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slot: pickRandom(openSlots.length > 0 ? openSlots : [0]),
    lane,
    sender: picked.sender,
    subject: picked.subject,
    timeLimitMs,
    timeLeftMs: timeLimitMs,
  };
}

export default function StampSmashGame({ onBackToHub }: StampSmashGameProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [round, setRound] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_DURATION_MS);
  const [moles, setMoles] = useState<Mole[]>([]);

  const maxActiveMoles = combo >= 8 ? 2 : 1;
  const missHandledRef = useRef(false);

  const resetGame = useCallback(() => {
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setLives(STARTING_LIVES);
    setRound(1);
    setTimeLeftMs(ROUND_DURATION_MS);
    setMoles([]);
    missHandledRef.current = false;
    setPhase('playing');
  }, []);

  const spawnIfNeeded = useCallback((currentMoles: Mole[], nextRound: number, currentCombo: number) => {
    if (currentMoles.length >= maxActiveMoles) {
      return currentMoles;
    }

    const occupied = new Set(currentMoles.map((mole) => mole.slot));
    const next = buildMole(nextRound, currentCombo, occupied);
    return [...currentMoles, next];
  }, [maxActiveMoles]);

  useEffect(() => {
    if (phase !== 'playing') {
      return;
    }

    if (moles.length === 0) {
      setMoles(spawnIfNeeded([], round || 1, combo));
    }
  }, [combo, moles.length, phase, round, spawnIfNeeded]);

  const handleMiss = useCallback(() => {
    if (missHandledRef.current) {
      return;
    }
    missHandledRef.current = true;

    setCombo(0);
    setLives((currentLives) => {
      if (currentLives <= 1) {
        setPhase('results');
        setMoles([]);
        return 0;
      }

      const nextRound = round + 1;
      setRound(nextRound);
      setMoles(spawnIfNeeded([], nextRound, 0));
      missHandledRef.current = false;
      return currentLives - 1;
    });
  }, [round, spawnIfNeeded]);

  useEffect(() => {
    if (phase !== 'playing') {
      return;
    }

    const interval = setInterval(() => {
      missHandledRef.current = false;

      setTimeLeftMs((current) => {
        const next = Math.max(0, current - TICK_MS);
        if (next === 0) {
          setPhase('results');
          setMoles([]);
        }
        return next;
      });

      setMoles((current) => {
        if (current.length === 0) {
          return current;
        }

        let expired = false;
        const nextMoles = current
          .map((mole) => ({
            ...mole,
            timeLeftMs: mole.timeLeftMs - TICK_MS,
          }))
          .filter((mole) => {
            if (mole.timeLeftMs <= 0) {
              expired = true;
              return false;
            }
            return true;
          });

        if (expired) {
          setTimeout(() => handleMiss(), 0);
        }

        if (nextMoles.length < maxActiveMoles && !expired) {
          return spawnIfNeeded(nextMoles, round, combo);
        }

        return nextMoles;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [combo, handleMiss, maxActiveMoles, phase, round, spawnIfNeeded]);

  const handleStamp = useCallback(
    async (lane: StampLane) => {
      if (phase !== 'playing' || moles.length === 0) {
        return;
      }

      const target = moles.find((mole) => mole.lane === lane);
      if (!target) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        handleMiss();
        return;
      }

      const nextCombo = combo + 1;
      const nextRound = round + 1;
      const points = 120 + Math.min(420, combo * 28);

      setScore((current) => current + points);
      setCombo(nextCombo);
      setBestCombo((current) => Math.max(current, nextCombo));
      setRound(nextRound);

      const remaining = moles.filter((mole) => mole.id !== target.id);
      setMoles(spawnIfNeeded(remaining, nextRound, nextCombo));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [combo, handleMiss, moles, phase, round, spawnIfNeeded],
  );

  const completionPercent = useMemo(
    () => Math.max(0, Math.min(1, timeLeftMs / ROUND_DURATION_MS)),
    [timeLeftMs],
  );

  const scoreTitle =
    score >= 2800 ? 'STAMP LEGEND' : score >= 1600 ? 'JUNK SLAYER' : 'MAILROOM ROOKIE';

  if (phase === 'intro') {
    return (
      <View style={[styles.content, { paddingBottom: bottomPad }]}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Stamp the spam.</Text>
          <Text style={styles.heroBody}>
            Junk mail pops up in the neon mail slots. Slam the right stamp before it vanishes.
            Build combos to wake a second slot.
          </Text>
          <View style={styles.legendRow}>
            <View style={styles.legendChip}>
              <ArcadeTrashIcon size={18} color={arcadeColors.neonPink} />
              <Text style={styles.legendText}>TRASH SPAM</Text>
            </View>
            <View style={styles.legendChip}>
              <ArcadeArchiveIcon size={18} color={arcadeColors.neonCyan} />
              <Text style={styles.legendText}>ARCHIVE FYI</Text>
            </View>
            <View style={styles.legendChip}>
              <ArcadeCrosshairIcon size={18} color={arcadeColors.neonYellow} />
              <Text style={styles.legendText}>PRIORITY</Text>
            </View>
          </View>
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>How to play</Text>
          <Text style={styles.ruleLine}>45-second whack-a-spam round</Text>
          <Text style={styles.ruleLine}>3 lives</Text>
          <Text style={styles.ruleLine}>Combo x8 unlocks a second mail slot</Text>
          <Text style={styles.ruleLine}>Wrong stamps or missed popups cost a life</Text>
        </View>

        <Pressable style={styles.startButton} onPress={resetGame}>
          <Text style={styles.startButtonText}>START STAMPING</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'results') {
    return (
      <View style={[styles.content, { paddingBottom: bottomPad }]}>
        <View style={styles.resultsCard}>
          <Text style={styles.resultsKicker}>SHIFT COMPLETE</Text>
          <Text style={styles.resultsTitle}>{scoreTitle}</Text>
          <Text style={styles.resultsScore}>{score}</Text>
          <Text style={styles.resultsMeta}>Best combo x{bestCombo}</Text>
          <Text style={styles.heroBody}>The spam never stood a chance.</Text>
        </View>

        <View style={styles.resultsButtons}>
          <Pressable style={styles.secondaryButton} onPress={resetGame}>
            <Text style={styles.secondaryButtonText}>PLAY AGAIN</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={onBackToHub}>
            <Text style={styles.ghostButtonText}>BACK TO ARCADE</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.content, styles.playingContent, { paddingBottom: bottomPad }]}>
      <View style={styles.scoreboard}>
        <View style={styles.scoreCell}>
          <Text style={styles.scoreLabel}>SCORE</Text>
          <Text style={styles.scoreValue}>{score}</Text>
        </View>
        <View style={styles.scoreCell}>
          <Text style={styles.scoreLabel}>COMBO</Text>
          <Text style={styles.scoreValue}>x{combo}</Text>
        </View>
        <View style={styles.scoreCell}>
          <Text style={styles.scoreLabel}>LIVES</Text>
          <Text style={styles.scoreValue}>{lives}</Text>
        </View>
      </View>

      <View style={styles.timerShell}>
        <View style={[styles.timerFill, { width: `${completionPercent * 100}%` }]} />
      </View>

      <View style={styles.slotGrid}>
        {Array.from({ length: SLOT_COUNT }, (_, slot) => {
          const mole = moles.find((entry) => entry.slot === slot);
          const urgency =
            mole && mole.timeLimitMs > 0
              ? Math.max(0, Math.min(1, mole.timeLeftMs / mole.timeLimitMs))
              : 0;

          return (
            <View
              key={slot}
              style={[
                styles.slot,
                mole && {
                  borderColor: laneAccent(mole.lane),
                  backgroundColor: 'rgba(255, 102, 204, 0.08)',
                },
              ]}
            >
              {mole ? (
                <>
                  <Text style={[styles.slotSender, { color: laneAccent(mole.lane) }]}>
                    {mole.sender}
                  </Text>
                  <Text style={styles.slotSubject} numberOfLines={2}>
                    {mole.subject}
                  </Text>
                  <View style={styles.urgencyTrack}>
                    <View
                      style={[
                        styles.urgencyFill,
                        {
                          width: `${urgency * 100}%`,
                          backgroundColor: laneAccent(mole.lane),
                        },
                      ]}
                    />
                  </View>
                </>
              ) : (
                <Text style={styles.slotEmpty}>SLOT {slot + 1}</Text>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.controlsRow}>
        {LANE_CONFIG.map((lane) => (
          <Pressable
            key={lane.key}
            style={[styles.controlButton, { borderColor: lane.accent }]}
            onPress={() => void handleStamp(lane.key)}
          >
            <Text style={[styles.controlText, { color: lane.accent }]}>{lane.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 16,
  },
  playingContent: {
    paddingBottom: 0,
  },
  heroCard: {
    ...arcadeCard('pink'),
    padding: 16,
    gap: 12,
  },
  heroTitle: {
    ...arcadeTypography.pixelTitle,
  },
  heroBody: {
    ...arcadeTypography.retroBody,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 999,
    backgroundColor: arcadeColors.bgPanelElevated,
  },
  legendText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textPrimary,
  },
  rulesCard: {
    ...arcadeCard('cyan'),
    padding: 16,
    gap: 8,
  },
  rulesTitle: {
    ...arcadeTypography.sectionLabel,
  },
  ruleLine: {
    ...arcadeTypography.retroBody,
  },
  startButton: {
    ...arcadeButtonPrimary(),
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.neonPink,
  },
  scoreboard: {
    flexDirection: 'row',
    gap: 10,
  },
  scoreCell: {
    flex: 1,
    ...arcadeCard('cyan'),
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  scoreLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textDim,
  },
  scoreValue: {
    marginTop: 6,
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.body,
    fontSize: 22,
    fontWeight: '700',
  },
  timerShell: {
    height: 10,
    borderRadius: 999,
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    overflow: 'hidden',
  },
  timerFill: {
    height: '100%',
    backgroundColor: arcadeColors.neonGreen,
  },
  slotGrid: {
    flex: 1,
    minHeight: 280,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignContent: 'flex-start',
  },
  slot: {
    width: '48%',
    minHeight: 108,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 12,
    backgroundColor: arcadeColors.bgPanel,
    padding: 10,
    gap: 4,
    justifyContent: 'center',
  },
  slotEmpty: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textDim,
    textAlign: 'center',
  },
  slotSender: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
  },
  slotSubject: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textPrimary,
  },
  urgencyTrack: {
    marginTop: 6,
    height: 4,
    borderRadius: 999,
    backgroundColor: arcadeColors.bgPanelElevated,
    overflow: 'hidden',
  },
  urgencyFill: {
    height: '100%',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  controlButton: {
    flex: 1,
    minHeight: 74,
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: arcadeColors.bgPanel,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  controlText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    textAlign: 'center',
  },
  resultsCard: {
    ...arcadeCard('pink'),
    padding: 20,
    gap: 12,
    alignItems: 'center',
  },
  resultsKicker: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.neonYellow,
  },
  resultsTitle: {
    ...arcadeTypography.pixelTitlePink,
    textAlign: 'center',
  },
  resultsScore: {
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.body,
    fontSize: 42,
    fontWeight: '800',
  },
  resultsMeta: {
    ...arcadeTypography.retroBodyBright,
  },
  resultsButtons: {
    gap: 12,
  },
  secondaryButton: {
    ...arcadeButtonPrimary(),
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.neonPink,
  },
  ghostButton: {
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonCyan,
  },
});
