import { useEffect, useRef, useState } from 'react';
import {
  Image,
  InteractionManager,
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { getCharacterVisualTierAssets } from '../constants/characters';
import {
  startCharacterIntroAmbience,
  stopCharacterIntroAmbience,
  stopAllCharacterIntroAmbience,
} from '../services/retroSoundService';
import type { CharacterId } from '../types/character';
import { arcadeColors } from '../theme/arcadeTheme';
import { AVATAR_ASPECT_RATIO } from './DynamicAvatar';

interface FighterIntroPreviewProps {
  characterId: CharacterId;
  /** Bump to replay intro for the current fighter. */
  replayKey: number;
  /** When false, intro is idle and audio is silenced. */
  isActive: boolean;
}

type IntroPhase = 'idle' | 'playing' | 'done';

export default function FighterIntroPreview({
  characterId,
  replayKey,
  isActive,
}: FighterIntroPreviewProps) {
  const assets = getCharacterVisualTierAssets(characterId, 1);
  const sessionKey = `${characterId}-${replayKey}`;
  const [phase, setPhase] = useState<IntroPhase>('idle');
  const phaseRef = useRef<IntroPhase>('idle');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!isActive) {
      stopAllCharacterIntroAmbience();
      setPhase('idle');
      return;
    }

    setPhase('playing');
  }, [isActive, sessionKey]);

  useEffect(() => {
    return () => {
      stopAllCharacterIntroAmbience();
    };
  }, []);

  const showVideo = isActive && phase === 'playing' && assets.intro != null;

  return (
    <View style={styles.frame} collapsable={false}>
      <Image
        source={assets.still}
        style={[styles.media, pixelatedImageStyle]}
        resizeMode="contain"
        accessibilityLabel="Fighter portrait"
      />
      {showVideo && assets.intro != null ? (
        <FighterIntroVideo
          key={sessionKey}
          source={assets.intro}
          characterId={characterId}
          onFinished={() => {
            if (phaseRef.current === 'playing') {
              setPhase('done');
            }
          }}
        />
      ) : null}
    </View>
  );
}

interface FighterIntroVideoProps {
  source: number;
  characterId: CharacterId;
  onFinished: () => void;
}

function FighterIntroVideo({ source, characterId, onFinished }: FighterIntroVideoProps) {
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const finishedRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const audioStartedRef = useRef(false);
  const audioSessionIdRef = useRef(`fighter-preview-${characterId}-${Math.random().toString(36).slice(2)}`);

  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.audioMixingMode = 'mixWithOthers';
    instance.timeUpdateEventInterval = 0.25;
  });

  useEffect(() => {
    let active = true;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    finishedRef.current = false;
    playbackStartedRef.current = false;
    audioStartedRef.current = false;

    const finish = () => {
      if (!active || finishedRef.current || !playbackStartedRef.current) {
        return;
      }
      finishedRef.current = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      try {
        player.loop = false;
        player.pause();
      } catch {
        // Player may already be released.
      }
      stopCharacterIntroAmbience(audioSessionIdRef.current);
      onFinishedRef.current();
    };

    const startAudio = () => {
      if (!active || audioStartedRef.current) {
        return;
      }
      audioStartedRef.current = true;
      void startCharacterIntroAmbience(characterId, audioSessionIdRef.current);
    };

    const startPlayback = () => {
      if (!active || finishedRef.current || playbackStartedRef.current) {
        return;
      }
      playbackStartedRef.current = true;
      try {
        player.loop = false;
        player.currentTime = 0;
        player.play();
      } catch {
        playbackStartedRef.current = false;
        return;
      }
      startAudio();
      safetyTimer = setTimeout(finish, 10_000);
    };

    const statusSubscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        startPlayback();
      }
    });

    const playingSubscription = player.addListener('playingChange', ({ isPlaying }) => {
      if (!active || finishedRef.current) {
        return;
      }
      if (isPlaying) {
        startAudio();
        return;
      }
      if (!playbackStartedRef.current) {
        return;
      }
      const duration = player.duration;
      const currentTime = player.currentTime;
      if (duration > 0 && currentTime >= duration - 0.3) {
        finish();
      }
    });

    const endSubscription = player.addListener('playToEnd', () => {
      finish();
    });

    const timeSubscription = player.addListener('timeUpdate', ({ currentTime }) => {
      const duration = player.duration;
      if (duration > 0 && currentTime >= duration - 0.2) {
        finish();
      }
    });

    const kickoff = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (!active || finishedRef.current) {
          return;
        }
        if (player.status === 'readyToPlay') {
          startPlayback();
        }
      });
    });

    return () => {
      active = false;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
      }
      kickoff.cancel();
      statusSubscription.remove();
      playingSubscription.remove();
      endSubscription.remove();
      timeSubscription.remove();
      stopCharacterIntroAmbience(audioSessionIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  return (
    <VideoView
      player={player}
      style={[styles.media, styles.mediaOverlay, pixelatedImageStyle]}
      contentFit="contain"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
      accessibilityLabel="Fighter intro video"
    />
  );
}

const pixelatedImageStyle: StyleProp<ImageStyle> =
  Platform.OS === 'web'
    ? ({ imageRendering: 'pixelated' } as ImageStyle)
    : undefined;

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: AVATAR_ASPECT_RATIO,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: arcadeColors.bgDeep,
  },
  media: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  mediaOverlay: {
    zIndex: 2,
  },
});
