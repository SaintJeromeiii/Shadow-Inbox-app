import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { InteractionManager } from 'react-native';
import type { CharacterId } from '../types/character';

type RetroSoundKey =
  | 'deleteAction'
  | 'deletePunch'
  | 'deleteWrench'
  | 'deleteSolarBeam'
  | 'actionComplete'
  | 'levelUp';

const SOUND_ASSETS: Record<RetroSoundKey, number> = {
  deleteAction: require('../../assets/audio/delete_action.wav'),
  deletePunch: require('../../assets/audio/delete_punch.wav'),
  deleteWrench: require('../../assets/audio/delete_wrench.wav'),
  deleteSolarBeam: require('../../assets/audio/delete_solar_beam.wav'),
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

let audioReady = false;
let playQueue: Promise<void> = Promise.resolve();
const playerCache = new Map<RetroSoundKey, AudioPlayer>();

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

async function playSoundInternal(key: RetroSoundKey) {
  await ensureAudioMode();
  const player = getPlayer(key);
  player.volume = 0.85;
  await player.seekTo(0);
  player.play();
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

export async function preloadRetroSounds(): Promise<void> {
  await runOnMainThread(async () => {
    await ensureAudioMode();
    const keys: RetroSoundKey[] = [
      'deletePunch',
      'deleteWrench',
      'deleteSolarBeam',
      'actionComplete',
      'levelUp',
    ];
    for (const key of keys) {
      getPlayer(key);
    }
  });
}
