import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArcadeSoundWaveIcon } from './ArcadeIcons';
import { arcadeColors, arcadeFonts, neonPinkText } from '../theme/arcadeTheme';

interface ActionCompleteToastProps {
  visible: boolean;
  message: string;
}

export default function ActionCompleteToast({ visible, message }: ActionCompleteToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-24)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -24, duration: 180, useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, opacity, translateY, pulse]);

  const waveScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  return (
    <View style={styles.overlay} pointerEvents="none">
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Animated.View
          style={[
            styles.bubble,
            {
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: waveScale }] }}>
            <ArcadeSoundWaveIcon size={22} color={arcadeColors.neonPink} />
          </Animated.View>
          <View style={styles.copy}>
            <Text style={styles.title}>{message}</Text>
            <Text style={styles.subtitle}>+1000 XP</Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  safe: {
    alignItems: 'center',
    paddingTop: 8,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: 'rgba(10, 20, 40, 0.94)',
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    borderRadius: 8,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
    elevation: 12,
  },
  copy: {
    gap: 2,
  },
  title: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 9,
    lineHeight: 14,
    letterSpacing: 0.5,
    ...neonPinkText(),
  },
  subtitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.5,
  },
});
