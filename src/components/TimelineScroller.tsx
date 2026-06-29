import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  Animated,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AccountKey } from '../types/account';
import type { TimelineHourBlock, TimelinePeakUrgency } from '../types/timeline';
import { fetchTimeline } from '../services/timelineService';
import {
  arcadeColors,
  arcadePanel,
  arcadeTypography,
} from '../theme/arcadeTheme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

function formatMilitaryHour(hourStr: string): string {
  const numericHour = parseInt(hourStr.substring(0, 2), 10);
  if (Number.isNaN(numericHour)) return hourStr;

  const ampm = numericHour >= 12 ? 'PM' : 'AM';
  const displayHour = numericHour % 12 === 0 ? 12 : numericHour % 12;

  return `${displayHour}:00 ${ampm}`;
}

function urgencyColor(urgency: TimelinePeakUrgency): string {
  switch (urgency) {
    case 'critical':
      return arcadeColors.neonRed;
    case 'elevated':
      return arcadeColors.neonYellow;
    case 'routine':
      return arcadeColors.neonCyan;
    default:
      return arcadeColors.textDim;
  }
}

function formatSignalTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface TimelineHourSheetProps {
  block: TimelineHourBlock | null;
  visible: boolean;
  onClose: () => void;
}

function TimelineHourSheet({ block, visible, onClose }: TimelineHourSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
    }).start();
  }, [slideAnim, visible]);

  if (!block) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            paddingBottom: Math.max(insets.bottom, 16),
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetTitle}>
              {formatMilitaryHour(block.hourLabel)} DEEP DIVE
            </Text>
            <Text style={styles.sheetSubtitle}>
              {formatMilitaryHour(block.hourLabel)} · {block.counts.total} signal
              {block.counts.total === 1 ? '' : 's'}
            </Text>
          </View>
          <Pressable
            style={styles.sheetCloseButton}
            onPress={onClose}
            accessibilityLabel="Close timeline deep dive"
          >
            <Ionicons name="close" size={20} color={arcadeColors.neonCyan} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {block.items.map((item) => (
            <View key={`${block.hourKey}-${item.id}`} style={styles.signalCard}>
              <View style={styles.signalCardHeader}>
                <Text style={styles.signalTime}>{formatSignalTime(item.timestamp)}</Text>
                <Text style={styles.signalSource}>{item.sourceApp}</Text>
              </View>
              <Text style={styles.signalSubject} numberOfLines={2}>
                {item.subject}
              </Text>
              <Text style={styles.signalMeta} numberOfLines={1}>
                {item.sender} · {item.accountLabel}
              </Text>
              <Text style={styles.signalSummary} numberOfLines={4}>
                {item.summary}
              </Text>
              <View style={styles.signalTags}>
                <Text style={styles.signalTag}>{item.category.replace('_', ' ')}</Text>
                {item.isSystemAlert ? (
                  <Text style={[styles.signalTag, styles.signalTagAlert]}>system alert</Text>
                ) : null}
                {item.urgencyScore != null ? (
                  <Text style={styles.signalTag}>urgency {item.urgencyScore}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

interface TimelineScrollerProps {
  accountKey: AccountKey;
}

export default function TimelineScroller({ accountKey }: TimelineScrollerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<TimelineHourBlock[]>([]);
  const [dayKey, setDayKey] = useState('');
  const [expandedHourKey, setExpandedHourKey] = useState<string | null>(null);
  const [sheetBlock, setSheetBlock] = useState<TimelineHourBlock | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const timeline = await fetchTimeline(accountKey);
      setBlocks(timeline.blocks);
      setDayKey(timeline.dayKey);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Could not load timeline.',
      );
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  const handleToggleExpand = useCallback((block: TimelineHourBlock) => {
    animateLayout();
    setExpandedHourKey((current) => (current === block.hourKey ? null : block.hourKey));
  }, []);

  const handleOpenSheet = useCallback((block: TimelineHourBlock) => {
    setSheetBlock(block);
    setSheetVisible(true);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSheetVisible(false);
    setSheetBlock(null);
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.glow} />
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>TIMELINE DEEP DIVE</Text>
            <Text style={styles.subtitle}>
              {dayKey || 'TODAY'} // HOURLY SIGNAL MAP
            </Text>
          </View>
          {loading ? <ActivityIndicator color={arcadeColors.neonCyan} size="small" /> : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!loading && blocks.length === 0 && !error ? (
          <Text style={styles.emptyText}>
            No active hourly blocks yet for today. Signals will appear here as they arrive.
          </Text>
        ) : null}

        <ScrollView
          style={styles.trackScroll}
          contentContainerStyle={styles.trackContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {blocks.map((block, index) => {
            const isExpanded = expandedHourKey === block.hourKey;
            const dotColor = urgencyColor(block.peakUrgency);
            const isLast = index === blocks.length - 1;

            return (
              <View key={block.hourKey} style={styles.nodeRow}>
                <View style={styles.railColumn}>
                  <View style={[styles.railDot, { backgroundColor: dotColor, borderColor: arcadeColors.bgPanel }]} />
                  {!isLast ? <View style={styles.railLine} /> : null}
                </View>

                <View style={styles.nodeContent}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.hourCard,
                      isExpanded && styles.hourCardExpanded,
                      pressed && styles.hourCardPressed,
                    ]}
                    onPress={() => handleToggleExpand(block)}
                    accessibilityLabel={`Timeline block ${formatMilitaryHour(block.hourLabel)}`}
                  >
                    <View style={styles.hourCardHeader}>
                      <Text style={styles.hourLabel}>
                        {formatMilitaryHour(block.hourLabel)}
                      </Text>
                      <Text style={styles.hourSummary}>{block.summary}</Text>
                    </View>

                    <View style={styles.hourMetaRow}>
                      <View
                        style={[
                          styles.urgencyPill,
                          { borderColor: dotColor },
                        ]}
                      >
                        <Text style={[styles.urgencyPillText, { color: dotColor }]}>
                          {block.peakUrgency}
                        </Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={arcadeColors.textMuted}
                      />
                    </View>
                  </Pressable>

                  {isExpanded ? (
                    <View style={styles.accordionBody}>
                      {block.items.slice(0, 3).map((item) => (
                        <View key={`${block.hourKey}-${item.id}`} style={styles.previewRow}>
                          <Text style={styles.previewTime}>
                            {formatSignalTime(item.timestamp)}
                          </Text>
                          <Text style={styles.previewSubject} numberOfLines={1}>
                            {item.subject}
                          </Text>
                        </View>
                      ))}

                      <Pressable
                        style={({ pressed }) => [
                          styles.deepDiveButton,
                          pressed && styles.deepDiveButtonPressed,
                        ]}
                        onPress={() => handleOpenSheet(block)}
                      >
                        <Text style={styles.deepDiveButtonText}>
                          OPEN FULL DEEP DIVE ({block.counts.total})
                        </Text>
                        <Ionicons name="arrow-up-outline" size={14} color={arcadeColors.neonPink} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <TimelineHourSheet
        block={sheetBlock}
        visible={sheetVisible}
        onClose={handleCloseSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(51, 255, 255, 0.08)',
  },
  panel: {
    ...arcadePanel('cyan'),
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    ...arcadeTypography.pixelTitle,
  },
  subtitle: {
    ...arcadeTypography.pixelSubtitle,
    marginTop: 4,
  },
  errorText: {
    ...arcadeTypography.retroBody,
    color: arcadeColors.neonRed,
    marginBottom: 8,
  },
  emptyText: {
    ...arcadeTypography.retroCaption,
    paddingBottom: 4,
  },
  trackScroll: {
    maxHeight: 280,
  },
  trackContent: {
    paddingBottom: 4,
  },
  nodeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  railColumn: {
    width: 16,
    alignItems: 'center',
  },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    marginTop: 18,
    borderWidth: 2,
  },
  railLine: {
    width: 2,
    flex: 1,
    minHeight: 48,
    backgroundColor: arcadeColors.borderMuted,
    marginTop: 4,
  },
  nodeContent: {
    flex: 1,
    paddingBottom: 10,
  },
  hourCard: {
    borderRadius: 4,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    backgroundColor: arcadeColors.bgPanelElevated,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hourCardExpanded: {
    borderColor: arcadeColors.borderCyan,
    shadowColor: arcadeColors.neonCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  hourCardPressed: {
    opacity: 0.9,
  },
  hourCardHeader: {
    gap: 4,
  },
  hourLabel: {
    ...arcadeTypography.retroHour,
  },
  hourSummary: {
    ...arcadeTypography.retroBody,
    fontSize: 12,
    lineHeight: 17,
  },
  hourMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  urgencyPill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  urgencyPillText: {
    fontFamily: arcadeTypography.sectionLabel.fontFamily,
    fontSize: 7,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  accordionBody: {
    marginTop: 8,
    gap: 6,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    borderLeftWidth: 2,
    borderLeftColor: arcadeColors.borderMuted,
    paddingLeft: 8,
  },
  previewTime: {
    ...arcadeTypography.retroMeta,
    width: 52,
    color: arcadeColors.neonPink,
  },
  previewSubject: {
    ...arcadeTypography.retroBody,
    fontSize: 12,
    flex: 1,
    color: arcadeColors.neonCyan,
  },
  deepDiveButton: {
    marginTop: 4,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deepDiveButtonPressed: {
    opacity: 0.88,
  },
  deepDiveButtonText: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.neonPink,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 8, 18, 0.82)',
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: SCREEN_HEIGHT * 0.82,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: arcadeColors.bgDeep,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: arcadeColors.neonCyan,
    marginBottom: 10,
    opacity: 0.6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: arcadeColors.borderMuted,
  },
  sheetTitle: {
    ...arcadeTypography.pixelTitlePink,
    fontSize: 8,
  },
  sheetSubtitle: {
    ...arcadeTypography.retroMeta,
    marginTop: 4,
  },
  sheetCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 1,
    borderColor: arcadeColors.borderCyan,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    padding: 16,
    gap: 10,
  },
  signalCard: {
    borderRadius: 4,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    backgroundColor: arcadeColors.bgPanel,
    padding: 12,
  },
  signalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  signalTime: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.neonCyan,
  },
  signalSource: {
    ...arcadeTypography.retroMeta,
    fontWeight: '600',
  },
  signalSubject: {
    ...arcadeTypography.retroBodyBright,
    fontSize: 14,
    marginBottom: 4,
  },
  signalMeta: {
    ...arcadeTypography.retroMeta,
    marginBottom: 6,
  },
  signalSummary: {
    ...arcadeTypography.retroBody,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  signalTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  signalTag: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
  },
  signalTagAlert: {
    color: arcadeColors.neonRed,
    borderColor: arcadeColors.neonRed,
    backgroundColor: 'rgba(255, 68, 102, 0.12)',
  },
});
