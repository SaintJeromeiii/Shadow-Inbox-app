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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import VoiceNoteButton from '../components/VoiceNoteButton';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useFeedVoiceRecording } from '../hooks/useFeedVoiceRecording';
import { removeRelayAccount } from '../services/authService';
import { hideAccountOnDevice, unhideAccountOnDevice } from '../services/accountStorage';
import type { AccountKey } from '../types/account';
import type { AccountProfile } from '../types/account';
import type { FeedTab, TriagedNotification, RawNotification } from '../types/notification';
import { sendVoiceCommand } from '../services/voiceCommandService';
import ArcadeTitle from '../components/ArcadeTitle';
import {
  ArcadeHamburgerIcon,
} from '../components/ArcadeIcons';
import { useRetroFeedback } from '../context/RetroFeedbackContext';
import { arcadeColors, arcadeFonts, arcadeRadii } from '../theme/arcadeTheme';
import PlayerAvatarCard from '../components/PlayerAvatarCard';
import IconLegendMinimap from '../components/IconLegendMinimap';
import StageDifficultyBanner from '../components/StageDifficultyBanner';
import BossLevelPulseFrame from '../components/BossLevelPulseFrame';
import { fetchPlayerStats, recordPlayerDeletion } from '../services/userProgressService';
import { saveLocalCharacterDeletions } from '../services/characterProgressStorage';
import type { PlayerStats } from '../types/userProgress';
import {
  applyDeletionLocally,
  buildPlayerStats,
  didLevelUp,
} from '../utils/playerProgress';
import { getStageDifficulty, isBossLevel } from '../utils/stageDifficulty';
import { useCharacter } from '../context/CharacterContext';
import { fetchDailyEngagement, recordDailyClearance, type DailyEngagement } from '../services/dailyEngagementService';

interface HomeScreenProps {
  onOpenDrawer: () => void;
  focusEmailId?: string | null;
  onFocusEmailHandled?: () => void;
  onNotificationsChange?: (notifications: TriagedNotification[]) => void;
  isScreenFocused?: boolean;
}

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'action_required', label: 'OPEN CASES' },
  { key: 'fyi', label: 'INTEL' },
  { key: 'ignore', label: 'ARCHIVED' },
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

export default function HomeScreen({
  onOpenDrawer,
  focusEmailId: externalFocusEmailId = null,
  onFocusEmailHandled,
  onNotificationsChange,
  isScreenFocused = true,
}: HomeScreenProps) {
  const {
    activeAccount,
    activeProfile,
    accounts,
    ready: accountReady,
    refreshAccounts,
    setActiveAccount,
  } = useAccount();
  const feedVoiceControl = useFeedVoiceRecording();
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [accountSheetVisible, setAccountSheetVisible] = useState(false);
  const [removingAccountKey, setRemovingAccountKey] = useState<AccountKey | null>(null);
  const [focusEmailId, setFocusEmailId] = useState<string | null>(null);
  const skipNextSave = useRef(true);
  const alertedActionIdsRef = useRef<Set<string>>(new Set());
  const loadingAccountRef = useRef<AccountKey | null>(null);
  const triageInFlightRef = useRef(false);
  const flatListRef = useRef<FlatList<TriagedNotification>>(null);
  const playerStatsRef = useRef<PlayerStats | null>(null);
  const { playDeleteSound, showActionComplete, triggerLevelUp } = useRetroFeedback();
  const { characterId } = useCharacter();
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [avatarReplayToken, setAvatarReplayToken] = useState(0);
  const [dailyEngagement, setDailyEngagement] = useState<DailyEngagement | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const dataSource = getNotificationDataSource(activeAccount);
  const triageMode = getTriageMode();
  const isLiveAi = triageMode === 'live';

  const lastCheckedLabel = useMemo(
    () => formatLastChecked(lastUpdated),
    [lastUpdated, timeTick],
  );

  useEffect(() => {
    void fetchDailyEngagement()
      .then(setDailyEngagement)
      .catch((error) => {
        console.warn('[Shadow Inbox] Could not load daily engagement:', error);
      });
  }, [activeAccount]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTimeTick((tick) => tick + 1);
    }, 30_000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayerStats() {
      try {
        const stats = await fetchPlayerStats(activeAccount, characterId);
        if (cancelled) return;
        playerStatsRef.current = stats;
        setPlayerStats(stats);
      } catch (error) {
        console.warn('[Shadow Inbox] Failed to load player stats:', error);
        if (cancelled) return;
        const fallback = buildPlayerStats(0);
        playerStatsRef.current = fallback;
        setPlayerStats(fallback);
      }
    }

    void loadPlayerStats();

    return () => {
      cancelled = true;
    };
  }, [activeAccount, characterId]);

  useEffect(() => {
    stopAllCharacterIntroAmbience();
  }, []);

  const applyPlayerStats = useCallback(
    (nextStats: PlayerStats) => {
      const previous = playerStatsRef.current;
      if (previous && didLevelUp(previous.totalDeletions, nextStats.totalDeletions)) {
        triggerLevelUp(nextStats.tierName);
      }
      playerStatsRef.current = nextStats;
      setPlayerStats(nextStats);
      void saveLocalCharacterDeletions(activeAccount, characterId, nextStats.totalDeletions);
    },
    [activeAccount, characterId, triggerLevelUp],
  );

  const applyLocalDeletion = useCallback(
    async (count = 1) => {
      void recordDailyClearance(count)
        .then(setDailyEngagement)
        .catch((error) => {
          console.warn('[Shadow Inbox] Failed to record daily clearance:', error);
        });

      if (playerStatsRef.current) {
        const next = applyDeletionLocally(playerStatsRef.current, count);
        if (next.leveledUp) {
          triggerLevelUp(next.tierName);
        }
        playerStatsRef.current = next;
        setPlayerStats(next);
        await saveLocalCharacterDeletions(activeAccount, characterId, next.totalDeletions);
        return;
      }

      try {
        const stats = await recordPlayerDeletion(count, activeAccount, characterId);
        applyPlayerStats(stats);
      } catch (error) {
        console.warn('[Shadow Inbox] Failed to record player deletion:', error);
      }
    },
    [activeAccount, applyPlayerStats, characterId, triggerLevelUp],
  );

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
    async (
      accountKey: AccountKey,
      options: { sync?: boolean; seed?: RawNotification[] } = {},
    ): Promise<TriagedNotification[]> => {
      const { sync = false, seed: seedOverride } = options;
      skipNextSave.current = true;

      let seed = seedOverride ?? getSeedNotifications(accountKey);
      const merged = await loadPersistedNotifications(accountKey, seed);
      return merged;
    },
    [],
  );

  const fetchRelayInboxSeed = useCallback(
    async (accountKey: AccountKey, sync: boolean): Promise<RawNotification[]> => {
      let seed = getSeedNotifications(accountKey);

      try {
        const remote = await fetchInboxFromRelay(accountKey, sync);
        if (remote.notifications.length > 0) {
          return remote.notifications;
        }
      } catch (error) {
        console.warn(
          `[Shadow Inbox] Relay ${sync ? 'sync' : 'cache'} fetch failed for ${accountKey}:`,
          error,
        );
      }

      return seed;
    },
    [],
  );

  const runTriageOnNotifications = useCallback(
    async (
      pending: TriagedNotification[],
      options: { announce?: boolean } = {},
    ) => {
      if (pending.length === 0 || triageInFlightRef.current) {
        return;
      }

      triageInFlightRef.current = true;
      setProcessing(true);
      setProgress(`0 / ${pending.length}`);

      try {
        const results = await triageNotifications(pending, (done, total) => {
          setProgress(`${done} / ${total}`);
        });

        setNotifications((prev) => {
          const updated = prev.map((item) => {
            const triage = results.get(item.id);
            return triage ? { ...item, triage } : item;
          });

          void syncShadowLabels(updated).then((labelResult) => {
            if (!labelResult.success || !labelResult.updated?.length) {
              return;
            }

            const labelById = new Map(labelResult.updated.map((entry) => [entry.id, entry]));
            setNotifications((current) =>
              current.map((item) => {
                const labeled = labelById.get(item.id);
                return labeled ? { ...item, ...labeled } : item;
              }),
            );
          });

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

        if (options.announce !== false && results.size > 0) {
          showActionComplete('SYNTHESIS COMPLETE!');
        }
      } finally {
        triageInFlightRef.current = false;
        setProcessing(false);
        setProgress(null);
      }
    },
    [showActionComplete],
  );

  const applyInboxReload = useCallback(
    async (accountKey: AccountKey, sync = true): Promise<TriagedNotification[]> => {
      loadingAccountRef.current = accountKey;

      const publishInbox = (merged: TriagedNotification[]) => {
        setNotifications(merged);
        setDraftTexts(buildDraftMap(merged));
        setRemovingIds(new Set());
        setProcessing(false);
        setProgress(null);
        setLastUpdated(new Date());
        setHydrated(true);
        return merged;
      };

      try {
        const cachedSeed = await fetchRelayInboxSeed(accountKey, false);
        let merged = await reloadInboxFromSource(accountKey, { seed: cachedSeed });

        if (merged.length > 0 || !sync) {
          publishInbox(merged);
        }

        if (!sync) {
          return merged;
        }

        const syncedSeed = await fetchRelayInboxSeed(accountKey, true);
        if (syncedSeed.length > 0 || cachedSeed.length === 0) {
          merged = await reloadInboxFromSource(accountKey, { seed: syncedSeed });
        }

        setActiveTab('action_required');
        const published = publishInbox(merged);
        const pending = published.filter((item) => !item.archived && !item.triage);
        if (pending.length > 0) {
          void runTriageOnNotifications(pending, { announce: false });
        }
        return published;
      } finally {
        loadingAccountRef.current = null;
      }
    },
    [fetchRelayInboxSeed, reloadInboxFromSource, runTriageOnNotifications],
  );

  useEffect(() => {
    if (!accountReady) return;

    let cancelled = false;
    setRefreshing(true);

    void applyInboxReload(activeAccount, true).finally(() => {
      if (!cancelled) {
        setRefreshing(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accountReady, activeAccount, applyInboxReload]);

  useEffect(() => {
    onNotificationsChange?.(notifications);
  }, [notifications, onNotificationsChange]);

  useEffect(() => {
    if (!externalFocusEmailId) return;
    setFocusEmailId(externalFocusEmailId);
    setActiveTab('action_required');
    onFocusEmailHandled?.();
  }, [externalFocusEmailId, onFocusEmailHandled]);

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
    setAvatarReplayToken((token) => token + 1);
    try {
      await applyInboxReload(activeAccount, true);
    } finally {
      setRefreshing(false);
    }
  }, [activeAccount, applyInboxReload]);

  const handleSelectAccount = useCallback(
    async (accountKey: AccountKey) => {
      setAccountSheetVisible(false);
      if (accountKey === activeAccount) return;
      await setActiveAccount(accountKey);
    },
    [activeAccount, setActiveAccount],
  );

  const handleGoogleAccountLinked = useCallback(
    async (account: AccountProfile) => {
      setAccountSheetVisible(false);
      await unhideAccountOnDevice(account.key);
      await refreshAccounts();
      await setActiveAccount(account.key);
    },
    [refreshAccounts, setActiveAccount],
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
                      await applyInboxReload(nextAccount, false);
                    } finally {
                      setRefreshing(false);
                    }
                  } else {
                    setNotifications([]);
                    setDraftTexts({});
                    setLastUpdated(null);
                  }
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

  const untriagedNotifications = useMemo(
    () => notifications.filter((n) => !n.archived && !n.triage),
    [notifications],
  );

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelectedId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectNotificationIds = useCallback((items: TriagedNotification[]) => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, []);

  useEffect(() => {
    exitSelectionMode();
  }, [activeTab, exitSelectionMode]);

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

  const activeFolderCount = tabCounts[activeTab];
  const activeFolderLabel = TABS.find((tab) => tab.key === activeTab)?.label ?? 'STAGE';
  const stageDifficulty = useMemo(
    () => getStageDifficulty(activeFolderCount),
    [activeFolderCount],
  );
  const bossLevelActive = isBossLevel(activeFolderCount);

  const actionRequiredItems = useMemo(
    () =>
      notifications.filter(
        (n) => !n.archived && n.triage?.category === 'action_required',
      ),
    [notifications],
  );

  const showBulkSend = actionRequiredItems.length >= 2 && !selectionMode;
  const selectedCount = selectedIds.size;
  const selectedHiddenCount = useMemo(() => {
    const visibleIds = new Set(filteredNotifications.map((item) => item.id));
    return [...selectedIds].filter((id) => !visibleIds.has(id)).length;
  }, [filteredNotifications, selectedIds]);
  const selectionBarBottomPad = Math.max(insets.bottom, 16) + 12;
  const bulkBarBottomPad = Math.max(insets.bottom, 16) + 12;
  const listBottomPad = selectionMode
    ? 120 + selectionBarBottomPad
    : showBulkSend
      ? 76 + bulkBarBottomPad
      : 32 + Math.max(insets.bottom, 8);

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

  const feedListHeader = useMemo(
    () => (
      <View style={styles.feedListHeader}>
        {playerStats ? (
          <PlayerAvatarCard
            stats={playerStats}
            inboxCount={activeFolderCount}
            enableIntro
            replayToken={avatarReplayToken}
          />
        ) : null}

        {dailyEngagement ? (
          <View style={styles.dailyGoalBanner}>
            <Text style={styles.dailyGoalTitle}>DAILY CLEARANCE</Text>
            <View style={styles.dailyGoalTrack}>
              <View
                style={[
                  styles.dailyGoalFill,
                  { width: `${Math.round(dailyEngagement.progress * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.dailyGoalMeta}>
              {dailyEngagement.clearsToday}/{dailyEngagement.dailyGoal} cleared
              {dailyEngagement.streakDays > 0
                ? ` · ${dailyEngagement.streakDays} day streak`
                : ''}
              {dailyEngagement.goalMet ? ' · GOAL MET' : ''}
            </Text>
          </View>
        ) : null}

        <StageDifficultyBanner
          difficulty={stageDifficulty}
          signalCount={activeFolderCount}
          folderLabel={activeFolderLabel}
        />

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
      tabCounts,
      playerStats,
      avatarReplayToken,
      dailyEngagement,
      stageDifficulty,
      activeFolderCount,
      activeFolderLabel,
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
        playDeleteSound();
        await applyLocalDeletion(1);
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
      playDeleteSound();
      if (result.playerStats) {
        applyPlayerStats(result.playerStats);
      } else {
        await applyLocalDeletion(1);
      }
    },
    [removeNotificationsFromFeed, playDeleteSound, applyPlayerStats, applyLocalDeletion],
  );

  const handleTrash = useCallback(
    async (notification: TriagedNotification) => {
      if (notification.sourceApp !== 'Email') {
        removeNotificationsFromFeed([notification.id]);
        playDeleteSound();
        await applyLocalDeletion(1);
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
      playDeleteSound();
      if (result.playerStats) {
        applyPlayerStats(result.playerStats);
      } else {
        await applyLocalDeletion(1);
      }
    },
    [removeNotificationsFromFeed, playDeleteSound, applyPlayerStats, applyLocalDeletion],
  );

  const handleBulkTrash = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkActionBusy) {
      return;
    }

    Alert.alert(
      'Trash Selected',
      `Move ${ids.length} message${ids.length === 1 ? '' : 's'} to Gmail trash?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Trash',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBulkActionBusy(true);
              try {
                const selected = notifications.filter((item) => selectedIds.has(item.id));
                const emailIds = selected
                  .filter((item) => item.sourceApp === 'Email')
                  .map((item) => item.id);
                const nonEmailIds = selected
                  .filter((item) => item.sourceApp !== 'Email')
                  .map((item) => item.id);

                if (emailIds.length > 0) {
                  const result = await trashEmails(emailIds);
                  if (!result.success) {
                    Alert.alert(
                      'Trash Failed',
                      result.error ?? 'Could not trash selected messages.',
                    );
                    return;
                  }
                  if (result.playerStats) {
                    applyPlayerStats(result.playerStats);
                  }
                }

                const removedIds = [...emailIds, ...nonEmailIds];
                if (removedIds.length > 0) {
                  removeNotificationsFromFeed(removedIds);
                  playDeleteSound();
                  if (!emailIds.length || emailIds.length < removedIds.length) {
                    await applyLocalDeletion(removedIds.length);
                  }
                }

                exitSelectionMode();
              } finally {
                setBulkActionBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [
    applyLocalDeletion,
    applyPlayerStats,
    bulkActionBusy,
    exitSelectionMode,
    notifications,
    playDeleteSound,
    removeNotificationsFromFeed,
    selectedIds,
  ]);

  const handleBulkArchive = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkActionBusy) {
      return;
    }

    Alert.alert(
      'Archive Selected',
      `Archive ${ids.length} message${ids.length === 1 ? '' : 's'} in Gmail?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () => {
            void (async () => {
              setBulkActionBusy(true);
              try {
                const selected = notifications.filter((item) => selectedIds.has(item.id));
                const emailIds = selected
                  .filter((item) => item.sourceApp === 'Email')
                  .map((item) => item.id);
                const nonEmailIds = selected
                  .filter((item) => item.sourceApp !== 'Email')
                  .map((item) => item.id);

                if (emailIds.length > 0) {
                  const result = await archiveEmails(emailIds);
                  if (!result.success) {
                    Alert.alert(
                      'Archive Failed',
                      result.error ?? 'Could not archive selected messages.',
                    );
                    return;
                  }
                  if (result.playerStats) {
                    applyPlayerStats(result.playerStats);
                  }
                }

                const removedIds = [...emailIds, ...nonEmailIds];
                if (removedIds.length > 0) {
                  removeNotificationsFromFeed(removedIds);
                  playDeleteSound();
                  if (!emailIds.length || emailIds.length < removedIds.length) {
                    await applyLocalDeletion(removedIds.length);
                  }
                }

                exitSelectionMode();
              } finally {
                setBulkActionBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [
    applyLocalDeletion,
    applyPlayerStats,
    bulkActionBusy,
    exitSelectionMode,
    notifications,
    playDeleteSound,
    removeNotificationsFromFeed,
    selectedIds,
  ]);

  const handleProcessFeed = useCallback(async () => {
    const pending = notifications.filter((n) => !n.triage);
    if (pending.length === 0) return;
    await runTriageOnNotifications(pending, { announce: true });
  }, [notifications, runTriageOnNotifications]);

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
            showActionComplete('REPLY SENT!');
            if (result.playerStats) {
              applyPlayerStats(result.playerStats);
            }
            return;
          }
        }

        removeNotificationsFromFeed([notification.id]);
        showActionComplete('REPLY SENT!');
        if (result.playerStats) {
          applyPlayerStats(result.playerStats);
        }
        return;
      }

      Alert.alert(
        'Send Failed',
        result.error ?? 'Could not send reply. Is the email relay running?',
      );
    },
    [removeNotificationsFromFeed, showActionComplete, applyPlayerStats],
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
    let latestPlayerStats: PlayerStats | undefined;

    try {
      for (const notification of sendable) {
        const replyText =
          draftTexts[notification.id]?.trim() ??
          notification.triage?.suggestedReply?.trim() ??
          '';

        const result = await sendReply(notification, replyText);
        if (result.success) {
          sentIds.push(notification.id);
          if (result.playerStats) {
            latestPlayerStats = result.playerStats;
          }
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
        showActionComplete('ALL REPLIES SENT!');
        if (latestPlayerStats) {
          applyPlayerStats(latestPlayerStats);
        }
      }

      if (failed.length > 0) {
        Alert.alert(
          'Partial Send',
          `${sentIds.length} sent, ${failed.length} failed. Check relay connection and retry.`,
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
    showActionComplete,
    applyPlayerStats,
  ]);

  const renderEmpty = () => {
    let subtitle = 'Pull down to refresh when new mail arrives.';

    if (processing) {
      subtitle = 'AI is sorting your inbox…';
    } else if (syncError) {
      subtitle = syncError;
    } else if (unreadCount > 0) {
      subtitle = 'New mail is syncing and will auto-triage shortly.';
    } else if (!activeProfile.oauth && accounts.every((account) => !account.oauth)) {
      subtitle = 'Connect Gmail in Settings to load your real inbox.';
    } else if (activeTab === 'action_required') {
      subtitle = 'No open cases — inbox zero for now.';
    }

    return (
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
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
    );
  };

  if (!hydrated || !accountReady) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={arcadeColors.neonCyan} size="large" />
          <Text style={styles.loadingText}>Loading inbox…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}
          onPress={onOpenDrawer}
          accessibilityLabel="Open side deck menu"
        >
          <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
        </Pressable>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleWrap}>
            <ArcadeTitle />
          </View>
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
          <VoiceNoteButton accountKey={activeAccount} compact />
          <Pressable
            style={({ pressed }) => [
              styles.headerUtilityPill,
              styles.accountPill,
              { borderColor: activeProfile.accentColor },
              pressed && styles.headerUtilityPillPressed,
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
          <IconLegendMinimap embedded />
        </View>
      </View>

      <View style={styles.headerProcessRow}>
        {selectionMode ? (
          <View style={styles.selectionToolbar}>
            <Pressable
              style={({ pressed }) => [
                styles.selectionDoneButton,
                pressed && styles.headerUtilityPillPressed,
              ]}
              onPress={exitSelectionMode}
              accessibilityLabel="Exit selection mode"
            >
              <Ionicons name="close" size={16} color={arcadeColors.textMuted} />
              <Text style={styles.selectionDoneText}>Done</Text>
            </Pressable>
            <Text style={styles.selectionCountLabel}>
              {selectedCount} selected
              {selectedHiddenCount > 0
                ? ` · ${selectedHiddenCount} off-screen`
                : ''}
            </Text>
          </View>
        ) : (
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
        )}
        {!selectionMode ? (
          <Pressable
            style={({ pressed }) => [
              styles.selectModeButton,
              pressed && styles.headerUtilityPillPressed,
            ]}
            onPress={() => setSelectionMode(true)}
            accessibilityLabel="Select messages for bulk actions"
          >
            <Ionicons
              name="checkbox-outline"
              size={18}
              color={arcadeColors.neonCyan}
            />
          </Pressable>
        ) : null}
      </View>

      {selectionMode ? (
        <View style={styles.selectionChipRow}>
          <Pressable
            style={({ pressed }) => [
              styles.selectionChip,
              pressed && styles.selectionChipPressed,
            ]}
            onPress={() => selectNotificationIds(filteredNotifications)}
          >
            <Text style={styles.selectionChipText}>
              All ({filteredNotifications.length})
            </Text>
          </Pressable>
          {untriagedNotifications.length > 0 ? (
            <Pressable
              style={({ pressed }) => [
                styles.selectionChip,
                pressed && styles.selectionChipPressed,
              ]}
              onPress={() => selectNotificationIds(untriagedNotifications)}
            >
              <Text style={styles.selectionChipText}>
                Unread ({untriagedNotifications.length})
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [
              styles.selectionChip,
              pressed && styles.selectionChipPressed,
            ]}
            onPress={() =>
              selectNotificationIds(
                filteredNotifications.filter((item) => Boolean(item.triage)),
              )
            }
          >
            <Text style={styles.selectionChipText}>
              Read ({filteredNotifications.filter((item) => item.triage).length})
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.selectionChip,
              pressed && styles.selectionChipPressed,
            ]}
            onPress={() => setSelectedIds(new Set())}
          >
            <Text style={styles.selectionChipText}>None</Text>
          </Pressable>
        </View>
      ) : null}

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

      <BossLevelPulseFrame active={bossLevelActive}>
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
            voiceControl={feedVoiceControl}
            onGmailArchive={handleGmailArchive}
            onTrash={handleTrash}
            onSendReply={handleSendReply}
            isRemoving={removingIds.has(item.id)}
            actionBusy={bulkSending || bulkActionBusy}
            selectionMode={selectionMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={toggleSelectedId}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={arcadeColors.neonCyan}
            colors={[arcadeColors.neonCyan]}
            progressBackgroundColor={arcadeColors.bgPanel}
            title="Refreshing inbox…"
            titleColor={arcadeColors.textMuted}
          />
        }
      />
      </BossLevelPulseFrame>

      {showBulkSend && (
        <View style={[styles.bulkBar, { paddingBottom: bulkBarBottomPad }]}>
          <Pressable
            style={({ pressed }) => [
              styles.bulkButton,
              bulkSending && styles.bulkButtonDisabled,
              pressed && !bulkSending && styles.bulkButtonPressed,
            ]}
            onPress={() => void handleBulkSendAll()}
            disabled={bulkSending}
            accessibilityLabel="Approve and send all drafts"
          >
            {bulkSending ? (
              <ActivityIndicator color={arcadeColors.neonGreen} size="small" />
            ) : (
              <View style={styles.bulkIconWrap}>
                <Ionicons name="rocket" size={14} color={arcadeColors.neonGreen} />
              </View>
            )}
            <Text style={styles.bulkButtonText}>
              APPROVE & SEND{'\n'}ALL DRAFTS
            </Text>
            <View style={styles.bulkCountBadge}>
              <Text style={styles.bulkCountText}>{actionRequiredItems.length}</Text>
            </View>
          </Pressable>
        </View>
      )}

      {selectionMode && (
        <View style={[styles.selectionActionBar, { paddingBottom: selectionBarBottomPad }]}>
          <Pressable
            style={({ pressed }) => [
              styles.selectionActionButton,
              styles.selectionArchiveButton,
              (bulkActionBusy || selectedCount === 0) && styles.selectionActionDisabled,
              pressed && !bulkActionBusy && selectedCount > 0 && styles.selectionActionPressed,
            ]}
            onPress={() => void handleBulkArchive()}
            disabled={bulkActionBusy || selectedCount === 0}
          >
            {bulkActionBusy ? (
              <ActivityIndicator color={arcadeColors.neonCyan} size="small" />
            ) : (
              <Ionicons name="archive-outline" size={18} color={arcadeColors.neonCyan} />
            )}
            <Text style={styles.selectionArchiveText}>Archive ({selectedCount})</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.selectionActionButton,
              styles.selectionTrashButton,
              (bulkActionBusy || selectedCount === 0) && styles.selectionActionDisabled,
              pressed && !bulkActionBusy && selectedCount > 0 && styles.selectionActionPressed,
            ]}
            onPress={() => void handleBulkTrash()}
            disabled={bulkActionBusy || selectedCount === 0}
          >
            {bulkActionBusy ? (
              <ActivityIndicator color={arcadeColors.neonRed} size="small" />
            ) : (
              <Ionicons name="trash-outline" size={18} color={arcadeColors.neonRed} />
            )}
            <Text style={styles.selectionTrashText}>Trash ({selectedCount})</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: arcadeColors.textMuted,
    fontSize: 15,
    fontFamily: arcadeFonts.body,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
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
    flexShrink: 0,
  },
  menuButtonPressed: {
    opacity: 0.85,
  },
  headerLeft: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 12,
  },
  headerTitleWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  headerProcessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  headerUtilityPill: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
  },
  headerUtilityPillPressed: {
    opacity: 0.85,
  },
  headerUtilityEmoji: {
    fontSize: 18,
  },
  accountPill: {
    borderWidth: 2,
  },
  accountAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
  },
  lastCheckedText: {
    color: arcadeColors.textMuted,
    fontSize: 10,
    fontFamily: arcadeFonts.body,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: arcadeColors.textMuted,
    fontSize: 12,
    fontFamily: arcadeFonts.body,
    marginTop: 4,
  },
  selectionToolbar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    backgroundColor: arcadeColors.bgPanel,
  },
  selectionDoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectionDoneText: {
    color: arcadeColors.textMuted,
    fontSize: 11,
    fontFamily: arcadeFonts.pixel,
  },
  selectionCountLabel: {
    color: arcadeColors.neonCyan,
    fontSize: 10,
    fontFamily: arcadeFonts.pixel,
  },
  selectModeButton: {
    width: 44,
    height: 44,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    backgroundColor: arcadeColors.bgPanel,
  },
  selectionChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  selectionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    backgroundColor: arcadeColors.bgPanel,
  },
  selectionChipPressed: {
    opacity: 0.85,
  },
  selectionChipText: {
    color: arcadeColors.textMuted,
    fontSize: 9,
    fontFamily: arcadeFonts.pixel,
    letterSpacing: 0.3,
  },
  selectionActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(3, 8, 18, 0.96)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(91, 141, 239, 0.35)',
  },
  selectionActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: arcadeRadii.sm,
    borderWidth: 2,
  },
  selectionArchiveButton: {
    borderColor: 'rgba(91, 141, 239, 0.55)',
    backgroundColor: arcadeColors.bgPanel,
  },
  selectionTrashButton: {
    borderColor: 'rgba(255, 138, 138, 0.55)',
    backgroundColor: arcadeColors.bgPanel,
  },
  selectionActionDisabled: {
    opacity: 0.45,
  },
  selectionActionPressed: {
    opacity: 0.88,
  },
  selectionArchiveText: {
    color: arcadeColors.neonCyan,
    fontSize: 10,
    fontFamily: arcadeFonts.pixel,
  },
  selectionTrashText: {
    color: arcadeColors.neonRed,
    fontSize: 10,
    fontFamily: arcadeFonts.pixel,
  },
  processButton: {
    flex: 1,
    backgroundColor: arcadeColors.bgPanelElevated,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
  },
  processButtonDisabled: {
    backgroundColor: arcadeColors.bgPanel,
    borderColor: arcadeColors.borderMuted,
    opacity: 0.6,
  },
  processButtonPressed: {
    opacity: 0.85,
  },
  processButtonText: {
    color: arcadeColors.neonPink,
    fontSize: 10,
    fontFamily: arcadeFonts.pixel,
    letterSpacing: 0.5,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(3, 8, 18, 0.96)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(102, 255, 153, 0.35)',
    shadowColor: arcadeColors.neonGreen,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  bulkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: arcadeColors.bgPanel,
    borderRadius: arcadeRadii.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: 'rgba(102, 255, 153, 0.55)',
    shadowColor: arcadeColors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  bulkIconWrap: {
    width: 28,
    height: 28,
    borderRadius: arcadeRadii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
  },
  bulkButtonDisabled: {
    opacity: 0.55,
  },
  bulkButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  bulkButtonText: {
    flex: 1,
    color: arcadeColors.neonGreen,
    fontSize: 8,
    fontFamily: arcadeFonts.pixel,
    letterSpacing: 0.6,
    lineHeight: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(102, 255, 153, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  bulkCountBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: arcadeRadii.sm,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 2,
    borderColor: arcadeColors.neonPink,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  bulkCountText: {
    color: arcadeColors.neonPink,
    fontSize: 9,
    fontFamily: arcadeFonts.pixel,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: arcadeColors.tabInactive,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
  },
  tabActive: {
    backgroundColor: arcadeColors.tabActive,
    borderColor: arcadeColors.borderCyan,
  },
  tabLabel: {
    flexShrink: 1,
    color: arcadeColors.textDim,
    fontSize: 7,
    lineHeight: 10,
    fontFamily: arcadeFonts.pixel,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: arcadeColors.neonCyan,
  },
  tabBadge: {
    backgroundColor: arcadeColors.bgPanelElevated,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    minWidth: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
  },
  tabBadgeActive: {
    backgroundColor: arcadeColors.neonPink,
    borderColor: arcadeColors.neonPink,
  },
  tabBadgeText: {
    color: arcadeColors.textMuted,
    fontSize: 9,
    fontFamily: arcadeFonts.body,
    fontWeight: '700',
  },
  tabBadgeTextActive: {
    color: arcadeColors.bgDeep,
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
  dailyGoalBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 20, 40, 0.82)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  dailyGoalTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.4,
  },
  dailyGoalTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanel,
    overflow: 'hidden',
  },
  dailyGoalFill: {
    height: '100%',
    backgroundColor: arcadeColors.neonPink,
  },
  dailyGoalMeta: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textDim,
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
