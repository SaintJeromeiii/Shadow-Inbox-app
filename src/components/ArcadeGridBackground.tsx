import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { arcadeColors } from '../theme/arcadeTheme';

interface ArcadeGridBackgroundProps {
  children?: React.ReactNode;
}

/**
 * Deep midnight backdrop with a subtle neon-blue grid (80s arcade CRT vibe).
 */
export default function ArcadeGridBackground({ children }: ArcadeGridBackgroundProps) {
  const rows = useRef(Array.from({ length: 28 }, (_, i) => i)).current;
  const cols = useRef(Array.from({ length: 16 }, (_, i) => i)).current;

  return (
    <View style={styles.root}>
      <View style={styles.gridLayer} pointerEvents="none">
        {rows.map((row) => (
          <View key={`h-${row}`} style={[styles.gridLineH, { top: row * 28 }]} />
        ))}
        {cols.map((col) => (
          <View key={`v-${col}`} style={[styles.gridLineV, { left: col * 28 }]} />
        ))}
        <View style={styles.vignetteTop} />
        <View style={styles.vignetteBottom} />
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: arcadeColors.bgDeep,
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
    backgroundColor: arcadeColors.gridLine,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: arcadeColors.gridLine,
  },
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(3, 8, 18, 0.55)',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(3, 8, 18, 0.45)',
  },
  content: {
    flex: 1,
  },
});
