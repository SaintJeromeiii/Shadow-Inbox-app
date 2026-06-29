import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import {
  getCharacterRegistryEntry,
  getCharacterVisualTierAssets,
} from '../constants/characters';
import { useCharacter } from '../context/CharacterContext';
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
  const videoRef = useRef<Video>(null);

  const restartIntro = useCallback(async () => {
    if (!canPlayIntro) {
      setIsVideoPlaying(false);
      return;
    }

    setIsVideoPlaying(true);
    try {
      await videoRef.current?.setPositionAsync(0);
      await videoRef.current?.playAsync();
    } catch {
      setIsVideoPlaying(false);
    }
  }, [canPlayIntro]);

  useEffect(() => {
    if (!canPlayIntro) {
      setIsVideoPlaying(false);
      return;
    }

    void restartIntro();
  }, [canPlayIntro, replayToken, characterId, visualTier, restartIntro]);

  const handlePlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.didJustFinish) {
      setIsVideoPlaying(false);
    }
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
          <Video
            ref={videoRef}
            source={tierAssets.intro}
            style={[styles.media, styles.mediaOverlay, pixelatedImageStyle]}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping={false}
            onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            accessibilityLabel={`${registryEntry.codename} intro`}
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
