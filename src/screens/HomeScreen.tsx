import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import FeedCard from '../components/FeedCard';
import {
  triageNotifications,
  getTriageMode,
  getNotificationDataSource,
} from '../services/triageService';
import { getSeedNotifications } from '../services/notificationData';
import { fetchInboxFromRelay } from '../services/inboxService';
import {
  loadPersistedNotifications,
  saveNotifications,
  clearPersistedNotifications,
} from '../services/notificationStorage';
import { sendReply, archiveEmails, trashEmails, syncShadowLabels, redraftEmailReply } from '../services/emailService';
import type { ReplyTone } from '../types/replyTone';
import {
  alertNewActionRequiredItems,
  loadAlertedActionIds,
  registerDeviceWithRelay,
  requestNotificationPermissions,
} from '../services/pushNotifications';
import { useAccount } from '../context/AccountContext';
import AccountSwitcherSheet from '../components/AccountSwitcherSheet';
import BriefingCard from '../components/BriefingCard';
import TaskBoard from '../components/TaskBoard';
import FinanceRunwayStrip from '../components/FinanceRunwayStrip';
import KnowledgeScreen from '../screens/KnowledgeScreen';
import AutoPilotScreen from '../screens/AutoPilotScreen';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { removeRelayAccount } from '../services/authService';
import { hideAccountOnDevice, unhideAccountOnDevice } from '../services/accountStorage';
import {
  dismissBriefingForToday,
  fetchDailyBriefing,
  isBriefingDismissedForToday,
} from '../services/briefingService';
import type { AccountKey } from '../types/account';
import type { AccountProfile } from '../types/account';
import type { DailyBriefing } from '../types/briefing';
import type { FeedTab, TriagedNotification } from '../types/notification';
import type { ExtractedTask } from '../types/task';
import {
  fetchExtractedTasks,
  toggleExtractedTask,
} from '../services/taskService';
import { fetchFinanceSummary } from '../services/financeService';
import type { FinanceSummary } from '../types/finance';
import { sendVoiceCommand } from '../services/voiceCommandService';

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'action_required', label: 'Action Required' },
  { key: 'fyi', label: 'FYI' },
  { key: 'ignore', label: 'Archived' },
];

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function animateListChange() {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

function buildDraftMap(notifications: TriagedNotification[]): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const notification of notifications) {
    if (notification.triage?.suggestedReply) {
      drafts[notification.id] = notification.triage.suggestedReply;
    }
  }
  return drafts;
}

function formatLastChecked(date: Date | null): string {
  if (!date) return 'Not yet synced';

  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 10) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HomeScreen() {
  const {
    activeAccount,
    activeProfile,
    accounts,
    ready: accountReady,
    refreshAccounts,
    setActiveAccount,
  } = useAccount();
  const [notifications, setNotifications] = useState<TriagedNotification[]>([]);
  const [activeTab, setActiveTab] = useState<FeedTab>('action_required');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeTick, setTimeTick] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [removingAccountKey, setRemovingAccountKey] = useState<AccountKey | null>(null);
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [briefingHidden, setBriefingHidden] = useState(false);
  const [tasks, setTasks] = useState<ExtractedTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [focusEmailId, setFocusEmailId] = useState<string | null>(null);
  const [knowledgeVisible, setKnowledgeVisible] = useState(false);
  const [autoPilotVisible, setAutoPilotVisible] = useState(false);
  const skipNextSave = useRef(true);
  const alertedActionIdsRef = useRef<Set<string>>(new Set());
  const loadingAccountRef = useRef<AccountKey | null>(null);
  const flatListRef = useRef<FlatList<TriagedNotification>>(null);

  const dataSource = getNotificationDataSource(activeAccount);
  const triageMode = getTriageMode();
  const isLiveAi = triageMode === 'live';

  const lastCheckedLabel = useMemo(
    () => formatLastChecked(lastUpdated),
    [lastUpdated, timeTick],
  );

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimeTick((tick) => tick + 1);
    }, 30_000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function setupNotifications() {
      const granted = await requestNotificationPermissions();
      if (cancelled) return;

      setNotificationsEnabled(granted);
      alertedActionIdsRef.current = await loadAlertedActionIds();

      if (granted) {
        await registerDeviceWithRelay();
      }
    }

    void setupNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !notificationsEnabled) return;

    let cancelled = false;

    async function watchForActionRequired() {
      const accountLabel =
        activeProfile.label.replace(/\s+Account$/i, '').trim() ||
        activeProfile.label;

      const updatedIds = await alertNewActionRequiredItems(
        notifications,
        alertedActionIdsRef.current,
        accountLabel,
      );

      if (!cancelled) {
        alertedActionIdsRef.current = updatedIds;
      }
    }

    void watchForActionRequired();

    return () => {
      cancelled = true;
    };
  }, [notifications, hydrated, notificationsEnabled, activeProfile.label]);

  const reloadInboxFromSource = useCallback(
    async (accountKey: AccountKey, sync = true): Promise<TriagedNotification[]> => {
      skipNextSave.current = true;

      let seed = getSeedNotifications(accountKey);
      try {
        const remote = await fetchInboxFromRelay(accountKey, sync);
        if (remote.notifications.length > 0) {
          seed = remote.notifications;
        }
      } catch (error) {
        console.warn(
          `[Shadow Inbox] Relay fetch failed for ${accountKey}, using bundled seed:`,
          error,
        );
      }

      const merged = await loadPersistedNotifications(accountKey, seed);
      return merged;
    },
    [],
  );

  const applyInboxReload = useCallback(
    async (accountKey: AccountKey, sync = true): Promise<TriagedNotification[]> => {
      if (loadingAccountRef.current === accountKey) {
        return notifications;
      }
      loadingAccountRef.current = accountKey;

      try {
        const merged = await reloadInboxFromSource(accountKey, sync);
        setNotifications(merged);
        setDraftTexts(buildDraftMap(merged));
        setRemovingIds(new Set());
        setActiveTab('action_required');
        setProcessing(false);
        setProgress(null);
        setLastUpdated(new Date());
        setHydrated(true);
        return merged;
      } finally {
        loadingAccountRef.current = null;
      }
    },
    [notifications, reloadInboxFromSource],
  );

  const gatherTriageSnapshot = useCallback(
    async (
      activeNotifications?: TriagedNotification[],
    ): Promise<Record<AccountKey, TriagedNotification[]>> => {
      const snapshot: Record<AccountKey, TriagedNotification[]> = {};

      for (const account of accounts) {
        if (activeNotifications && account.key === activeAccount) {
          snapshot[account.key] = activeNotifications;
          continue;
        }

        snapshot[account.key] = await loadPersistedNotifications(account.key);
      }

      return snapshot;
    },
    [accounts, activeAccount],
  );

  const refreshBriefing = useCallback(
    async (activeNotifications?: TriagedNotification[]) => {
      const dismissed = await isBriefingDismissedForToday();
      if (dismissed) {
        setBriefingHidden(true);
        return;
      }

      setBriefingHidden(false);
      setBriefingLoading(true);
      setBriefingError(null);

      try {
        const triageByAccount = await gatherTriageSnapshot(activeNotifications);
        const result = await fetchDailyBriefing(triageByAccount);
        setBriefing(result);
      } catch (error) {
        console.warn('[Shadow Inbox] Briefing fetch failed:', error);
        setBriefingError(
          error instanceof Error
            ? error.message
            : 'Could not load your morning briefing.',
        );
      } finally {
        setBriefingLoading(false);
      }
    },
    [gatherTriageSnapshot],
  );

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const fetched = await fetchExtractedTasks();
      setTasks(fetched);
    } catch (error) {
      console.warn('[Shadow Inbox] Task fetch failed:', error);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadFinances = useCallback(async (accountKey?: AccountKey) => {
    setFinanceLoading(true);
    try {
      const summary = await fetchFinanceSummary(accountKey ?? activeAccount);
      setFinanceSummary(summary);
    } catch (error) {
      console.warn('[Shadow Inbox] Finance summary failed:', error);
    } finally {
      setFinanceLoading(false);
    }
  }, [activeAccount]);

  useEffect(() => {
    if (!accountReady) return;
    void loadTasks();
    void loadFinances();
  }, [accountReady, loadTasks, loadFinances]);

  useEffect(() => {
    if (!accountReady) return;

    void (async () => {
      const dismissed = await isBriefingDismissedForToday();
      setBriefingHidden(dismissed);
      const merged = await applyInboxReload(activeAccount, false);
      if (!dismissed) {
        await refreshBriefing(merged);
      }
      await loadTasks();
      await loadFinances();
    })();
    // Initial inbox load only — account switches reload via handleSelectAccount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountReady]);

  const handleDismissBriefing = useCallback(async () => {
    await dismissBriefingForToday();
    setBriefingHidden(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    void saveNotifications(activeAccount, notifications);
  }, [notifications, hydrated, activeAccount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const merged = await applyInboxReload(activeAccount, true);
      await refreshBriefing(merged);
      await loadTasks();
      await loadFinances();
    } finally {
      setRefreshing(false);
    }
  }, [activeAccount, applyInboxReload, refreshBriefing, loadTasks, loadFinances]);

  const handleSelectAccount = useCallback(
    async (accountKey: AccountKey) => {
      setAccountSheetVisible(false);
      if (accountKey === activeAccount) return;

      await setActiveAccount(accountKey);
      setRefreshing(true);
      try {
        const merged = await applyInboxReload(accountKey, true);
        await refreshBriefing(merged);
        await loadFinances(accountKey);
      } finally {
        setRefreshing(false);
      }
    },
    [activeAccount, applyInboxReload, refreshBriefing, setActiveAccount, loadFinances],
  );

  const handleGoogleAccountLinked = useCallback(
    async (account: AccountProfile) => {
      setAccountSheetVisible(false);
      await unhideAccountOnDevice(account.key);
      await refreshAccounts();
      await setActiveAccount(account.key);
      setRefreshing(true);
      try {
        const merged = await applyInboxReload(account.key, true);
        await refreshBriefing(merged);
        await loadFinances(account.key);
      } finally {
        setRefreshing(false);
      }
    },
    [applyInboxReload, refreshAccounts, refreshBriefing, setActiveAccount, loadFinances],
  );

  const { signInWithGoogle, signOutFromGoogle, isSigningIn: isGoogleSigningIn } =
    useGoogleSignIn({
      onSuccess: handleGoogleAccountLinked,
    });

  const handleRemoveAccount = useCallback(
    (account: AccountProfile) => {
      const isOAuthAccount = Boolean(account.oauth);
      const title = isOAuthAccount ? 'Disconnect Google Account' : 'Sign Out';
      const message = isOAuthAccount
        ? `Disconnect ${account.email} from Shadow Inbox? This removes stored OAuth tokens and the local feed on your Mac relay.`
        : `Sign out of ${account.label} on this device? IMAP credentials stay on your Mac relay (.env) — this only hides the inbox here and clears cached messages.`;

      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isOAuthAccount ? 'Disconnect' : 'Sign Out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRemovingAccountKey(account.key);
              try {
                if (isOAuthAccount) {
                  const result = await removeRelayAccount(account.key);
                  if (!result.success) {
                    Alert.alert(
                      'Disconnect Failed',
                      result.error ?? 'Could not remove this account from the relay.',
                    );
                    return;
                  }
                  await signOutFromGoogle();
                } else {
                  await hideAccountOnDevice(account.key);
                }

                await clearPersistedNotifications(account.key);
                const remaining = await refreshAccounts();
                setAccountSheetVisible(false);

                if (activeAccount === account.key) {
                  const nextAccount = remaining[0]?.key ?? 'personal';
                  await setActiveAccount(nextAccount);
                  if (remaining.length > 0) {
                    setRefreshing(true);
                    try {
                      const merged = await applyInboxReload(nextAccount, false);
                      await refreshBriefing(merged);
                    } finally {
                      setRefreshing(false);
                    }
                  } else {
                    setNotifications([]);
                    setDraftTexts({});
                    setLastUpdated(null);
                  }
                } else {
                  await refreshBriefing();
                }
              } catch (error) {
                Alert.alert(
                  isOAuthAccount ? 'Disconnect Failed' : 'Sign Out Failed',
                  error instanceof Error
                    ? error.message
                    : 'Could not remove this account.',
                );
              } finally {
                setRemovingAccountKey(null);
              }
            })();
          },
        },
      ]);
    },
    [
      activeAccount,
      applyInboxReload,
      refreshAccounts,
      refreshBriefing,
      setActiveAccount,
      signOutFromGoogle,
    ],
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.triage && !n.archived).length,
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (n.archived) return activeTab === 'ignore';
      if (!n.triage) return false;
      return n.triage.category === activeTab;
    });
  }, [notifications, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<FeedTab, number> = {
      action_required: 0,
      fyi: 0,
      ignore: 0,
    };

    for (const n of notifications) {
      if (n.archived) {
        counts.ignore += 1;
      } else if (n.triage) {
        counts[n.triage.category] += 1;
      }
    }

    return counts;
  }, [notifications]);

  const actionRequiredItems = useMemo(
    () =>
      notifications.filter(
        (n) => !n.archived && n.triage?.category === 'action_required',
      ),
    [notifications],
  );

  const showBulkSend = actionRequiredItems.length >= 2;

  useEffect(() => {
    if (!focusEmailId) return;

    const index = filteredNotifications.findIndex((item) => item.id === focusEmailId);
    if (index < 0) return;

    const timeoutId = setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 });
      setFocusEmailId(null);
    }, 120);

    return () => clearTimeout(timeoutId);
  }, [focusEmailId, filteredNotifications]);

  const removeNotificationsFromFeed = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setRemovingIds((prev) => new Set([...prev, ...ids]));

    setTimeout(() => {
      animateListChange();
      setNotifications((prev) => prev.filter((n) => !idSet.has(n.id)));
      setDraftTexts((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          delete next[id];
        }
        return next;
      });
      setRemovingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          next.delete(id);
        }
        return next;
      });
    }, 220);
  }, []);

  const handleDraftChange = useCallback((id: string, text: string) => {
    setDraftTexts((prev) => ({ ...prev, [id]: text }));
  }, []);

  const handleToggleTask = useCallback(
    async (task: ExtractedTask) => {
      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id
            ? {
                ...item,
                completed: !item.completed,
                completedAt: !item.completed ? new Date().toISOString() : null,
              }
            : item,
        ),
      );

      try {
        const result = await toggleExtractedTask(task.id);
        setTasks((prev) =>
          prev.map((item) => (item.id === task.id ? result.task : item)),
        );

        if (result.archived && result.task.emailId) {
          removeNotificationsFromFeed([result.task.emailId]);
        }

        if (result.archiveError) {
          Alert.alert(
            'Task Completed — Archive Pending',
            result.archiveError,
          );
        }
      } catch (error) {
        setTasks((prev) =>
          prev.map((item) => (item.id === task.id ? task : item)),
        );
        Alert.alert(
          'Task Sync Failed',
          error instanceof Error
            ? error.message
            : 'Could not update task on the relay.',
        );
      }
    },
    [removeNotificationsFromFeed],
  );

  const handleJumpToEmail = useCallback(
    async (emailId: string) => {
      const task = tasks.find((item) => item.emailId === emailId);
      const accountKey = task?.accountKey ?? activeAccount;

      if (accountKey !== activeAccount) {
        await setActiveAccount(accountKey);
        await applyInboxReload(accountKey, false);
      }

      setActiveTab('action_required');
      setFocusEmailId(emailId);
    },
    [tasks, activeAccount, setActiveAccount, applyInboxReload],
  );

  const feedListHeader = useMemo(
    () => (
      <View style={styles.feedListHeader}>
        {!briefingHidden && (
          <BriefingCard
            briefing={briefing}
            loading={briefingLoading}
            error={briefingError}
            onDismiss={() => void handleDismissBriefing()}
          />
        )}

        <TaskBoard
          tasks={tasks}
          loading={tasksLoading}
          onToggleTask={handleToggleTask}
          onJumpToEmail={(emailId) => void handleJumpToEmail(emailId)}
        />

        <FinanceRunwayStrip summary={financeSummary} loading={financeLoading} />

        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text
                    style={[
                      styles.tabBadgeText,
                      isActive && styles.tabBadgeTextActive,
                    ]}
                  >
                    {tabCounts[tab.key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    ),
    [
      activeTab,
      briefing,
      briefingError,
      briefingHidden,
      briefingLoading,
      handleDismissBriefing,
      handleJumpToEmail,
      handleToggleTask,
      tabCounts,
      tasks,
      tasksLoading,
      financeSummary,
      financeLoading,
    ],
  );

  const handleRedraft = useCallback(
    async (
      notification: TriagedNotification,
      tone: ReplyTone,
      currentDraft: string,
    ) => {
      const result = await redraftEmailReply({
        emailId: notification.id,
        originalMessage: notification.rawText,
        currentDraft,
        tone,
      });

      if (!result.success || !result.draft) {
        throw new Error(result.error ?? 'Could not redraft reply.');
      }

      setDraftTexts((prev) => ({
        ...prev,
        [notification.id]: result.draft!,
      }));

      return result.draft;
    },
    [],
  );

  const handleVoiceCommand = useCallback(
    async (
      notification: TriagedNotification,
      audioUri: string,
      currentDraft: string,
    ) => {
      const result = await sendVoiceCommand({
        emailId: notification.id,
        originalMessage: notification.rawText,
        currentDraft,
        audioUri,
      });

      if (!result.success || !result.draft) {
        throw new Error(result.error ?? 'Could not process voice command.');
      }

      setDraftTexts((prev) => ({
        ...prev,
        [notification.id]: result.draft!,
      }));

      return result.draft;
    },
    [],
  );

  const handleGmailArchive = useCallback(
    async (notification: TriagedNotification) => {
      if (notification.sourceApp !== 'Email') {
        removeNotificationsFromFeed([notification.id]);
        return;
      }

      const result = await archiveEmails([notification.id]);
      if (!result.success) {
        Alert.alert(
          'Archive Failed',
          result.error ?? 'Could not archive this email. Is the relay running?',
        );
        return;
      }

      removeNotificationsFromFeed([notification.id]);
    },
    [removeNotificationsFromFeed],
  );

  const handleTrash = useCallback(
    async (notification: TriagedNotification) => {
      if (notification.sourceApp !== 'Email') {
        removeNotificationsFromFeed([notification.id]);
        return;
      }

      const result = await trashEmails([notification.id]);
      if (!result.success) {
        Alert.alert(
          'Trash Failed',
          result.error ?? 'Could not trash this email. Is the relay running?',
        );
        return;
      }

      removeNotificationsFromFeed([notification.id]);
    },
    [removeNotificationsFromFeed],
  );

  const handleProcessFeed = useCallback(async () => {
    const pending = notifications.filter((n) => !n.triage);
    if (pending.length === 0) return;

    setProcessing(true);
    setProgress(`0 / ${pending.length}`);

    try {
      const results = await triageNotifications(pending, (done, total) => {
        setProgress(`${done} / ${total}`);
      });

      setNotifications((prev) => {
        const updated = prev.map((n) => {
          const triage = results.get(n.id);
          return triage ? { ...n, triage } : n;
        });

        void syncShadowLabels(updated).then((labelResult) => {
          if (!labelResult.success || !labelResult.updated?.length) {
            return;
          }

          const labelById = new Map(labelResult.updated.map((item) => [item.id, item]));
          setNotifications((current) =>
            current.map((item) => {
              const labeled = labelById.get(item.id);
              return labeled ? { ...item, ...labeled } : item;
            }),
          );
        });

        void refreshBriefing(updated);
        return updated;
      });
      setDraftTexts((prev) => {
        const next = { ...prev };
        for (const [id, triage] of results.entries()) {
          if (triage.suggestedReply) {
            next[id] = triage.suggestedReply;
          }
        }
        return next;
      });
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }, [notifications, refreshBriefing]);

  const handleSendReply = useCallback(
    async (notification: TriagedNotification, replyText: string) => {
      const result = await sendReply(notification, replyText);

      if (result.success) {
        if (notification.sourceApp === 'Email') {
          const archiveResult = await archiveEmails([notification.id]);
          if (!archiveResult.success) {
            Alert.alert(
              'Sent — Archive Pending',
              'Reply delivered, but Gmail archive failed. You can archive manually.',
            );
            removeNotificationsFromFeed([notification.id]);
            return;
          }
        }

        removeNotificationsFromFeed([notification.id]);
        return;
      }

      Alert.alert(
        'Send Failed',
        result.error ?? 'Could not send reply. Is the email relay running?',
      );
    },
    [removeNotificationsFromFeed],
  );

  const handleBulkSendAll = useCallback(async () => {
    if (bulkSending || actionRequiredItems.length < 2) return;

    const sendable = actionRequiredItems.filter((notification) => {
      const draft =
        draftTexts[notification.id]?.trim() ??
        notification.triage?.suggestedReply?.trim() ??
        '';
      return draft.length > 0 && notification.sourceApp === 'Email';
    });

    if (sendable.length === 0) {
      Alert.alert(
        'No Drafts Ready',
        'Add reply text to at least one action-required email before bulk sending.',
      );
      return;
    }

    setBulkSending(true);

    const sentIds: string[] = [];
    const failed: string[] = [];

    try {
      for (const notification of sendable) {
        const replyText =
          draftTexts[notification.id]?.trim() ??
          notification.triage?.suggestedReply?.trim() ??
          '';

        const result = await sendReply(notification, replyText);
        if (result.success) {
          sentIds.push(notification.id);
        } else {
          failed.push(notification.sender);
        }
      }

      if (sentIds.length > 0) {
        const archiveResult = await archiveEmails(sentIds);
        if (!archiveResult.success) {
          Alert.alert(
            'Sent — Archive Pending',
            `${sentIds.length} repl${sentIds.length === 1 ? 'y' : 'ies'} sent, but Gmail archive failed for some messages.`,
          );
        }
        removeNotificationsFromFeed(sentIds);
      }

      if (failed.length > 0) {
        Alert.alert(
          'Partial Send',
          `${sentIds.length} sent, ${failed.length} failed. Check relay connection and retry.`,
        );
      } else if (sentIds.length > 0) {
        Alert.alert(
          'All Drafts Sent',
          `${sentIds.length} repl${sentIds.length === 1 ? 'y' : 'ies'} delivered and archived.`,
        );
      }
    } finally {
      setBulkSending(false);
    }
  }, [
    actionRequiredItems,
    bulkSending,
    draftTexts,
    removeNotificationsFromFeed,
  ]);

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="mail-open-outline" size={44} color="#3D4A63" />
      </View>
      <Text style={styles.emptyTitle}>
        {activeTab === 'ignore'
          ? 'Inbox zero — archived'
          : activeTab === 'action_required'
            ? 'All caught up'
            : 'Nothing to review'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {unreadCount > 0
          ? 'Tap "Process Feed" to triage your inbox.'
          : 'Pull down to refresh when new mail arrives.'}
      </Text>
    </View>
  );

  if (!hydrated || !accountReady) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color="#5B8DEF" size="large" />
          <Text style={styles.loadingText}>Loading inbox…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Shadow Inbox</Text>
          <View style={styles.headerMeta}>
            <View style={styles.headerBadgeRow}>
              <View
                style={[
                  styles.modeBadge,
                  isLiveAi ? styles.modeBadgeLive : styles.modeBadgeSimulation,
                ]}
              >
                <View
                  style={[
                    styles.modeDot,
                    isLiveAi ? styles.modeDotLive : styles.modeDotSimulation,
                  ]}
                />
                <Text
                  style={[
                    styles.modeBadgeText,
                    isLiveAi
                      ? styles.modeBadgeTextLive
                      : styles.modeBadgeTextSimulation,
                  ]}
                >
                  {isLiveAi ? 'Live AI Mode' : 'Simulation Mode'}
                </Text>
              </View>
              <View style={styles.lastCheckedBadge}>
                <Text style={styles.lastCheckedText}>
                  Last checked: {lastCheckedLabel}
                </Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>
              {unreadCount > 0
                ? `${unreadCount} unread · ${activeProfile.label}`
                : `${activeProfile.label} · ${dataSource} data`}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [
              styles.knowledgePill,
              pressed && styles.knowledgePillPressed,
            ]}
            onPress={() => setAutoPilotVisible(true)}
            accessibilityLabel="Open auto-pilot rules"
          >
            <Text style={styles.knowledgePillEmoji}>🤖</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.knowledgePill,
              pressed && styles.knowledgePillPressed,
            ]}
            onPress={() => setKnowledgeVisible(true)}
            accessibilityLabel="Open core knowledge base"
          >
            <Text style={styles.knowledgePillEmoji}>🧠</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.accountPill,
              { borderColor: activeProfile.accentColor },
              pressed && styles.accountPillPressed,
            ]}
            onPress={() => setAccountSheetVisible(true)}
            accessibilityLabel="Switch inbox account"
          >
            <View
              style={[
                styles.accountAvatar,
                { backgroundColor: activeProfile.accentColor },
              ]}
            >
              <Text style={styles.accountAvatarText}>{activeProfile.initials}</Text>
            </View>
          </Pressable>
          <Pressable
          style={({ pressed }) => [
            styles.processButton,
            (processing || unreadCount === 0) && styles.processButtonDisabled,
            pressed && !processing && styles.processButtonPressed,
          ]}
          onPress={() => void handleProcessFeed()}
          disabled={processing || unreadCount === 0}
        >
          {processing ? (
            <View style={styles.processingRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.processButtonText}>{progress}</Text>
            </View>
          ) : (
            <Text style={styles.processButtonText}>Process Feed</Text>
          )}
        </Pressable>
        </View>
      </View>

      <AccountSwitcherSheet
        visible={accountSheetVisible}
        accounts={accounts}
        activeAccount={activeAccount}
        onSelect={(accountKey) => void handleSelectAccount(accountKey)}
        onAddGoogle={() => void signInWithGoogle()}
        onRemove={handleRemoveAccount}
        removingAccountKey={removingAccountKey}
        isAddingGoogle={isGoogleSigningIn}
        onClose={() => setAccountSheetVisible(false)}
      />

      <KnowledgeScreen
        visible={knowledgeVisible}
        onClose={() => setKnowledgeVisible(false)}
      />

      <AutoPilotScreen
        visible={autoPilotVisible}
        onClose={() => setAutoPilotVisible(false)}
      />

      {showBulkSend && (
        <View style={styles.bulkBar}>
          <Pressable
            style={({ pressed }) => [
              styles.bulkButton,
              bulkSending && styles.bulkButtonDisabled,
              pressed && !bulkSending && styles.bulkButtonPressed,
            ]}
            onPress={() => void handleBulkSendAll()}
            disabled={bulkSending}
          >
            {bulkSending ? (
              <ActivityIndicator color="#0D0F14" size="small" />
            ) : (
              <Ionicons name="paper-plane" size={16} color="#0D0F14" />
            )}
            <Text style={styles.bulkButtonText}>Approve & Send All Drafts</Text>
            <View style={styles.bulkCountBadge}>
              <Text style={styles.bulkCountText}>{actionRequiredItems.length}</Text>
            </View>
          </Pressable>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        style={styles.feedList}
        data={filteredNotifications}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={feedListHeader}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({
            offset: Math.max(0, info.averageItemLength * info.index),
            animated: true,
          });
        }}
        renderItem={({ item }) => (
          <FeedCard
            notification={item}
            draftText={
              draftTexts[item.id] ?? item.triage?.suggestedReply ?? ''
            }
            onDraftChange={handleDraftChange}
            onRedraft={handleRedraft}
            onVoiceCommand={handleVoiceCommand}
            onGmailArchive={handleGmailArchive}
            onTrash={handleTrash}
            onSendReply={handleSendReply}
            isRemoving={removingIds.has(item.id)}
            actionBusy={bulkSending}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor="#5B8DEF"
            colors={['#5B8DEF']}
            progressBackgroundColor="#1A1D26"
            title="Refreshing inbox…"
            titleColor="#6B7288"
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#6B7288',
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  headerLeft: {
    flex: 1,
    marginRight: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  knowledgePill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.35)',
  },
  knowledgePillPressed: {
    opacity: 0.85,
  },
  knowledgePillEmoji: {
    fontSize: 20,
  },
  accountPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161922',
  },
  accountPillPressed: {
    opacity: 0.85,
  },
  accountAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountAvatarText: {
    color: '#0D0F14',
    fontSize: 13,
    fontWeight: '800',
  },
  headerMeta: {
    marginTop: 6,
    gap: 6,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  modeBadgeLive: {
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    borderColor: 'rgba(52, 199, 89, 0.35)',
  },
  modeBadgeSimulation: {
    backgroundColor: 'rgba(255, 179, 71, 0.12)',
    borderColor: 'rgba(255, 179, 71, 0.35)',
  },
  modeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  modeDotLive: {
    backgroundColor: '#34C759',
  },
  modeDotSimulation: {
    backgroundColor: '#FFB347',
  },
  modeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  modeBadgeTextLive: {
    color: '#6EE7A0',
  },
  modeBadgeTextSimulation: {
    color: '#FFCB80',
  },
  lastCheckedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#2A3142',
  },
  lastCheckedText: {
    color: '#8B93A8',
    fontSize: 11,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: '#6B7288',
    fontSize: 14,
    marginTop: 4,
  },
  processButton: {
    backgroundColor: '#5B8DEF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  processButtonDisabled: {
    backgroundColor: '#2A3142',
    opacity: 0.6,
  },
  processButtonPressed: {
    opacity: 0.85,
  },
  processButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkBar: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6EE7A0',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 160, 0.45)',
  },
  bulkButtonDisabled: {
    opacity: 0.65,
  },
  bulkButtonPressed: {
    opacity: 0.88,
  },
  bulkButtonText: {
    color: '#0D0F14',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  bulkCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 15, 20, 0.12)',
  },
  bulkCountText: {
    color: '#0D0F14',
    fontSize: 11,
    fontWeight: '800',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#232836',
  },
  tabActive: {
    backgroundColor: '#1E2433',
    borderColor: '#5B8DEF',
  },
  tabLabel: {
    color: '#6B7288',
    fontSize: 12,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    backgroundColor: '#2A3142',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: '#5B8DEF',
  },
  tabBadgeText: {
    color: '#8B93A8',
    fontSize: 11,
    fontWeight: '700',
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  feedList: {
    flex: 1,
  },
  feedListHeader: {
    gap: 0,
    marginBottom: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141824',
    borderWidth: 1,
    borderColor: '#232A38',
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#8B93A8',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#5C6478',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
