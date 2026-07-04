import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAccount } from '../context/AccountContext';
import BriefingCard from '../components/BriefingCard';
import TaskBoard from '../components/TaskBoard';
import FinanceRunwayStrip from '../components/FinanceRunwayStrip';
import TimelineScroller from '../components/TimelineScroller';
import RelayStatusBanner from '../components/RelayStatusBanner';
import { ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import {
  dismissBriefingForToday,
  fetchDailyBriefing,
  isBriefingDismissedForToday,
} from '../services/briefingService';
import { fetchExtractedTasks, toggleExtractedTask } from '../services/taskService';
import { fetchFinanceSummary } from '../services/financeService';
import type { DailyBriefing } from '../types/briefing';
import type { ExtractedTask } from '../types/task';
import type { FinanceSummary } from '../types/finance';
import type { TriagedNotification } from '../types/notification';
import type { AccountKey } from '../types/account';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface IntelDeckScreenProps {
  onOpenDrawer: () => void;
  onJumpToEmail: (emailId: string) => void;
  notifications: TriagedNotification[];
  isScreenFocused?: boolean;
}

const BRIEFING_REFRESH_MS = 60_000;
const TASKS_REFRESH_MS = 45_000;
const FINANCE_REFRESH_MS = 45_000;

export default function IntelDeckScreen({
  onOpenDrawer,
  onJumpToEmail,
  notifications,
  isScreenFocused = true,
}: IntelDeckScreenProps) {
  const { activeAccount, setActiveAccount } = useAccount();
  const hasActiveAccount = Boolean(activeAccount);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [briefingHidden, setBriefingHidden] = useState(false);
  const [tasks, setTasks] = useState<ExtractedTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const briefingFetchedAtRef = useRef<number>(0);
  const tasksFetchedAtRef = useRef<number>(0);
  const financeFetchedAtRef = useRef<number>(0);
  const briefingAccountRef = useRef<AccountKey | null>(null);
  const tasksAccountRef = useRef<AccountKey | null>(null);
  const financeAccountRef = useRef<AccountKey | null>(null);
  const briefingRequestRef = useRef(false);
  const tasksRequestRef = useRef(false);
  const financeRequestRef = useRef(false);

  const refreshBriefing = useCallback(async (force = false) => {
    if (briefingRequestRef.current) {
      return;
    }

    const dismissed = await isBriefingDismissedForToday();
    if (dismissed) {
      setBriefingHidden(true);
      return;
    }

    const now = Date.now();
    const sameAccount = briefingAccountRef.current === activeAccount;
    if (!force && sameAccount && briefing && now - briefingFetchedAtRef.current < BRIEFING_REFRESH_MS) {
      setBriefingHidden(false);
      return;
    }

    briefingRequestRef.current = true;
    setBriefingHidden(false);
    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const triageByAccount = { [activeAccount]: notifications };
      const result = await fetchDailyBriefing(triageByAccount);
      setBriefing(result);
      briefingFetchedAtRef.current = Date.now();
      briefingAccountRef.current = activeAccount;
    } catch (error) {
      setBriefingError(
        error instanceof Error ? error.message : 'Could not load crime bulletin.',
      );
    } finally {
      briefingRequestRef.current = false;
      setBriefingLoading(false);
    }
  }, [activeAccount, briefing, notifications]);

  const loadTasks = useCallback(async (force = false) => {
    if (tasksRequestRef.current) {
      return;
    }

    const now = Date.now();
    const sameAccount = tasksAccountRef.current === activeAccount;
    if (!force && sameAccount && tasks.length > 0 && now - tasksFetchedAtRef.current < TASKS_REFRESH_MS) {
      return;
    }

    tasksRequestRef.current = true;
    setTasksLoading(true);
    try {
      const result = await fetchExtractedTasks(activeAccount);
      setTasks(result);
      tasksFetchedAtRef.current = Date.now();
      tasksAccountRef.current = activeAccount;
    } catch (error) {
      console.warn('[Intel Deck] Task load failed:', error);
    } finally {
      tasksRequestRef.current = false;
      setTasksLoading(false);
    }
  }, [activeAccount, tasks.length]);

  const loadFinances = useCallback(async (force = false) => {
    if (financeRequestRef.current) {
      return;
    }

    const now = Date.now();
    const sameAccount = financeAccountRef.current === activeAccount;
    if (
      !force &&
      sameAccount &&
      financeSummary &&
      now - financeFetchedAtRef.current < FINANCE_REFRESH_MS
    ) {
      return;
    }

    financeRequestRef.current = true;
    setFinanceLoading(true);
    try {
      const summary = await fetchFinanceSummary(activeAccount);
      setFinanceSummary(summary);
      financeFetchedAtRef.current = Date.now();
      financeAccountRef.current = activeAccount;
    } catch (error) {
      console.warn('[Intel Deck] Finance load failed:', error);
    } finally {
      financeRequestRef.current = false;
      setFinanceLoading(false);
    }
  }, [activeAccount, financeSummary]);

  useEffect(() => {
    if (!isScreenFocused || !hasActiveAccount) {
      return;
    }
    void refreshBriefing();
    void loadTasks();
    void loadFinances();
  }, [hasActiveAccount, isScreenFocused, refreshBriefing, loadTasks, loadFinances]);

  const handleToggleTask = useCallback(async (task: ExtractedTask) => {
    try {
      const result = await toggleExtractedTask(task.id);
      setTasks((prev) => prev.map((item) => (item.id === task.id ? result.task : item)));
      tasksFetchedAtRef.current = Date.now();
    } catch (error) {
      Alert.alert(
        'Task Sync Failed',
        error instanceof Error ? error.message : 'Could not update task.',
      );
    }
  }, []);

  const handleJumpToEmail = useCallback(
    async (emailId: string) => {
      const task = tasks.find((item) => item.emailId === emailId);
      if (task?.accountKey && task.accountKey !== activeAccount) {
        await setActiveAccount(task.accountKey);
      }
      onJumpToEmail(emailId);
    },
    [tasks, activeAccount, setActiveAccount, onJumpToEmail],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.menuButton} onPress={onOpenDrawer}>
          <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
        </Pressable>
        <View>
          <Text style={styles.title}>INTEL DECK</Text>
          <Text style={styles.subtitle}>Briefings, quests & runway intel</Text>
        </View>
      </View>

      {briefingError ? (
        <RelayStatusBanner message={briefingError} stale={Boolean(briefing)} />
      ) : null}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!briefingHidden && (
          <BriefingCard
            briefing={briefing}
            loading={briefingLoading}
            error={briefingError}
            onDismiss={async () => {
              await dismissBriefingForToday();
              setBriefingHidden(true);
            }}
          />
        )}

        <TaskBoard
          tasks={tasks}
          loading={tasksLoading}
          onToggleTask={handleToggleTask}
          onJumpToEmail={(emailId) => void handleJumpToEmail(emailId)}
        />

        <FinanceRunwayStrip summary={financeSummary} loading={financeLoading} />

        <TimelineScroller accountKey={activeAccount} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: arcadeColors.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: arcadeColors.borderMuted,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
  },
  title: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    lineHeight: 16,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: arcadeFonts.body,
    fontSize: 11,
    color: arcadeColors.textMuted,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 0,
  },
});
