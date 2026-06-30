import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
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
  replayToken?: number;
}

interface AvatarIntroVideoProps {
  source: number;
  characterId: CharacterId;
  sessionId: string;
  onEnd: () => void;
}

function AvatarIntroVideo({
  source,
  characterId,
  sessionId,
  onEnd,
}: AvatarIntroVideoProps) {
  const introSoundActiveRef = useRef(false);

  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.muted = true;
    instance.audioMixingMode = 'mixWithOthers';
  });

  const stopIntroSound = useCallback(() => {
    introSoundActiveRef.current = false;
    stopCharacterIntroAmbience(sessionId);
  }, [sessionId]);

  useEffect(() => {
    introSoundActiveRef.current = false;

    const playingSubscription = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying && !introSoundActiveRef.current) {
        introSoundActiveRef.current = true;
        void startCharacterIntroAmbience(characterId, sessionId);
      }
    });

    const endSubscription = player.addListener('playToEnd', () => {
      stopIntroSound();
      player.pause();
      onEnd();
    });

    player.currentTime = 0;
    player.play();

    return () => {
      playingSubscription.remove();
      endSubscription.remove();
      player.pause();
      stopIntroSound();
    };
  }, [player, characterId, sessionId, onEnd, stopIntroSound]);

  return (
    <VideoView
      player={player}
      style={[styles.media, styles.mediaOverlay, pixelatedImageStyle]}
      contentFit="contain"
      nativeControls={false}
      allowsFullscreen={false}
      accessibilityLabel="Character intro video"
    />
  );
}

export default function DynamicAvatar({
  characterId: characterIdProp,
  visualTier: visualTierProp,
  inboxCount = 0,
  enableIntro = true,
  replayToken = 0,
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
    setIsVideoPlaying(false);
  }, []);

  return (
    <View style={styles.frame}>
      <View style={styles.mediaShell}>
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
            onEnd={handleIntroEnd}
          />
        ) : null}
      </View>
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
  },
  mediaShell: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: arcadeColors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
