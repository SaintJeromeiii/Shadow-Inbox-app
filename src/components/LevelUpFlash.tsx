import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import DynamicAvatar from './DynamicAvatar';
import { useCharacter } from '../context/CharacterContext';
import {
  arcadeCard,
  arcadeColors,
  arcadeFonts,
  arcadeTypography,
  neonPinkText,
} from '../theme/arcadeTheme';

interface LevelUpFlashProps {
  visible: boolean;
  tierName: string;
  onFinished?: () => void;
}

export default function LevelUpFlash({ visible, tierName, onFinished }: LevelUpFlashProps) {
  const { character } = useCharacter();
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const popupScale = useRef(new Animated.Value(0.82)).current;
  const popupOpacity = useRef(new Animated.Value(0)).current;
  const shimmerX = useRef(new Animated.Value(-220)).current;
  const promptOpacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!visible) {
      flashOpacity.setValue(0);
      popupScale.setValue(0.82);
      popupOpacity.setValue(0);
      shimmerX.setValue(-220);
      promptOpacity.setValue(0.35);
      return;
    }

    const sequence = Animated.sequence([
      Animated.timing(flashOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(popupScale, {
          toValue: 1,
          friction: 6,
          tension: 90,
          useNativeDriver: true,
        }),
        Animated.timing(popupOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(180),
          Animated.timing(shimmerX, {
            toValue: 260,
            duration: 650,
            useNativeDriver: true,
          }),
        ]),
        Animated.loop(
          Animated.sequence([
            Animated.timing(promptOpacity, {
              toValue: 1,
              duration: 360,
              useNativeDriver: true,
            }),
            Animated.timing(promptOpacity, {
              toValue: 0.35,
              duration: 360,
              useNativeDriver: true,
            }),
          ]),
          { iterations: 3 },
        ),
      ]),
      Animated.delay(1700),
      Animated.parallel([
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(popupOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(popupScale, {
          toValue: 0.94,
          duration: 260,
          useNativeDriver: true,
        }),
      ]),
    ]);

    sequence.start(({ finished }) => {
      if (finished) {
        onFinished?.();
      }
    });

    return () => {
      sequence.stop();
    };
  }, [visible, flashOpacity, onFinished, popupOpacity, popupScale, promptOpacity, shimmerX]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={styles.root} pointerEvents="none">
        <Animated.View style={[styles.flashLayer, { opacity: flashOpacity }]} />
        <Animated.View
          style={[
            styles.popupWrap,
            {
              opacity: popupOpacity,
              transform: [{ scale: popupScale }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.shimmer,
              {
                transform: [{ translateX: shimmerX }, { rotate: '-18deg' }],
              },
            ]}
          />
          <Text style={styles.levelUp}>LEVEL UP!</Text>
          <View style={styles.avatarFrame}>
            <DynamicAvatar
              characterId={character.id}
              enableIntro={false}
              enableIntroAudio={false}
            />
          </View>
          <View style={styles.badgeRow}>
            <View style={styles.pixelBadge}>
              <Text style={styles.badgeText}>1UP</Text>
            </View>
            <Text style={styles.badgeLabel}>ARMOR CLASS UNLOCKED</Text>
          </View>
          <Text style={styles.characterName}>{character.codename.toUpperCase()}</Text>
          <Text style={styles.tierName}>{tierName.toUpperCase()}</Text>
          <View style={styles.divider} />
          <Text style={styles.subtitle}>NEW ARMOR EQUIPPED</Text>
          <Text style={styles.supportingCopy}>Inbox Zero warrior status increased.</Text>
          <Text style={styles.unlockLine}>NEW MOVE UNLOCKED: MAILROOM OVERDRIVE</Text>
          <Animated.Text style={[styles.promptText, { opacity: promptOpacity }]}>
            PRESS START TO CONTINUE
          </Animated.Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  flashLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 8, 18, 0.56)',
  },
  popupWrap: {
    ...arcadeCard('pink'),
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  avatarFrame: {
    width: 110,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: arcadeColors.bgDeep,
  },
  shimmer: {
    position: 'absolute',
    top: -16,
    bottom: -16,
    width: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  levelUp: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: 1,
    ...neonPinkText(),
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pixelBadge: {
    backgroundColor: arcadeColors.neonYellow,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 9,
    color: arcadeColors.bgDeep,
  },
  badgeLabel: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textMuted,
  },
  characterName: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonGreen,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  tierName: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    lineHeight: 16,
    color: arcadeColors.neonCyan,
    textAlign: 'center',
    textShadowColor: arcadeColors.neonCyanGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  divider: {
    width: '100%',
    height: 2,
    backgroundColor: arcadeColors.borderMuted,
  },
  subtitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    color: arcadeColors.neonYellow,
    letterSpacing: 0.8,
  },
  supportingCopy: {
    ...arcadeTypography.retroCaption,
    textAlign: 'center',
  },
  unlockLine: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonPink,
    textAlign: 'center',
  },
  promptText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonYellow,
    textAlign: 'center',
    marginTop: 2,
  },
});
