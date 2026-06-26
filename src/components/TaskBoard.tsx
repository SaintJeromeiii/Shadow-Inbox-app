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
  AlphaRounds: '#C084FC',
  DealShield: '#6EE7A0',
  ServiceLog: '#67E8F9',
  'App Feedback': '#FFB347',
  Work: '#F472B6',
  General: '#5B8DEF',
};

function projectColor(project: string): string {
  return PROJECT_COLORS[project] ?? '#8B93A8';
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
            <Ionicons name="checkmark" size={14} color="#0D0F14" />
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
            color="#6B7288"
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
            <Text style={styles.kicker}>Smart Task Board</Text>
            <Text style={styles.title}>{summaryLabel}</Text>
          </View>
          <View style={styles.headerActions}>
            {loading ? <ActivityIndicator color="#8EB5FF" size="small" /> : null}
            {!loading && activeCount > 0 ? (
              <View style={styles.countPill}>
                <Text style={styles.countPillText}>{activeCount}</Text>
              </View>
            ) : null}
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#9EB8F0"
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
    borderRadius: 24,
    backgroundColor: 'rgba(91, 141, 239, 0.16)',
  },
  glowCollapsed: {
    height: 32,
    opacity: 0.7,
  },
  board: {
    backgroundColor: '#121722',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A3550',
    padding: 16,
    overflow: 'hidden',
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
    gap: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countPill: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(91, 141, 239, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.35)',
  },
  countPillText: {
    color: '#9EB8F0',
    fontSize: 12,
    fontWeight: '800',
  },
  kicker: {
    color: '#7D89A8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    color: '#F4F6FB',
    fontSize: 16,
    fontWeight: '700',
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
    borderRadius: 4,
  },
  groupTitle: {
    color: '#E8ECF4',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  groupCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1A2030',
    borderWidth: 1,
    borderColor: '#2E3548',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  groupCountText: {
    color: '#9AA3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  taskCard: {
    backgroundColor: '#0D1018',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232A38',
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
    borderRadius: 7,
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
    color: '#F4F6FB',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#8B93A8',
  },
  taskDue: {
    color: '#FFB347',
    fontSize: 11,
    fontWeight: '600',
  },
  expandedBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#232A38',
    gap: 6,
  },
  expandedLabel: {
    color: '#6B7288',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  expandedSubject: {
    color: '#D0D5E0',
    fontSize: 13,
    fontWeight: '700',
  },
  expandedSummary: {
    color: '#9AA3B8',
    fontSize: 13,
    lineHeight: 19,
  },
  expandedSender: {
    color: '#6B7288',
    fontSize: 12,
    marginBottom: 4,
  },
  jumpButton: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  jumpButtonPressed: {
    opacity: 0.8,
  },
  jumpButtonText: {
    fontSize: 12,
    fontWeight: '700',
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
    borderRadius: 3,
    backgroundColor: '#2E3548',
  },
  dotActive: {
    width: 18,
  },
  emptyText: {
    color: '#6B7288',
    fontSize: 13,
    lineHeight: 19,
  },
});
