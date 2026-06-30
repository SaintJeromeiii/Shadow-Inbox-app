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
  quantum_neutral: { key: 'quantumIntroHum', volume: 0.52 },
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

  introActiveSessions.set(sessionId, config.key);

  try {
    await ensureAudioMode();
    if (!introActiveSessions.has(sessionId)) {
      return;
    }

    const player = getPlayer(config.key);
    player.loop = true;
    player.volume = config.volume;
    await player.seekTo(0);
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
