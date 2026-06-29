import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import type { ExtractedTask } from '../types/task';
import { groupTasksByProject } from '../services/taskService';
import {
  arcadeColors,
  arcadePanel,
  arcadeTypography,
} from '../theme/arcadeTheme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const GROUP_PAGE_WIDTH = SCREEN_WIDTH - 64;
const TASK_BOARD_EXPANDED_KEY = '@shadow_inbox/task_board_expanded';

function animateLayout() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

interface TaskBoardProps {
  tasks: ExtractedTask[];
  loading: boolean;
  onToggleTask: (task: ExtractedTask) => Promise<void>;
  onJumpToEmail: (emailId: string) => void;
}

const PROJECT_COLORS: Record<string, string> = {
  AlphaRounds: arcadeColors.neonPurple,
  DealShield: arcadeColors.neonGreen,
  ServiceLog: arcadeColors.neonCyan,
  'App Feedback': arcadeColors.neonYellow,
  Work: arcadeColors.neonPink,
  General: arcadeColors.neonCyan,
};

function projectColor(project: string): string {
  return PROJECT_COLORS[project] ?? arcadeColors.textMuted;
}

function TaskCard({
  task,
  onToggle,
  onJump,
}: {
  task: ExtractedTask;
  onToggle: () => void;
  onJump: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const accent = projectColor(task.project);

  const handleToggle = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    void onToggle();
  };

  const handleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((value) => !value);
  };

  return (
    <View style={[styles.taskCard, task.completed && styles.taskCardCompleted]}>
      <View style={styles.taskRow}>
        <Pressable
          style={[
            styles.checkbox,
            { borderColor: accent },
            task.completed && { backgroundColor: accent, borderColor: accent },
          ]}
          onPress={handleToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.completed }}
        >
          {task.completed ? (
            <Ionicons name="checkmark" size={14} color={arcadeColors.bgDeep} />
          ) : null}
        </Pressable>

        <Pressable style={styles.taskBody} onPress={handleExpand}>
          <Text
            style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}
            numberOfLines={expanded ? undefined : 2}
          >
            {task.title}
          </Text>
          {task.dueHint ? (
            <Text style={styles.taskDue}>Due: {task.dueHint}</Text>
          ) : null}
        </Pressable>

        <Pressable onPress={handleExpand} hitSlop={8}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={arcadeColors.textMuted}
          />
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.expandedBlock}>
          <Text style={styles.expandedLabel}>Source email</Text>
          <Text style={styles.expandedSubject}>{task.sourceSubject}</Text>
          <Text style={styles.expandedSummary}>{task.sourceSummary}</Text>
          <Text style={styles.expandedSender}>{task.sender}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.jumpButton,
              { borderColor: accent },
              pressed && styles.jumpButtonPressed,
            ]}
            onPress={onJump}
          >
            <Ionicons name="mail-open-outline" size={15} color={accent} />
            <Text style={[styles.jumpButtonText, { color: accent }]}>
              Jump to Email
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function TaskBoard({
  tasks,
  loading,
  onToggleTask,
  onJumpToEmail,
}: TaskBoardProps) {
  const groups = useMemo(() => groupTasksByProject(tasks), [tasks]);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const activeCount = tasks.filter((task) => !task.completed).length;

  useEffect(() => {
    let cancelled = false;

    async function loadExpandedPreference() {
      try {
        const saved = await AsyncStorage.getItem(TASK_BOARD_EXPANDED_KEY);
        if (!cancelled && saved === 'true') {
          setExpanded(true);
        }
      } catch {
        // default stays collapsed
      } finally {
        if (!cancelled) {
          setPrefsLoaded(true);
        }
      }
    }

    void loadExpandedPreference();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleExpanded = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateLayout();
    setExpanded((value) => {
      const next = !value;
      void AsyncStorage.setItem(TASK_BOARD_EXPANDED_KEY, next ? 'true' : 'false');
      return next;
    });
  };

  if (!prefsLoaded) {
    return null;
  }

  if (!loading && tasks.length === 0) {
    return null;
  }

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / GROUP_PAGE_WIDTH);
    setActiveGroupIndex(index);
  };

  const summaryLabel = loading
    ? 'Syncing action items…'
    : `${activeCount} open task${activeCount === 1 ? '' : 's'}`;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.glow, !expanded && styles.glowCollapsed]} />
      <View style={[styles.board, !expanded && styles.boardCollapsed]}>
        <Pressable
          style={styles.headerRow}
          onPress={handleToggleExpanded}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>QUEST LOG</Text>
            <Text style={styles.title}>{summaryLabel.toUpperCase()}</Text>
          </View>
          <View style={styles.headerActions}>
            {loading ? <ActivityIndicator color={arcadeColors.neonPurple} size="small" /> : null}
            {!loading && activeCount > 0 ? (
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{activeCount}</Text>
              </View>
            ) : null}
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={arcadeColors.neonCyan}
            />
          </View>
        </Pressable>

        {expanded ? (
          groups.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                decelerationRate="fast"
                snapToInterval={GROUP_PAGE_WIDTH}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScrollEnd}
                contentContainerStyle={styles.groupPager}
              >
                {groups.map((group) => (
                  <View key={group.project} style={styles.groupPage}>
                    <View style={styles.groupHeader}>
                      <View
                        style={[
                          styles.projectDot,
                          { backgroundColor: projectColor(group.project) },
                        ]}
                      />
                      <Text style={styles.groupTitle}>{group.project}</Text>
                      <View style={styles.groupCountBadge}>
                        <Text style={styles.groupCountText}>
                          {group.tasks.filter((task) => !task.completed).length}
                        </Text>
                      </View>
                    </View>

                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onToggle={() => onToggleTask(task)}
                        onJump={() => onJumpToEmail(task.emailId)}
                      />
                    ))}
                  </View>
                ))}
              </ScrollView>

              {groups.length > 1 ? (
                <View style={styles.dotsRow}>
                  {groups.map((group, index) => (
                    <View
                      key={group.project}
                      style={[
                        styles.dot,
                        index === activeGroupIndex && styles.dotActive,
                        index === activeGroupIndex && {
                          backgroundColor: projectColor(group.project),
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.emptyText}>
              Action items from your emails will appear here.
            </Text>
          )
        ) : null}
      </View>
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
    backgroundColor: 'rgba(179, 102, 255, 0.1)',
  },
  glowCollapsed: {
    height: 32,
    opacity: 0.7,
  },
  board: {
    ...arcadePanel('pink'),
    padding: 16,
  },
  boardCollapsed: {
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countPill: {
    minWidth: 24,
    height: 24,
    borderRadius: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 1,
    borderColor: arcadeColors.borderPink,
  },
  countPillText: {
    ...arcadeTypography.retroMeta,
    color: arcadeColors.neonPink,
    fontWeight: '700',
  },
  kicker: {
    ...arcadeTypography.sectionLabel,
  },
  title: {
    ...arcadeTypography.pixelSubtitle,
    color: arcadeColors.neonCyan,
    fontSize: 8,
  },
  groupPager: {
    gap: 0,
    marginTop: 14,
  },
  groupPage: {
    width: GROUP_PAGE_WIDTH,
    paddingRight: 4,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  projectDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  groupTitle: {
    ...arcadeTypography.retroBodyBright,
    fontSize: 14,
    flex: 1,
  },
  groupCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  groupCountText: {
    ...arcadeTypography.retroMeta,
    fontWeight: '700',
  },
  taskCard: {
    backgroundColor: arcadeColors.bgPanelElevated,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    padding: 12,
    marginBottom: 10,
  },
  taskCardCompleted: {
    opacity: 0.62,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  taskBody: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    ...arcadeTypography.retroBodyBright,
    fontSize: 14,
    lineHeight: 20,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: arcadeColors.textDim,
  },
  taskDue: {
    ...arcadeTypography.retroMeta,
    color: arcadeColors.neonYellow,
    fontWeight: '600',
  },
  expandedBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: arcadeColors.borderMuted,
    gap: 6,
  },
  expandedLabel: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.textDim,
  },
  expandedSubject: {
    ...arcadeTypography.retroBodyBright,
    fontSize: 13,
  },
  expandedSummary: {
    ...arcadeTypography.retroBody,
    fontSize: 13,
  },
  expandedSender: {
    ...arcadeTypography.retroMeta,
    marginBottom: 4,
  },
  jumpButton: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderRadius: 4,
    paddingVertical: 9,
    backgroundColor: arcadeColors.bgPanel,
  },
  jumpButtonPressed: {
    opacity: 0.8,
  },
  jumpButtonText: {
    ...arcadeTypography.sectionLabel,
    fontSize: 7,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 2,
    backgroundColor: arcadeColors.borderMuted,
  },
  dotActive: {
    width: 18,
  },
  emptyText: {
    ...arcadeTypography.retroCaption,
    lineHeight: 19,
  },
});
