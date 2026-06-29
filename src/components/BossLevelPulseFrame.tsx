import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface BossLevelPulseFrameProps {
  active: boolean;
  children: ReactNode;
}

export default function BossLevelPulseFrame({ active, children }: BossLevelPulseFrameProps) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: false,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [active, pulse]);

  const borderColor = pulse.interpolate({
    inputRange: [0.35, 1],
    outputRange: ['rgba(255, 51, 51, 0.35)', 'rgba(255, 51, 51, 1)'],
  });

  const shadowOpacity = pulse.interpolate({
    inputRange: [0.35, 1],
    outputRange: [0.2, 0.85],
  });

  if (!active) {
    return <View style={styles.inactive}>{children}</View>;
  }

  return (
    <Animated.View
      style={[
        styles.active,
        {
          borderColor,
          shadowOpacity,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inactive: {
    flex: 1,
  },
  active: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    overflow: 'hidden',
    shadowColor: '#FF3333',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 8,
  },
});
