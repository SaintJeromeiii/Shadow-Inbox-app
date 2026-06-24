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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FeedCard from '../components/FeedCard';
import {
  triageNotifications,
  getTriageMode,
  getNotificationDataSource,
} from '../services/triageService';
import { getSeedNotifications } from '../services/notificationData';
import {
  loadPersistedNotifications,
  saveNotifications,
} from '../services/notificationStorage';
import { sendReply } from '../services/emailService';
import type { FeedTab, TriagedNotification } from '../types/notification';

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'action_required', label: 'Action Required' },
  { key: 'fyi', label: 'FYI' },
  { key: 'ignore', label: 'Archived' },
];

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
  const [notifications, setNotifications] = useState<TriagedNotification[]>([]);
  const [activeTab, setActiveTab] = useState<FeedTab>('action_required');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [timeTick, setTimeTick] = useState(0);
  const skipNextSave = useRef(true);

  const dataSource = getNotificationDataSource();
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

  const reloadInboxFromSource = useCallback(async () => {
    await AsyncStorage.clear();
    skipNextSave.current = true;

    const freshNotifications = getSeedNotifications().map((notification) => ({
      ...notification,
    }));

    setNotifications(freshNotifications);
    setActiveTab('action_required');
    setProcessing(false);
    setProgress(null);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const persisted = await loadPersistedNotifications();
      if (!cancelled) {
        setNotifications(persisted);
        setLastUpdated(new Date());
        setHydrated(true);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    void saveNotifications(notifications);
  }, [notifications, hydrated]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reloadInboxFromSource();
    } finally {
      setRefreshing(false);
    }
  }, [reloadInboxFromSource]);

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

  const handleProcessFeed = useCallback(async () => {
    const pending = notifications.filter((n) => !n.triage);
    if (pending.length === 0) return;

    setProcessing(true);
    setProgress(`0 / ${pending.length}`);

    try {
      const results = await triageNotifications(pending, (done, total) => {
        setProgress(`${done} / ${total}`);
      });

      setNotifications((prev) =>
        prev.map((n) => {
          const triage = results.get(n.id);
          return triage ? { ...n, triage } : n;
        }),
      );
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }, [notifications]);

  const handleArchive = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, archived: true } : n)),
    );
  }, []);

  const handleSendReply = useCallback(
    async (notification: TriagedNotification, replyText: string) => {
      const result = await sendReply(notification, replyText);

      if (result.success) {
        Alert.alert('Message Sent!', 'Your reply was delivered successfully.');
        handleArchive(notification.id);
        return;
      }

      Alert.alert(
        'Send Failed',
        result.error ?? 'Could not send reply. Is the email relay running?',
      );
    },
    [handleArchive],
  );

  const renderEmpty = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>
        {activeTab === 'ignore' ? 'Nothing archived' : 'No notifications here'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {unreadCount > 0
          ? 'Tap "Process Feed" to triage your inbox.'
          : 'Pull down to refresh, or check another tab.'}
      </Text>
    </View>
  );

  if (!hydrated) {
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
                ? `${unreadCount} unread · ${dataSource} feed`
                : `Feed processed · ${dataSource} data`}
            </Text>
          </View>
        </View>
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

      <FlatList
        data={filteredNotifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FeedCard
            notification={item}
            onArchive={handleArchive}
            onSendReply={handleSendReply}
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
    marginRight: 12,
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
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
