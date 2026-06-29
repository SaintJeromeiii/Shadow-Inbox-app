import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { arcadeColors, arcadeFonts, neonPinkText } from '../theme/arcadeTheme';

interface LevelUpFlashProps {
  visible: boolean;
  tierName: string;
  onFinished?: () => void;
}

export default function LevelUpFlash({ visible, tierName, onFinished }: LevelUpFlashProps) {
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.7)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      flashOpacity.setValue(0);
      titleScale.setValue(0.7);
      titleOpacity.setValue(0);
      return;
    }

    const sequence = Animated.sequence([
      Animated.timing(flashOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(titleScale, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(1400),
      Animated.parallel([
        Animated.timing(flashOpacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 0,
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
  }, [visible, flashOpacity, titleOpacity, titleScale, onFinished]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={styles.root} pointerEvents="none">
        <Animated.View style={[styles.flashLayer, { opacity: flashOpacity }]} />
        <Animated.View
          style={[
            styles.copyWrap,
            {
              opacity: titleOpacity,
              transform: [{ scale: titleScale }],
            },
          ]}
        >
          <Text style={styles.levelUp}>LEVEL UP!</Text>
          <Text style={styles.tierName}>{tierName.toUpperCase()}</Text>
          <Text style={styles.subtitle}>NEW ARMOR EQUIPPED</Text>
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
  },
  flashLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 102, 204, 0.42)',
    borderWidth: 6,
    borderColor: arcadeColors.neonCyan,
  },
  copyWrap: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: 'rgba(3, 8, 18, 0.88)',
    borderWidth: 3,
    borderColor: arcadeColors.neonPink,
    borderRadius: 8,
  },
  levelUp: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1,
    ...neonPinkText(),
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
  subtitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    color: arcadeColors.neonYellow,
    letterSpacing: 0.8,
  },
});
