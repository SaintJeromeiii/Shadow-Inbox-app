import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { arcadeColors, arcadeFonts, neonCyanText } from '../theme/arcadeTheme';

const TRANSITION_MS = 3200;

interface QuantumRealmTransitionScreenProps {
  onComplete: () => void;
}

export default function QuantumRealmTransitionScreen({
  onComplete,
}: QuantumRealmTransitionScreenProps) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const completedRef = useRef(false);

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onComplete();
  };

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    const driftLoop = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: 4800,
        useNativeDriver: true,
      }),
    );

    pulseLoop.start();
    driftLoop.start();

    const timeoutId = setTimeout(() => {
      finish();
    }, TRANSITION_MS);

    return () => {
      clearTimeout(timeoutId);
      pulseLoop.stop();
      driftLoop.stop();
    };
  }, [drift, pulse]);

  const scanOffset = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 120],
  });

  return (
    <Pressable
      style={styles.root}
      onPress={finish}
      accessibilityRole="button"
      accessibilityLabel="Enter the quantum realm"
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.vignette} />
        <View style={styles.gridLayer} pointerEvents="none">
          {Array.from({ length: 12 }).map((_, index) => (
            <View key={`h-${index}`} style={[styles.gridLineH, { top: index * 36 }]} />
          ))}
        </View>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanBeam,
            {
              transform: [{ translateY: scanOffset }],
              opacity: pulse,
            },
          ]}
        />

        <View style={styles.content}>
          <Text style={styles.kicker}>VOID SINGULARITY ONLINE</Text>
          <Animated.Text style={[styles.headline, { opacity: pulse }]}>
            HEADING INTO{'\n'}THE QUANTUM REALM
          </Animated.Text>
          <Text style={styles.subline}>Collapsing probability fields…</Text>
          <Text style={styles.tapHint}>TAP TO ENTER</Text>
        </View>

        <View style={styles.particleRow} pointerEvents="none">
          {['◆', '✦', '◇', '✧', '◆'].map((glyph, index) => (
            <Animated.Text
              key={`${glyph}-${index}`}
              style={[styles.particle, { opacity: pulse }]}
            >
              {glyph}
            </Animated.Text>
          ))}
        </View>
      </SafeAreaView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050010',
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(88, 24, 140, 0.22)',
  },
  gridLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(179, 102, 255, 0.14)',
  },
  scanBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: 'rgba(51, 255, 255, 0.08)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(51, 255, 255, 0.35)',
  },
  content: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 14,
    borderWidth: 3,
    borderColor: 'rgba(179, 102, 255, 0.75)',
    borderRadius: 8,
    backgroundColor: 'rgba(10, 8, 28, 0.92)',
    paddingHorizontal: 20,
    paddingVertical: 28,
    shadowColor: arcadeColors.neonPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 10,
  },
  kicker: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    letterSpacing: 0.8,
    color: arcadeColors.neonPurple,
    textAlign: 'center',
  },
  headline: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 11,
    lineHeight: 18,
    letterSpacing: 0.8,
    textAlign: 'center',
    ...neonCyanText(),
  },
  subline: {
    fontFamily: arcadeFonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: arcadeColors.textMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  tapHint: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonYellow,
    letterSpacing: 0.6,
    marginTop: 4,
  },
  particleRow: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    gap: 18,
  },
  particle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    color: arcadeColors.neonPink,
  },
});
