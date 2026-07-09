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
import {
  ArcadeArchiveIcon,
  ArcadeComputerIcon,
  ArcadeCrosshairIcon,
  ArcadeTrashIcon,
} from './ArcadeIcons';

type GamePhase = 'intro' | 'playing' | 'results';
type WorkstationKey = 'scan' | 'sort' | 'stamp' | 'ship';

interface NeonPostOfficeTycoonGameProps {
  onBackToHub: () => void;
}

interface MailJob {
  id: string;
  sender: string;
  subject: string;
  steps: WorkstationKey[];
  currentStepIndex: number;
  timeLimitMs: number;
  timeLeftMs: number;
}

interface WorkstationConfig {
  key: WorkstationKey;
  label: string;
  accent: string;
  blurb: string;
}

const ROUND_DURATION_MS = 45_000;
const TICK_MS = 100;
const STARTING_LIVES = 3;
const MAX_QUEUE = 3;

const WORKSTATIONS: WorkstationConfig[] = [
  { key: 'scan', label: 'SCAN', accent: arcadeColors.neonYellow, blurb: 'Read barcode' },
  { key: 'sort', label: 'SORT', accent: arcadeColors.neonCyan, blurb: 'Route package' },
  { key: 'stamp', label: 'STAMP', accent: arcadeColors.neonPink, blurb: 'Approve packet' },
  { key: 'ship', label: 'SHIP', accent: arcadeColors.neonGreen, blurb: 'Dispatch van' },
];

const JOB_TEMPLATES: Array<{ sender: string; subject: string; steps: WorkstationKey[] }> = [
  { sender: 'Prime Courier', subject: 'Express envelope batch', steps: ['scan', 'sort', 'ship'] },
  { sender: 'City Hall', subject: 'Certified permit packet', steps: ['scan', 'stamp', 'ship'] },
  { sender: 'Mega Mart', subject: 'Receipt archive crate', steps: ['scan', 'sort', 'stamp', 'ship'] },
  { sender: 'Aunt May', subject: 'Birthday parcel with stamps', steps: ['stamp', 'ship'] },
  { sender: 'Tax Office', subject: 'Priority legal pouch', steps: ['scan', 'stamp', 'sort', 'ship'] },
  { sender: 'Tech Vendor', subject: 'Return label stack', steps: ['scan', 'sort', 'ship'] },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function computeJobDurationMs(round: number, combo: number): number {
  const baseMs = 7600;
  const comboReduction = Math.min(combo * 160, 2200);
  const roundReduction = Math.min(Math.max(0, round - 1) * 60, 1800);
  const jitter = Math.floor(Math.random() * 420) - 210;
  return Math.max(2600, baseMs - comboReduction - roundReduction + jitter);
}

function buildJob(round: number, combo: number): MailJob {
  const template = pickRandom(JOB_TEMPLATES);
  const timeLimitMs = computeJobDurationMs(round, combo);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sender: template.sender,
    subject: template.subject,
    steps: template.steps,
    currentStepIndex: 0,
    timeLimitMs,
    timeLeftMs: timeLimitMs,
  };
}

function workstationAccent(key: WorkstationKey): string {
  return WORKSTATIONS.find((station) => station.key === key)?.accent ?? arcadeColors.neonCyan;
}

export default function NeonPostOfficeTycoonGame({
  onBackToHub,
}: NeonPostOfficeTycoonGameProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [round, setRound] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_DURATION_MS);
  const [queue, setQueue] = useState<MailJob[]>([]);

  const missHandledRef = useRef(false);
  const maxQueueSize = combo >= 10 ? MAX_QUEUE : combo >= 5 ? 2 : 1;

  const resetGame = useCallback(() => {
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setLives(STARTING_LIVES);
    setRound(1);
    setTimeLeftMs(ROUND_DURATION_MS);
    setQueue([buildJob(1, 0)]);
    missHandledRef.current = false;
    setPhase('playing');
  }, []);

  const topJob = queue[0] ?? null;

  const fillQueue = useCallback(
    (currentQueue: MailJob[], nextRound: number, currentCombo: number): MailJob[] => {
      const nextQueue = [...currentQueue];
      while (nextQueue.length < maxQueueSize) {
        nextQueue.push(buildJob(nextRound, currentCombo));
      }
      return nextQueue;
    },
    [maxQueueSize],
  );

  const handleMiss = useCallback(() => {
    if (missHandledRef.current) {
      return;
    }
    missHandledRef.current = true;
    setCombo(0);
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

  const handleStationPress = useCallback(
    async (station: WorkstationKey) => {
      if (phase !== 'playing' || !topJob) {
        return;
      }

      const expected = topJob.steps[topJob.currentStepIndex];
      if (station !== expected) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        handleMiss();
        return;
      }

      const finishedJob = topJob.currentStepIndex >= topJob.steps.length - 1;

      if (finishedJob) {
        const nextCombo = combo + 1;
        const nextRound = round + 1;
        const points = 140 + Math.min(520, topJob.steps.length * 50 + combo * 20);

        setScore((current) => current + points);
        setCombo(nextCombo);
        setBestCombo((current) => Math.max(current, nextCombo));
        setRound(nextRound);
        setQueue((currentQueue) => fillQueue(currentQueue.slice(1), nextRound, nextCombo));
      } else {
        setScore((current) => current + 35);
        setQueue((currentQueue) => {
          const [first, ...rest] = currentQueue;
          if (!first) {
            return currentQueue;
          }
          return [
            {
              ...first,
              currentStepIndex: first.currentStepIndex + 1,
            },
            ...rest,
          ];
        });
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [combo, fillQueue, handleMiss, phase, round, topJob],
  );

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

  const scoreTitle =
    score >= 3200 ? 'POSTMASTER LEGEND' : score >= 1800 ? 'SHIFT MANAGER' : 'MAILROOM CLERK';

  if (phase === 'intro') {
    return (
      <View style={[styles.content, { paddingBottom: bottomPad }]}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Run the neon mailroom.</Text>
          <Text style={styles.heroBody}>
            Work the queue by tapping the correct station in order. Each finished job boosts your
            combo and floods the room with more parcels.
          </Text>
        </View>

        <View style={styles.stationGuide}>
          {WORKSTATIONS.map((station) => (
            <View key={station.key} style={[styles.stationGuideCard, { borderColor: station.accent }]}>
              <Text style={[styles.stationGuideTitle, { color: station.accent }]}>{station.label}</Text>
              <Text style={styles.stationGuideBody}>{station.blurb}</Text>
            </View>
          ))}
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>How to play</Text>
          <Text style={styles.ruleLine}>45-second micro-tycoon shift</Text>
          <Text style={styles.ruleLine}>Process the front job before its timer burns out</Text>
          <Text style={styles.ruleLine}>Queue grows from 1 to 3 jobs as your combo climbs</Text>
          <Text style={styles.ruleLine}>Wrong station or expired job costs a life</Text>
        </View>

        <Pressable style={styles.startButton} onPress={resetGame}>
          <Text style={styles.startButtonText}>OPEN POST OFFICE</Text>
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
          <Text style={styles.heroBody}>The city mail routes stayed alive on your watch.</Text>
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

      <View style={styles.queuePanel}>
        <Text style={styles.queueTitle}>MAIL QUEUE</Text>
        {queue.map((job, index) => {
          const activeStep = job.steps[job.currentStepIndex];
          return (
            <View
              key={job.id}
              style={[
                styles.jobCard,
                index === 0 && { borderColor: workstationAccent(activeStep) },
              ]}
            >
              <View style={styles.jobHeader}>
                <Text style={styles.jobSender}>{job.sender}</Text>
                <Text style={[styles.jobStep, { color: workstationAccent(activeStep) }]}>
                  {WORKSTATIONS.find((station) => station.key === activeStep)?.label}
                </Text>
              </View>
              <Text style={styles.jobSubject}>{job.subject}</Text>
              <View style={styles.jobStepsRow}>
                {job.steps.map((step, stepIndex) => (
                  <View
                    key={`${job.id}-${step}-${stepIndex}`}
                    style={[
                      styles.jobStepChip,
                      stepIndex < job.currentStepIndex && styles.jobStepChipDone,
                      stepIndex === job.currentStepIndex && {
                        borderColor: workstationAccent(step),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.jobStepChipText,
                        stepIndex < job.currentStepIndex && styles.jobStepChipTextDone,
                        stepIndex === job.currentStepIndex && { color: workstationAccent(step) },
                      ]}
                    >
                      {WORKSTATIONS.find((station) => station.key === step)?.label}
                    </Text>
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
                        backgroundColor: workstationAccent(activeStep),
                      },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.stationGrid}>
        {WORKSTATIONS.map((station) => (
          <Pressable
            key={station.key}
            style={[
              styles.stationButton,
              {
                borderColor: station.accent,
              },
              topJob?.steps[topJob.currentStepIndex] === station.key && styles.stationButtonActive,
            ]}
            onPress={() => void handleStationPress(station.key)}
          >
            {station.key === 'scan' ? (
              <ArcadeCrosshairIcon size={18} color={station.accent} />
            ) : station.key === 'sort' ? (
              <ArcadeArchiveIcon size={18} color={station.accent} />
            ) : station.key === 'stamp' ? (
              <ArcadeTrashIcon size={18} color={station.accent} />
            ) : (
              <ArcadeComputerIcon size={18} color={station.accent} />
            )}
            <Text style={[styles.stationButtonLabel, { color: station.accent }]}>{station.label}</Text>
            <Text style={styles.stationButtonHint}>{station.blurb}</Text>
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
  stationGuide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  stationGuideCard: {
    width: '48%',
    ...arcadeCard('cyan'),
    padding: 12,
    gap: 6,
  },
  stationGuideTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
  },
  stationGuideBody: {
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
  queuePanel: {
    ...arcadeCard('pink'),
    flex: 1,
    minHeight: 260,
    padding: 14,
    gap: 10,
  },
  queueTitle: {
    ...arcadeTypography.sectionLabel,
  },
  jobCard: {
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 10,
    backgroundColor: arcadeColors.bgPanelElevated,
    padding: 12,
    gap: 8,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  jobSender: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonYellow,
    flex: 1,
  },
  jobStep: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
  },
  jobSubject: {
    ...arcadeTypography.retroBodyBright,
  },
  jobStepsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  jobStepChip: {
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  jobStepChipDone: {
    backgroundColor: 'rgba(102, 255, 153, 0.12)',
    borderColor: 'rgba(102, 255, 153, 0.45)',
  },
  jobStepChipText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 5,
    lineHeight: 9,
    color: arcadeColors.textMuted,
  },
  jobStepChipTextDone: {
    color: arcadeColors.neonGreen,
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
  stationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  stationButton: {
    width: '48%',
    minHeight: 94,
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: arcadeColors.bgPanel,
    padding: 12,
    gap: 8,
    justifyContent: 'center',
  },
  stationButtonActive: {
    backgroundColor: arcadeColors.bgPanelElevated,
  },
  stationButtonLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
  },
  stationButtonHint: {
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
