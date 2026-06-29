import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PRIMARY_DRAWER_ITEMS,
  SECONDARY_DRAWER_ITEMS,
  type DrawerRoute,
} from '../types/navigation';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface SideDeckDrawerProps {
  open: boolean;
  activeRoute: DrawerRoute;
  onNavigate: (route: DrawerRoute) => void;
  onClose: () => void;
}

const DRAWER_WIDTH = 288;

export default function SideDeckDrawer({
  open,
  activeRoute,
  onNavigate,
  onClose,
}: SideDeckDrawerProps) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: open ? 0 : -DRAWER_WIDTH,
      friction: 9,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  const gridRows = Array.from({ length: 18 }, (_, index) => index);
  const gridCols = Array.from({ length: 10 }, (_, index) => index);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.drawer,
            {
              width: DRAWER_WIDTH,
              paddingTop: insets.top + 12,
              paddingBottom: insets.bottom + 12,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={styles.gridLayer} pointerEvents="none">
            {gridRows.map((row) => (
              <View key={`h-${row}`} style={[styles.gridLineH, { top: row * 28 }]} />
            ))}
            {gridCols.map((col) => (
              <View key={`v-${col}`} style={[styles.gridLineV, { left: col * 28 }]} />
            ))}
          </View>

          <Text style={styles.deckTitle}>SIDE DECK</Text>
          <Text style={styles.deckSubtitle}>Navigation matrix</Text>

          <View style={styles.menuSection}>
            {PRIMARY_DRAWER_ITEMS.map((item) => {
              const isActive = activeRoute === item.route;
              return (
                <Pressable
                  key={item.route}
                  style={({ pressed }) => [
                    styles.menuItem,
                    isActive && styles.menuItemActive,
                    pressed && styles.menuItemPressed,
                  ]}
                  onPress={() => onNavigate(item.route)}
                >
                  <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                    {item.label}
                  </Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.divider} />

          <View style={styles.menuSection}>
            {SECONDARY_DRAWER_ITEMS.map((item) => {
              const isActive = activeRoute === item.route;
              return (
                <Pressable
                  key={item.route}
                  style={({ pressed }) => [
                    styles.menuItemSecondary,
                    isActive && styles.menuItemActive,
                    pressed && styles.menuItemPressed,
                  ]}
                  onPress={() => onNavigate(item.route)}
                >
                  <Text style={[styles.menuLabelSecondary, isActive && styles.menuLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 8, 18, 0.72)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000',
    borderRightWidth: 3,
    borderRightColor: arcadeColors.neonPink,
    paddingHorizontal: 14,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
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
    backgroundColor: 'rgba(51, 255, 255, 0.12)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(51, 255, 255, 0.1)',
  },
  deckTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    lineHeight: 16,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  deckSubtitle: {
    fontFamily: arcadeFonts.body,
    fontSize: 11,
    color: arcadeColors.textMuted,
    marginBottom: 18,
  },
  menuSection: {
    gap: 8,
  },
  menuItem: {
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(10, 20, 40, 0.88)',
    gap: 4,
  },
  menuItemSecondary: {
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(10, 20, 40, 0.65)',
  },
  menuItemActive: {
    borderColor: arcadeColors.neonCyan,
    backgroundColor: 'rgba(51, 255, 255, 0.08)',
  },
  menuItemPressed: {
    opacity: 0.82,
  },
  menuLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.neonPink,
    letterSpacing: 0.3,
  },
  menuLabelSecondary: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.textMuted,
    letterSpacing: 0.2,
  },
  menuLabelActive: {
    color: arcadeColors.neonCyan,
  },
  menuSubtitle: {
    fontFamily: arcadeFonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: arcadeColors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: arcadeColors.borderMuted,
    marginVertical: 14,
  },
});
