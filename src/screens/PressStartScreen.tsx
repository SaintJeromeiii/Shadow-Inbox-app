import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { arcadeColors, arcadeFonts, neonCyanText, neonPinkText } from '../theme/arcadeTheme';

interface PressStartScreenProps {
  onStart: () => void;
}

export default function PressStartScreen({ onStart }: PressStartScreenProps) {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.2,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [blink]);

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStart();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.frame}>
        <View style={styles.titleBlock}>
          <Text style={styles.kickerLine} numberOfLines={1} adjustsFontSizeToFit>
            AI INBOX ARCADE
          </Text>
          <Text style={styles.titleLine} numberOfLines={2} adjustsFontSizeToFit>
            SHADOW INBOX
          </Text>
          <Text style={styles.tagline}>Sort noise. Draft replies. Clear the queue.</Text>
        </View>

        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Press Start"
          style={({ pressed }) => [styles.pressStartWrap, pressed && styles.pressStartPressed]}
        >
          <Animated.Text style={[styles.pressStart, { opacity: blink }]}>
            PRESS START
          </Animated.Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  frame: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 36,
    paddingHorizontal: 20,
    paddingVertical: 32,
    borderWidth: 3,
    borderColor: arcadeColors.borderPink,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 20, 40, 0.82)',
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  titleBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  kickerLine: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 0.8,
    textAlign: 'center',
    ...neonPinkText(),
  },
  tagline: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    textAlign: 'center',
    color: arcadeColors.textDim,
    letterSpacing: 0.3,
    paddingHorizontal: 8,
  },
  titleLine: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 14,
    lineHeight: 22,
    letterSpacing: 1,
    textAlign: 'center',
    ...neonCyanText(),
  },
  pressStartWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pressStartPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  pressStart: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    lineHeight: 16,
    letterSpacing: 1,
    color: arcadeColors.neonYellow,
    textAlign: 'center',
    textShadowColor: arcadeColors.neonYellow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
});
