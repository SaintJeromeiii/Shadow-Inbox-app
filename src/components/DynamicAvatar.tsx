import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  getCharacterRegistryEntry,
  getCharacterVisualTierAssets,
} from '../constants/characters';
import { useCharacter } from '../context/CharacterContext';
import {
  startCharacterIntroAmbience,
  stopCharacterIntroAmbience,
} from '../services/retroSoundService';
import type { CharacterId, VisualTier } from '../types/character';
import { getVisualTierFromInboxCount } from '../utils/visualTier';
import { arcadeColors } from '../theme/arcadeTheme';

/** Shared portrait frame — video and still use identical dimensions to prevent layout shift. */
export const AVATAR_ASPECT_RATIO = 3 / 4;

export interface DynamicAvatarProps {
  characterId?: CharacterId;
  /** Explicit visual tier override (skips inbox-derived tier). */
  visualTier?: VisualTier;
  /** Inbox signal count — drives visual tier when visualTier is omitted. */
  inboxCount?: number;
  enableIntro?: boolean;
  /** Play intro ambience in sync with the intro clip. */
  enableIntroAudio?: boolean;
  /** When true, loop video + ambience; default is play once then show still. */
  holdIntro?: boolean;
  replayToken?: number;
  onIntroEnd?: () => void;
}

interface AvatarIntroVideoProps {
  source: number;
  characterId: CharacterId;
  sessionId: string;
  enableIntroAudio: boolean;
  loopIntro: boolean;
  onEnd: () => void;
}

function AvatarIntroVideo({
  source,
  characterId,
  sessionId,
  enableIntroAudio,
  loopIntro,
  onEnd,
}: AvatarIntroVideoProps) {
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const audioStartedRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const finishedRef = useRef(false);

  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.audioMixingMode = 'mixWithOthers';
    instance.timeUpdateEventInterval = 0.25;
  });

  useEffect(() => {
    let active = true;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    audioStartedRef.current = false;
    playbackStartedRef.current = false;
    finishedRef.current = false;
    player.loop = loopIntro;

    const finishIntro = () => {
      if (!active || finishedRef.current || loopIntro || !playbackStartedRef.current) {
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
      stopCharacterIntroAmbience(sessionId);
      onEndRef.current();
    };

    const startAudio = () => {
      if (!active || !enableIntroAudio || audioStartedRef.current) {
        return;
      }
      audioStartedRef.current = true;
      void startCharacterIntroAmbience(characterId, sessionId);
    };

    const beginPlayback = () => {
      if (!active || playbackStartedRef.current || finishedRef.current) {
        return;
      }
      playbackStartedRef.current = true;
      try {
        player.loop = loopIntro;
        player.currentTime = 0;
        player.play();
      } catch {
        playbackStartedRef.current = false;
        return;
      }
      startAudio();
      if (!loopIntro) {
        safetyTimer = setTimeout(finishIntro, 10_000);
      }
    };

    const statusSubscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        beginPlayback();
      }
    });

    const playingSubscription = player.addListener('playingChange', ({ isPlaying }) => {
      if (!active || finishedRef.current || loopIntro) {
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
        finishIntro();
      }
    });

    const endSubscription = player.addListener('playToEnd', () => {
      finishIntro();
    });

    const timeSubscription = loopIntro
      ? null
      : player.addListener('timeUpdate', ({ currentTime }) => {
          const duration = player.duration;
          if (duration > 0 && currentTime >= duration - 0.2) {
            finishIntro();
          }
        });

    const kickoff = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (!active || finishedRef.current) {
          return;
        }
        if (player.status === 'readyToPlay') {
          beginPlayback();
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
      timeSubscription?.remove();
      stopCharacterIntroAmbience(sessionId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, characterId, enableIntroAudio, loopIntro]);

  return (
    <VideoView
      player={player}
      style={[styles.media, styles.mediaOverlay, pixelatedImageStyle]}
      contentFit="contain"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      surfaceType={Platform.OS === 'android' ? 'textureView' : undefined}
      accessibilityLabel="Character intro video"
    />
  );
}

export default function DynamicAvatar({
  characterId: characterIdProp,
  visualTier: visualTierProp,
  inboxCount = 0,
  enableIntro = true,
  enableIntroAudio = false,
  holdIntro = false,
  replayToken = 0,
  onIntroEnd,
}: DynamicAvatarProps) {
  const { characterId: activeCharacterId } = useCharacter();
  const characterId = characterIdProp ?? activeCharacterId;
  const registryEntry = getCharacterRegistryEntry(characterId);

  const visualTier = useMemo(() => {
    if (visualTierProp != null) {
      return Math.min(visualTierProp, registryEntry.maxVisualTier) as VisualTier;
    }
    return getVisualTierFromInboxCount(inboxCount, registryEntry.maxVisualTier);
  }, [visualTierProp, inboxCount, registryEntry.maxVisualTier]);

  const tierAssets = useMemo(
    () => getCharacterVisualTierAssets(characterId, visualTier),
    [characterId, visualTier],
  );

  const canPlayIntro = enableIntro && tierAssets.intro != null;
  const [isVideoPlaying, setIsVideoPlaying] = useState(canPlayIntro);
  const introSessionKey = `${characterId}-${visualTier}-${replayToken}`;

  useEffect(() => {
    setIsVideoPlaying(canPlayIntro);
  }, [canPlayIntro, introSessionKey]);

  const handleIntroEnd = useCallback(() => {
    if (!holdIntro) {
      setIsVideoPlaying(false);
    }
    onIntroEnd?.();
  }, [holdIntro, onIntroEnd]);

  return (
    <View style={styles.frame} collapsable={false}>
      <Image
        source={tierAssets.still}
        style={[styles.media, pixelatedImageStyle]}
        resizeMode="contain"
        accessibilityLabel={`${registryEntry.codename} tier ${visualTier} avatar`}
      />
      {canPlayIntro && isVideoPlaying && tierAssets.intro != null ? (
        <AvatarIntroVideo
          key={introSessionKey}
          source={tierAssets.intro}
          characterId={characterId}
          sessionId={`avatar-intro-${introSessionKey}`}
          enableIntroAudio={enableIntroAudio}
          loopIntro={holdIntro}
          onEnd={handleIntroEnd}
        />
      ) : null}
    </View>
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
