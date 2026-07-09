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
import { ArcadeComputerIcon, ArcadeRadarIcon, ArcadeTrashIcon } from './ArcadeIcons';

type GamePhase = 'intro' | 'playing' | 'results';
type DispatchLane = 'ground' | 'air' | 'quarantine';
type PulseRating = 'perfect' | 'good' | 'miss';

interface PulseCourierControlGameProps {
  onBackToHub: () => void;
}

interface DispatchJob {
  id: string;
  sender: string;
  subject: string;
  lane: DispatchLane;
  tags: string[];
  timeLimitMs: number;
  timeLeftMs: number;
}

interface LaneConfig {
  key: DispatchLane;
  label: string;
  accent: string;
  blurb: string;
}

const ROUND_DURATION_MS = 50_000;
const TICK_MS = 80;
const STARTING_LIVES = 3;
const MAX_QUEUE = 3;

const LANE_CONFIG: LaneConfig[] = [
  {
    key: 'ground',
    label: 'GROUND',
    accent: arcadeColors.neonCyan,
    blurb: 'Local + standard',
  },
  {
    key: 'air',
    label: 'AIR',
    accent: arcadeColors.neonYellow,
    blurb: 'Express + long haul',
  },
  {
    key: 'quarantine',
    label: 'QUAR',
    accent: arcadeColors.neonPink,
    blurb: 'Hazard + suspect',
  },
];

const JOB_TEMPLATES: Array<{
  sender: string;
  subject: string;
  lane: DispatchLane;
  tags: string[];
}> = [
  {
    sender: 'Metro Hub',
    subject: 'Neighborhood parcel sweep',
    lane: 'ground',
    tags: ['LOCAL', 'STANDARD'],
  },
  {
    sender: 'SkyMail X',
    subject: 'Express launch crate',
    lane: 'air',
    tags: ['EXPRESS', 'HIGH ALT'],
  },
  {
    sender: 'Customs',
    subject: 'Suspicious label bundle',
    lane: 'quarantine',
    tags: ['SUSPECT', 'INSPECT'],
  },
  {
    sender: 'Hospital Grid',
    subject: 'Critical med-pouch',
    lane: 'air',
    tags: ['PRIORITY', 'COLD'],
  },
  {
    sender: 'Market Loop',
    subject: 'Same-day receipt stack',
    lane: 'ground',
    tags: ['LOCAL', 'BULK'],
  },
  {
    sender: 'BioLab',
    subject: 'Volatile sample canister',
    lane: 'quarantine',
    tags: ['HAZMAT', 'SEALED'],
  },
  {
    sender: 'Orbital Gifts',
    subject: 'Tourist postcard burst',
    lane: 'air',
    tags: ['INTERNATIONAL', 'TRACKED'],
  },
  {
    sender: 'Tower A',
    subject: 'Office memo crate',
    lane: 'ground',
    tags: ['DISTRICT', 'ROUTINE'],
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function laneAccent(lane: DispatchLane): string {
  return LANE_CONFIG.find((entry) => entry.key === lane)?.accent ?? arcadeColors.neonCyan;
}

function computeJobDurationMs(round: number, combo: number): number {
  const baseMs = 7000;
  const comboReduction = Math.min(combo * 130, 1900);
  const roundReduction = Math.min(Math.max(0, round - 1) * 55, 1400);
  const jitter = Math.floor(Math.random() * 400) - 200;
  return Math.max(2400, baseMs - comboReduction - roundReduction + jitter);
}

function buildJob(round: number, combo: number): DispatchJob {
  const template = pickRandom(JOB_TEMPLATES);
  const timeLimitMs = computeJobDurationMs(round, combo);

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sender: template.sender,
    subject: template.subject,
    lane: template.lane,
    tags: template.tags,
    timeLimitMs,
    timeLeftMs: timeLimitMs,
  };
}

function ratePulse(progress: number): PulseRating {
  const distanceFromCenter = Math.abs(progress - 0.5);
  if (distanceFromCenter <= 0.08) {
    return 'perfect';
  }
  if (distanceFromCenter <= 0.2) {
    return 'good';
  }
  return 'miss';
}

export default function PulseCourierControlGame({
  onBackToHub,
}: PulseCourierControlGameProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [round, setRound] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_DURATION_MS);
  const [queue, setQueue] = useState<DispatchJob[]>([]);
  const [selectedLane, setSelectedLane] = useState<DispatchLane>('ground');
  const [pulseProgress, setPulseProgress] = useState(0.18);
  const [pulseFlashLabel, setPulseFlashLabel] = useState('SYNC WINDOW');

  const pulseDirectionRef = useRef<1 | -1>(1);
  const missHandledRef = useRef(false);

  const maxQueueSize = combo >= 9 ? MAX_QUEUE : combo >= 4 ? 2 : 1;
  const topJob = queue[0] ?? null;

  const fillQueue = useCallback(
    (currentQueue: DispatchJob[], nextRound: number, currentCombo: number) => {
      const nextQueue = [...currentQueue];
      while (nextQueue.length < maxQueueSize) {
        nextQueue.push(buildJob(nextRound, currentCombo));
      }
      return nextQueue;
    },
    [maxQueueSize],
  );

  const resetGame = useCallback(() => {
    pulseDirectionRef.current = 1;
    missHandledRef.current = false;
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setLives(STARTING_LIVES);
    setRound(1);
    setTimeLeftMs(ROUND_DURATION_MS);
    setSelectedLane('ground');
    setPulseProgress(0.18);
    setPulseFlashLabel('SYNC WINDOW');
    setQueue([buildJob(1, 0)]);
    setPhase('playing');
  }, []);

  const handleMiss = useCallback(() => {
    if (missHandledRef.current) {
      return;
    }

    missHandledRef.current = true;
    setCombo(0);
    setPulseFlashLabel('NETWORK JAM');
    setLives((currentLives) => {
      if (currentLives <= 1) {
        setPhase('results');
        setQueue([]);
        return 0;
      }

      const nextRound = round + 1;
      setRound(nextRound);
      setQueue(fillQueue([], nextRound, 0));
      missHandledRef.current = false;
      return currentLives - 1;
    });
  }, [fillQueue, round]);

  useEffect(() => {
    if (phase !== 'playing') {
      return;
    }

    const interval = setInterval(() => {
      missHandledRef.current = false;

      setPulseProgress((current) => {
        const speed = 0.028 + Math.min(combo * 0.0025, 0.02);
        let next = current + speed * pulseDirectionRef.current;

        if (next >= 1) {
          next = 1 - (next - 1);
          pulseDirectionRef.current = -1;
        } else if (next <= 0) {
          next = Math.abs(next);
          pulseDirectionRef.current = 1;
        }

        return next;
      });

      setTimeLeftMs((current) => {
        const next = Math.max(0, current - TICK_MS);
        if (next === 0) {
          setPhase('results');
          setQueue([]);
        }
        return next;
      });

      setQueue((currentQueue) => {
        if (currentQueue.length === 0) {
          return currentQueue;
        }

        let expired = false;
        const nextQueue = currentQueue
          .map((job, index) =>
            index === 0
              ? {
                  ...job,
                  timeLeftMs: job.timeLeftMs - TICK_MS,
                }
              : job,
          )
          .filter((job, index) => {
            if (index === 0 && job.timeLeftMs <= 0) {
              expired = true;
              return false;
            }
            return true;
          });

        if (expired) {
          setTimeout(() => handleMiss(), 0);
        }

        return expired ? nextQueue : fillQueue(nextQueue, round, combo);
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [combo, fillQueue, handleMiss, phase, round]);

  const handleLanePress = useCallback(async (lane: DispatchLane) => {
    setSelectedLane(lane);
    await Haptics.selectionAsync();
  }, []);

  const handleDispatch = useCallback(async () => {
    if (phase !== 'playing' || !topJob) {
      return;
    }

    if (selectedLane !== topJob.lane) {
      setPulseFlashLabel('BAD ROUTE');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      handleMiss();
      return;
    }

    const pulseRating = ratePulse(pulseProgress);
    if (pulseRating === 'miss') {
      setPulseFlashLabel('OFF BEAT');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      handleMiss();
      return;
    }

    const nextCombo = combo + 1;
    const nextRound = round + 1;
    const basePoints = pulseRating === 'perfect' ? 240 : 150;
    const bonusPoints = Math.min(420, combo * 24 + topJob.tags.length * 16);

    setScore((current) => current + basePoints + bonusPoints);
    setCombo(nextCombo);
    setBestCombo((current) => Math.max(current, nextCombo));
    setRound(nextRound);
    setPulseFlashLabel(pulseRating === 'perfect' ? 'PERFECT DISPATCH' : 'CLEAR TO SEND');
    setQueue((currentQueue) => fillQueue(currentQueue.slice(1), nextRound, nextCombo));
    await Haptics.impactAsync(
      pulseRating === 'perfect'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : Haptics.ImpactFeedbackStyle.Light,
    );
  }, [combo, fillQueue, handleMiss, phase, pulseProgress, round, selectedLane, topJob]);

  const completionPercent = useMemo(
    () => Math.max(0, Math.min(1, timeLeftMs / ROUND_DURATION_MS)),
    [timeLeftMs],
  );

  const topJobProgress = useMemo(() => {
    if (!topJob) {
      return 0;
    }
    return Math.max(0, Math.min(1, topJob.timeLeftMs / topJob.timeLimitMs));
  }, [topJob]);

  const pulseRating = ratePulse(pulseProgress);
  const scoreTitle =
    score >= 3400 ? 'NETWORK MAESTRO' : score >= 2200 ? 'DISPATCH DIRECTOR' : 'ROOKIE CONTROLLER';

  if (phase === 'intro') {
    return (
      <View style={[styles.content, { paddingBottom: bottomPad }]}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Route the city in rhythm.</Text>
          <Text style={styles.heroBody}>
            Read the front shipment, choose its lane, then fire dispatch when the pulse hits the
            sync window. It is a tougher bonus stage built around decisions and timing.
          </Text>
        </View>

        <View style={styles.legendCard}>
          {LANE_CONFIG.map((lane) => (
            <View key={lane.key} style={[styles.legendRow, { borderColor: lane.accent }]}>
              {lane.key === 'ground' ? (
                <ArcadeComputerIcon size={18} color={lane.accent} />
              ) : lane.key === 'air' ? (
                <ArcadeRadarIcon size={18} color={lane.accent} />
              ) : (
                <ArcadeTrashIcon size={18} color={lane.accent} />
              )}
              <View style={styles.legendCopy}>
                <Text style={[styles.legendTitle, { color: lane.accent }]}>{lane.label}</Text>
                <Text style={styles.legendBody}>{lane.blurb}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>How to play</Text>
          <Text style={styles.ruleLine}>50-second control shift</Text>
          <Text style={styles.ruleLine}>Pick GROUND, AIR, or QUAR for the front shipment</Text>
          <Text style={styles.ruleLine}>Hit DISPATCH inside the sync window</Text>
          <Text style={styles.ruleLine}>Combo grows the live queue from 1 to 3 jobs</Text>
          <Text style={styles.ruleLine}>Bad routes, bad timing, or expired jobs cost a life</Text>
        </View>

        <Pressable style={styles.startButton} onPress={resetGame}>
          <Text style={styles.startButtonText}>BOOT CONTROL TOWER</Text>
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
          <Text style={styles.heroBody}>The grid stayed online as long as your hands held sync.</Text>
        </View>

        <View style={styles.resultsButtons}>
          <Pressable style={styles.secondaryButton} onPress={resetGame}>
            <Text style={styles.secondaryButtonText}>RUN AGAIN</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={onBackToHub}>
            <Text style={styles.ghostButtonText}>BACK TO ARCADE</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.content, { paddingBottom: bottomPad }]}>
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

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>PULSE</Text>
        <Text
          style={[
            styles.statusValue,
            pulseRating === 'perfect'
              ? { color: arcadeColors.neonGreen }
              : pulseRating === 'good'
                ? { color: arcadeColors.neonYellow }
                : { color: arcadeColors.neonPink },
          ]}
        >
          {pulseFlashLabel}
        </Text>
        <View style={styles.pulseTrack}>
          <View style={styles.pulseWindowGood} />
          <View style={styles.pulseWindowPerfect} />
          <View style={[styles.pulseNeedle, { left: `${pulseProgress * 100}%` }]} />
        </View>
      </View>

      <View style={styles.queuePanel}>
        <Text style={styles.queueTitle}>LIVE SHIPMENTS</Text>
        {queue.map((job, index) => (
          <View
            key={job.id}
            style={[
              styles.jobCard,
              index === 0 && {
                borderColor: laneAccent(job.lane),
                backgroundColor: 'rgba(16, 22, 38, 0.96)',
              },
            ]}
          >
            <View style={styles.jobHeader}>
              <Text style={styles.jobSender}>{job.sender}</Text>
              <Text style={[styles.jobLane, { color: laneAccent(job.lane) }]}>
                {LANE_CONFIG.find((entry) => entry.key === job.lane)?.label}
              </Text>
            </View>
            <Text style={styles.jobSubject}>{job.subject}</Text>
            <View style={styles.tagRow}>
              {job.tags.map((tag) => (
                <View key={`${job.id}-${tag}`} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
            {index === 0 ? (
              <View style={styles.frontJobTimer}>
                <View
                  style={[
                    styles.frontJobTimerFill,
                    {
                      width: `${topJobProgress * 100}%`,
                      backgroundColor: laneAccent(job.lane),
                    },
                  ]}
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.laneGrid}>
        {LANE_CONFIG.map((lane) => {
          const selected = selectedLane === lane.key;
          return (
            <Pressable
              key={lane.key}
              style={[
                styles.laneButton,
                { borderColor: lane.accent },
                selected && { backgroundColor: 'rgba(255,255,255,0.06)' },
              ]}
              onPress={() => void handleLanePress(lane.key)}
            >
              <Text style={[styles.laneButtonLabel, { color: lane.accent }]}>{lane.label}</Text>
              <Text style={styles.laneButtonHint}>{lane.blurb}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[
          styles.dispatchButton,
          topJob ? { borderColor: laneAccent(topJob.lane) } : null,
        ]}
        onPress={() => void handleDispatch()}
      >
        <Text style={styles.dispatchButtonText}>DISPATCH</Text>
        <Text style={styles.dispatchButtonHint}>Route first, then fire on beat</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 14,
  },
  heroCard: {
    ...arcadeCard('pink'),
    padding: 16,
    gap: 10,
  },
  heroTitle: {
    ...arcadeTypography.pixelTitle,
  },
  heroBody: {
    ...arcadeTypography.retroBody,
  },
  legendCard: {
    ...arcadeCard('cyan'),
    padding: 14,
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: arcadeColors.bgPanelElevated,
    padding: 10,
  },
  legendCopy: {
    flex: 1,
    gap: 3,
  },
  legendTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
  },
  legendBody: {
    ...arcadeTypography.retroCaption,
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
  statusCard: {
    ...arcadeCard('pink'),
    padding: 14,
    gap: 10,
  },
  statusLabel: {
    ...arcadeTypography.sectionLabel,
  },
  statusValue: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
  },
  pulseTrack: {
    position: 'relative',
    height: 16,
    borderRadius: 999,
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  pulseWindowGood: {
    position: 'absolute',
    left: '30%',
    width: '40%',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 224, 102, 0.22)',
  },
  pulseWindowPerfect: {
    position: 'absolute',
    left: '42%',
    width: '16%',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(102, 255, 153, 0.30)',
  },
  pulseNeedle: {
    position: 'absolute',
    marginLeft: -6,
    width: 12,
    top: -1,
    bottom: -1,
    borderRadius: 999,
    backgroundColor: arcadeColors.textPrimary,
    borderWidth: 1,
    borderColor: arcadeColors.bgDeep,
  },
  queuePanel: {
    ...arcadeCard('pink'),
    flex: 1,
    minHeight: 250,
    padding: 14,
    gap: 10,
  },
  queueTitle: {
    ...arcadeTypography.sectionLabel,
  },
  jobCard: {
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 12,
    backgroundColor: arcadeColors.bgPanelElevated,
    padding: 12,
    gap: 8,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  jobSender: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonYellow,
    flex: 1,
  },
  jobLane: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
  },
  jobSubject: {
    ...arcadeTypography.retroBodyBright,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 999,
    backgroundColor: arcadeColors.bgPanel,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 5,
    lineHeight: 9,
    color: arcadeColors.textMuted,
  },
  frontJobTimer: {
    height: 5,
    borderRadius: 999,
    backgroundColor: arcadeColors.bgPanel,
    overflow: 'hidden',
  },
  frontJobTimerFill: {
    height: '100%',
  },
  laneGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  laneButton: {
    flex: 1,
    minHeight: 80,
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: arcadeColors.bgPanel,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 6,
  },
  laneButtonLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    textAlign: 'center',
  },
  laneButtonHint: {
    ...arcadeTypography.retroCaption,
    textAlign: 'center',
  },
  dispatchButton: {
    borderWidth: 2,
    borderColor: arcadeColors.borderYellow,
    borderRadius: 14,
    backgroundColor: arcadeColors.bgPanelElevated,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  dispatchButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 9,
    lineHeight: 13,
    color: arcadeColors.neonGreen,
  },
  dispatchButtonHint: {
    ...arcadeTypography.retroCaption,
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
