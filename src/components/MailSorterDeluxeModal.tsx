import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  arcadeButtonPrimary,
  arcadeCard,
  arcadeColors,
  arcadeFonts,
  arcadeTypography,
} from '../theme/arcadeTheme';
import { ArcadeArchiveIcon, ArcadeCrosshairIcon, ArcadeTrashIcon } from './ArcadeIcons';

type SortLane = 'priority' | 'archive' | 'trash';
type GamePhase = 'intro' | 'playing' | 'results';

interface MailSorterDeluxeModalProps {
  visible: boolean;
  onClose: () => void;
}

interface MailSorterDeluxeGameProps {
  onBackToHub: () => void;
}

interface MailPiece {
  id: string;
  sender: string;
  subject: string;
  lane: SortLane;
  timeLimitMs: number;
}

interface LaneConfig {
  key: SortLane;
  label: string;
  accent: string;
}

const ROUND_DURATION_MS = 45_000;
const TICK_MS = 100;
const STARTING_LIVES = 3;

const LANE_CONFIG: LaneConfig[] = [
  { key: 'priority', label: 'PRIORITY', accent: arcadeColors.neonYellow },
  { key: 'archive', label: 'ARCHIVE', accent: arcadeColors.neonCyan },
  { key: 'trash', label: 'TRASH', accent: arcadeColors.neonPink },
];

const MAIL_POOL: Record<SortLane, Array<{ sender: string; subject: string }>> = {
  priority: [
    { sender: 'Ops Lead', subject: 'Prod deploy rollback needed' },
    { sender: 'Payroll', subject: 'Direct deposit issue detected' },
    { sender: 'Mom', subject: 'Call me when you get this' },
    { sender: 'Security', subject: 'New login from unknown device' },
    { sender: 'Investor', subject: 'Term sheet redlines attached' },
  ],
  archive: [
    { sender: 'Daily Brief', subject: 'Morning market digest' },
    { sender: 'Receipts', subject: 'Ride share receipt available' },
    { sender: 'Calendar Bot', subject: 'Week-at-a-glance summary' },
    { sender: 'Build System', subject: 'Nightly build completed' },
    { sender: 'Product News', subject: 'July feature roundup' },
  ],
  trash: [
    { sender: 'Prince.exe', subject: 'Urgent transfer request' },
    { sender: 'Mega Crypto', subject: 'Turn $12 into $12,000 today' },
    { sender: 'Hot Singles', subject: 'You forgot your secret admirer' },
    { sender: 'Coupon Vortex', subject: '94% off fax toner now' },
    { sender: 'Reply-All Goblin', subject: 'pls remove me from this list' },
  ],
};

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Base fall duration (ms). Combo + round shave time off as the player heats up. */
function computePieceTimeLimitMs(round: number, combo: number): number {
  const baseMs = 5200;
  const comboReduction = Math.min(combo * 140, 2600);
  const roundReduction = Math.min(Math.max(0, round - 1) * 45, 1100);
  const jitter = Math.floor(Math.random() * 320) - 160;

  return Math.max(1600, baseMs - comboReduction - roundReduction + jitter);
}

function buildMailPiece(round: number, combo: number): MailPiece {
  const lane = pickRandom<SortLane>(['priority', 'archive', 'trash']);
  const picked = pickRandom(MAIL_POOL[lane]);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sender: picked.sender,
    subject: picked.subject,
    lane,
    timeLimitMs: computePieceTimeLimitMs(round, combo),
  };
}

export function MailSorterDeluxeGame({ onBackToHub }: MailSorterDeluxeGameProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [round, setRound] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_DURATION_MS);
  const [mailPiece, setMailPiece] = useState<MailPiece | null>(null);
  const [pieceTimeLeftMs, setPieceTimeLeftMs] = useState(0);

  const pieceTimeLimitRef = useRef(0);

  const spawnPiece = useCallback((nextRound: number, currentCombo = 0) => {
    const next = buildMailPiece(nextRound, currentCombo);
    pieceTimeLimitRef.current = next.timeLimitMs;
    setMailPiece(next);
    setPieceTimeLeftMs(next.timeLimitMs);
  }, []);

  const resetGame = useCallback(() => {
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setLives(STARTING_LIVES);
    setRound(1);
    setTimeLeftMs(ROUND_DURATION_MS);
    spawnPiece(1);
    setPhase('playing');
  }, [spawnPiece]);

  const handleMiss = useCallback(() => {
    setCombo(0);
    setLives((currentLives) => {
      if (currentLives <= 1) {
        setPhase('results');
        setMailPiece(null);
        return 0;
      }

      const nextRound = round + 1;
      setRound(nextRound);
      spawnPiece(nextRound, 0);
      return currentLives - 1;
    });
  }, [round, spawnPiece]);

  useEffect(() => {
    setPhase('intro');
    setMailPiece(null);
  }, []);

  useEffect(() => {
    if (phase !== 'playing') {
      return;
    }

    const interval = setInterval(() => {
      setTimeLeftMs((current) => {
        const next = Math.max(0, current - TICK_MS);
        if (next === 0) {
          setPhase('results');
          setMailPiece(null);
        }
        return next;
      });

      setPieceTimeLeftMs((current) => {
        const next = current - TICK_MS;
        if (next <= 0) {
          setTimeout(() => handleMiss(), 0);
          return 0;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [handleMiss, phase]);

  const handleSort = useCallback(
    async (lane: SortLane) => {
      if (phase !== 'playing' || !mailPiece) {
        return;
      }

      const correct = lane === mailPiece.lane;

      if (correct) {
        const nextCombo = combo + 1;
        const nextRound = round + 1;
        const points = 100 + Math.min(400, combo * 25);
        setScore((current) => current + points);
        setCombo(nextCombo);
        setBestCombo((current) => Math.max(current, nextCombo));
        setRound(nextRound);
        spawnPiece(nextRound, nextCombo);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      handleMiss();
    },
    [combo, handleMiss, mailPiece, phase, round, spawnPiece],
  );

  const completionPercent = useMemo(
    () => Math.max(0, Math.min(1, timeLeftMs / ROUND_DURATION_MS)),
    [timeLeftMs],
  );

  const fallPercent = useMemo(() => {
    if (!mailPiece || pieceTimeLimitRef.current <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(1, 1 - pieceTimeLeftMs / pieceTimeLimitRef.current));
  }, [mailPiece, pieceTimeLeftMs]);

  const scoreTitle =
    score >= 3000 ? 'POSTMASTER GENERAL' : score >= 1800 ? 'SORTING SAVANT' : 'MAILROOM ROOKIE';

  return (
    <>
        {phase === 'intro' ? (
          <View style={[styles.content, { paddingBottom: bottomPad }]}>
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>Neon mailroom unlocked.</Text>
              <Text style={styles.heroBody}>
                Sort as many falling envelopes as you can before the timer or your lives run out.
                Priority goes to the crosshair, summaries get archived, and obvious junk gets trashed.
              </Text>
              <View style={styles.legendRow}>
                <View style={styles.legendChip}>
                  <ArcadeCrosshairIcon size={18} color={arcadeColors.neonYellow} />
                  <Text style={styles.legendText}>PRIORITY</Text>
                </View>
                <View style={styles.legendChip}>
                  <ArcadeArchiveIcon size={18} color={arcadeColors.neonCyan} />
                  <Text style={styles.legendText}>ARCHIVE</Text>
                </View>
                <View style={styles.legendChip}>
                  <ArcadeTrashIcon size={18} color={arcadeColors.neonPink} />
                  <Text style={styles.legendText}>TRASH</Text>
                </View>
              </View>
            </View>

            <View style={styles.rulesCard}>
              <Text style={styles.rulesTitle}>How to play</Text>
              <Text style={styles.ruleLine}>45-second bonus stage</Text>
              <Text style={styles.ruleLine}>3 lives</Text>
              <Text style={styles.ruleLine}>Correct streaks boost score and speed up the belt</Text>
              <Text style={styles.ruleLine}>Wrong bins or dropped mail cost a life</Text>
            </View>

            <Pressable style={styles.startButton} onPress={resetGame}>
              <Text style={styles.startButtonText}>START SORTING</Text>
            </Pressable>
          </View>
        ) : null}

        {phase === 'playing' ? (
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

            <View style={styles.arena}>
              <View style={styles.scanLines} />
              <View style={[styles.mailPiece, { top: `${fallPercent * 58}%` }]}>
                <Text style={styles.mailSender}>{mailPiece?.sender}</Text>
                <Text style={styles.mailSubject}>{mailPiece?.subject}</Text>
              </View>
            </View>

            <View style={styles.controlsRow}>
              {LANE_CONFIG.map((lane) => (
                <Pressable
                  key={lane.key}
                  style={[styles.controlButton, { borderColor: lane.accent }]}
                  onPress={() => void handleSort(lane.key)}
                >
                  <Text style={[styles.controlText, { color: lane.accent }]}>{lane.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {phase === 'results' ? (
          <View style={[styles.content, { paddingBottom: bottomPad }]}>
            <View style={styles.resultsCard}>
              <Text style={styles.resultsKicker}>SHIFT COMPLETE</Text>
              <Text style={styles.resultsTitle}>{scoreTitle}</Text>
              <Text style={styles.resultsScore}>{score}</Text>
              <Text style={styles.resultsMeta}>Best combo x{bestCombo}</Text>
              <Text style={styles.heroBody}>
                Inbox Zero held the line. Run it back until fresh mail shows up.
              </Text>
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
        ) : null}
    </>
  );
}

export default function MailSorterDeluxeModal({
  visible,
  onClose,
}: MailSorterDeluxeModalProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>INBOX ZERO BONUS STAGE</Text>
            <Text style={styles.title}>MAIL SORTER DELUXE</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>EXIT</Text>
          </Pressable>
        </View>
        <MailSorterDeluxeGame onBackToHub={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: arcadeColors.bgDeep,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: arcadeColors.borderMuted,
  },
  kicker: {
    ...arcadeTypography.pixelSubtitle,
    color: arcadeColors.neonYellow,
  },
  title: {
    ...arcadeTypography.pixelTitlePink,
    marginTop: 6,
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  closeText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 10,
    color: arcadeColors.neonCyan,
  },
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
  arena: {
    flex: 1,
    minHeight: 320,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    backgroundColor: arcadeColors.bgMidnight,
    overflow: 'hidden',
    padding: 14,
  },
  scanLines: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.25,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: arcadeColors.gridLineBright,
  },
  mailPiece: {
    position: 'absolute',
    left: 16,
    right: 16,
    ...arcadeCard('pink'),
    padding: 14,
    gap: 6,
  },
  mailSender: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonYellow,
  },
  mailSubject: {
    ...arcadeTypography.retroBodyBright,
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
