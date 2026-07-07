import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { InteractionManager } from 'react-native';
import type { CharacterId } from '../types/character';

type RetroSoundKey =
  | 'deleteAction'
  | 'deletePunch'
  | 'deleteWrench'
  | 'deleteSolarBeam'
  | 'robotIntroGears'
  | 'wardenIntroPulse'
  | 'quantumIntroHum'
  | 'actionComplete'
  | 'levelUp';

const SOUND_ASSETS: Record<RetroSoundKey, number> = {
  deleteAction: require('../../assets/audio/delete_action.wav'),
  deletePunch: require('../../assets/audio/delete_punch.wav'),
  deleteWrench: require('../../assets/audio/delete_wrench.wav'),
  deleteSolarBeam: require('../../assets/audio/delete_solar_beam.wav'),
  robotIntroGears: require('../../assets/audio/robot_intro_gears.wav'),
  wardenIntroPulse: require('../../assets/audio/warden_intro_pulse.wav'),
  quantumIntroHum: require('../../assets/audio/quantum_intro_hum.wav'),
  actionComplete: require('../../assets/audio/action_complete.wav'),
  levelUp: require('../../assets/audio/level_up.wav'),
};

const CHARACTER_DELETE_SOUND: Record<
  'black_male' | 'robot_neutral' | 'quantum_neutral',
  RetroSoundKey
> = {
  black_male: 'deletePunch',
  robot_neutral: 'deleteWrench',
  quantum_neutral: 'deleteSolarBeam',
};

const CHARACTER_INTRO_AMBIENCE: Partial<
  Record<
    'black_male' | 'robot_neutral' | 'quantum_neutral',
    { key: RetroSoundKey; volume: number }
  >
> = {
  black_male: { key: 'wardenIntroPulse', volume: 0.72 },
  robot_neutral: { key: 'robotIntroGears', volume: 0.74 },
  quantum_neutral: { key: 'quantumIntroHum', volume: 0.9 },
};

let audioReady = false;
let playQueue: Promise<void> = Promise.resolve();
const playerCache = new Map<RetroSoundKey, AudioPlayer>();
const introActiveSessions = new Map<string, RetroSoundKey>();

function runOnMainThread<T>(fn: () => Promise<T> | T): Promise<T> {
  return new Promise((resolve, reject) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        Promise.resolve(fn()).then(resolve).catch(reject);
      });
    });
  });
}

async function ensureAudioMode() {
  if (audioReady) return;

  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'mixWithOthers',
    allowsRecording: false,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });
  audioReady = true;
}

function getPlayer(key: RetroSoundKey): AudioPlayer {
  let player = playerCache.get(key);
  if (!player) {
    player = createAudioPlayer(SOUND_ASSETS[key], {
      keepAudioSessionActive: true,
    });
    player.volume = 0.85;
    playerCache.set(key, player);
  }
  return player;
}

async function playSoundInternal(key: RetroSoundKey, volume = 0.85) {
  await ensureAudioMode();
  const player = getPlayer(key);
  player.loop = false;
  player.volume = volume;
  player.playbackRate = 1;
  player.shouldCorrectPitch = true;
  await player.seekTo(0);
  player.play();
}

function pauseIntroPlayer(key: RetroSoundKey) {
  const player = playerCache.get(key);
  if (!player) return;

  try {
    player.pause();
    player.loop = false;
    void player.seekTo(0);
  } catch (error) {
    console.warn('[RetroSound] Failed to pause intro ambience:', error);
  }
}

function pauseAllCharacterIntroPlayers(): void {
  const introKeys = new Set(
    Object.values(CHARACTER_INTRO_AMBIENCE)
      .map((config) => config?.key)
      .filter((key): key is RetroSoundKey => Boolean(key)),
  );

  for (const key of introKeys) {
    pauseIntroPlayer(key);
  }
}

export function playRetroSound(key: RetroSoundKey): Promise<void> {
  playQueue = playQueue.then(async () => {
    try {
      await runOnMainThread(() => playSoundInternal(key));
    } catch (error) {
      console.warn('[RetroSound] Playback failed:', error);
    }
  });
  return playQueue;
}

export function playCharacterDeleteSound(characterId: CharacterId): Promise<void> {
  const key =
    CHARACTER_DELETE_SOUND[characterId as keyof typeof CHARACTER_DELETE_SOUND] ??
    'deletePunch';
  return playRetroSound(key);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type MilestoneSequenceStep = {
  key: RetroSoundKey;
  volume?: number;
  playbackRate?: number;
  delayAfterMs?: number;
};

const DELETE_MILESTONE_SEQUENCES: MilestoneSequenceStep[][] = [
  [
    { key: 'deletePunch', volume: 0.9, playbackRate: 1.02, delayAfterMs: 110 },
    { key: 'deletePunch', volume: 0.96, playbackRate: 1.08, delayAfterMs: 110 },
    { key: 'deletePunch', volume: 1, playbackRate: 1.14 },
  ],
  [
    { key: 'deleteAction', volume: 0.86, playbackRate: 1.18, delayAfterMs: 120 },
    { key: 'actionComplete', volume: 0.92, playbackRate: 1.08 },
  ],
  [
    { key: 'deleteSolarBeam', volume: 0.82, playbackRate: 0.92, delayAfterMs: 150 },
    { key: 'actionComplete', volume: 0.88, playbackRate: 1.18 },
  ],
  [
    { key: 'deleteWrench', volume: 0.88, playbackRate: 1.06, delayAfterMs: 95 },
    { key: 'deletePunch', volume: 0.96, playbackRate: 1.14, delayAfterMs: 95 },
    { key: 'deleteAction', volume: 0.9, playbackRate: 1.2 },
  ],
  [
    { key: 'actionComplete', volume: 0.88, playbackRate: 1.04, delayAfterMs: 120 },
    { key: 'levelUp', volume: 0.76, playbackRate: 1.12 },
  ],
  [
    { key: 'deleteAction', volume: 0.84, playbackRate: 1.32, delayAfterMs: 75 },
    { key: 'deleteAction', volume: 0.88, playbackRate: 1.42, delayAfterMs: 75 },
    { key: 'actionComplete', volume: 0.9, playbackRate: 1.26 },
  ],
  [
    { key: 'deletePunch', volume: 0.92, playbackRate: 0.84, delayAfterMs: 130 },
    { key: 'deletePunch', volume: 0.97, playbackRate: 0.92, delayAfterMs: 120 },
    { key: 'levelUp', volume: 0.72, playbackRate: 0.94 },
  ],
  [
    { key: 'deleteSolarBeam', volume: 0.84, playbackRate: 1.24, delayAfterMs: 85 },
    { key: 'deleteSolarBeam', volume: 0.82, playbackRate: 1.34, delayAfterMs: 85 },
    { key: 'actionComplete', volume: 0.86, playbackRate: 1.12 },
  ],
  [
    { key: 'deleteWrench', volume: 0.9, playbackRate: 0.9, delayAfterMs: 100 },
    { key: 'deleteWrench', volume: 0.94, playbackRate: 1.02, delayAfterMs: 100 },
    { key: 'deletePunch', volume: 0.98, playbackRate: 1.18 },
  ],
  [
    { key: 'actionComplete', volume: 0.86, playbackRate: 1.22, delayAfterMs: 90 },
    { key: 'actionComplete', volume: 0.9, playbackRate: 1.34, delayAfterMs: 90 },
    { key: 'levelUp', volume: 0.74, playbackRate: 1.28 },
  ],
  [
    { key: 'deleteSolarBeam', volume: 0.8, playbackRate: 0.82, delayAfterMs: 140 },
    { key: 'deleteWrench', volume: 0.9, playbackRate: 1.08, delayAfterMs: 95 },
    { key: 'actionComplete', volume: 0.88, playbackRate: 1.16 },
  ],
  [
    { key: 'deletePunch', volume: 0.92, playbackRate: 1.28, delayAfterMs: 70 },
    { key: 'deletePunch', volume: 0.96, playbackRate: 1.4, delayAfterMs: 70 },
    { key: 'deletePunch', volume: 1, playbackRate: 1.52, delayAfterMs: 70 },
    { key: 'actionComplete', volume: 0.88, playbackRate: 1.12 },
  ],
  [
    { key: 'deleteAction', volume: 0.84, playbackRate: 0.88, delayAfterMs: 110 },
    { key: 'deleteSolarBeam', volume: 0.82, playbackRate: 1.08, delayAfterMs: 110 },
    { key: 'levelUp', volume: 0.72, playbackRate: 1.04 },
  ],
];

let lastMilestoneSequenceIndex = -1;

/** Random retro bonus cue — every N inbox clears. */
export function playRandomDeleteMilestoneSound(): Promise<void> {
  return runOnMainThread(async () => {
    try {
      const availableCount = DELETE_MILESTONE_SEQUENCES.length;
      const randomIndex = Math.floor(Math.random() * availableCount);
      const sequenceIndex =
        availableCount > 1 && randomIndex === lastMilestoneSequenceIndex
          ? (randomIndex + 1) % availableCount
          : randomIndex;
      lastMilestoneSequenceIndex = sequenceIndex;
      const sequence =
        DELETE_MILESTONE_SEQUENCES[sequenceIndex] ?? DELETE_MILESTONE_SEQUENCES[0];

      for (const step of sequence) {
        await ensureAudioMode();
        const player = getPlayer(step.key);
        player.loop = false;
        player.volume = step.volume ?? 0.85;
        player.shouldCorrectPitch = true;
        player.playbackRate = step.playbackRate ?? 1;
        await player.seekTo(0);
        player.play();
        if (step.delayAfterMs) {
          await wait(step.delayAfterMs);
        }
      }
    } catch (error) {
      console.warn('[RetroSound] Milestone playback failed:', error);
    }
  });
}

/** Play the fighter intro sting once (no session bookkeeping). */
export function playCharacterIntroSound(characterId: CharacterId): Promise<void> {
  const config =
    CHARACTER_INTRO_AMBIENCE[characterId as keyof typeof CHARACTER_INTRO_AMBIENCE];
  if (!config) {
    return Promise.resolve();
  }

  return runOnMainThread(async () => {
    try {
      pauseAllCharacterIntroPlayers();
      await playSoundInternal(config.key, config.volume);
    } catch (error) {
      console.warn('[RetroSound] Intro sound failed:', error);
    }
  });
}

/** Start looping intro ambience — caller must stop when the intro video ends. */
export async function startCharacterIntroAmbience(
  characterId: CharacterId,
  sessionId: string,
): Promise<void> {
  stopCharacterIntroAmbience(sessionId);

  const config =
    CHARACTER_INTRO_AMBIENCE[characterId as keyof typeof CHARACTER_INTRO_AMBIENCE];
  if (!config) {
    return;
  }

  try {
    await ensureAudioMode();
    pauseAllCharacterIntroPlayers();
    const player = getPlayer(config.key);
    player.loop = true;
    player.volume = config.volume;
    await player.seekTo(0);
    introActiveSessions.set(sessionId, config.key);
    player.play();
  } catch (error) {
    introActiveSessions.delete(sessionId);
    console.warn('[RetroSound] Intro ambience failed:', error);
  }
}

export function stopCharacterIntroAmbience(sessionId: string): void {
  const key = introActiveSessions.get(sessionId);
  if (!key) {
    return;
  }

  introActiveSessions.delete(sessionId);
  pauseIntroPlayer(key);
}

/** Silence any fighter-preview loops when entering the main inbox. */
export function stopAllCharacterIntroAmbience(): void {
  for (const sessionId of [...introActiveSessions.keys()]) {
    stopCharacterIntroAmbience(sessionId);
  }
}

export async function preloadRetroSounds(): Promise<void> {
  await runOnMainThread(async () => {
    await ensureAudioMode();
    const keys: RetroSoundKey[] = [
      'deletePunch',
      'deleteWrench',
      'deleteSolarBeam',
      'robotIntroGears',
      'wardenIntroPulse',
      'quantumIntroHum',
      'actionComplete',
      'levelUp',
    ];
    for (const key of keys) {
      getPlayer(key);
    }
  });
}
