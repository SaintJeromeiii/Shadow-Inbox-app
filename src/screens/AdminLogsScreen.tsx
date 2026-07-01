import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccount } from '../context/AccountContext';
import {
  adminLogsService,
  AUTOMATION_LOG_FILTERS,
  formatAutomationEventType,
  formatAutomationLogTimestamp,
} from '../services/adminLogsService';
import type { AutomationLog, AutomationLogStatus, AutomationLogStatusFilter } from '../types/automationLog';
import { ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface AdminLogsScreenProps {
  visible: boolean;
  onClose: () => void;
  variant?: 'modal' | 'screen';
  onOpenDrawer?: () => void;
}

function getStatusStyles(status: AutomationLogStatus) {
  switch (status) {
    case 'completed':
      return { badge: styles.statusCompleted, text: styles.statusCompletedText };
    case 'failed':
      return { badge: styles.statusFailed, text: styles.statusFailedText };
    case 'dead_letter':
      return { badge: styles.statusDeadLetter, text: styles.statusDeadLetterText };
    case 'processing':
      return { badge: styles.statusProcessing, text: styles.statusProcessingText };
    case 'pending':
      return { badge: styles.statusPending, text: styles.statusPendingText };
    default:
      return { badge: styles.statusDefault, text: styles.statusDefaultText };
  }
}

function LogListItem({
  log,
  replaying,
  onRetry,
}: {
  log: AutomationLog;
  replaying: boolean;
  onRetry: () => void;
}) {
  const statusStyles = getStatusStyles(log.status);
  const isRetryable = log.status === 'failed' || log.status === 'dead_letter';

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.eventType}>{formatAutomationEventType(log.eventType)}</Text>
        <View style={[styles.statusBadge, statusStyles.badge]}>
          <Text style={[styles.statusText, statusStyles.text]}>
            {log.status.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      <Text style={styles.messageId} numberOfLines={1}>
        {log.messageId}
      </Text>

      <View style={styles.metaRow}>
        <Text style={styles.date}>{formatAutomationLogTimestamp(log.createdAt)}</Text>
        <Text style={styles.retryCount}>Retries: {log.retryCount}</Text>
      </View>

      {log.errorMessage ? (
        <Text style={styles.errorText} numberOfLines={3}>
          {log.errorMessage}
        </Text>
      ) : null}

      {isRetryable ? (
        <Pressable
          style={[styles.retryButton, replaying && styles.retryButtonDisabled]}
          onPress={onRetry}
          disabled={replaying}
        >
          {replaying ? (
            <ActivityIndicator color={arcadeColors.bgDeep} size="small" />
          ) : (
            <>
              <Ionicons name="refresh" size={14} color={arcadeColors.bgDeep} />
              <Text style={styles.retryText}>REPLAY REQUEST</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AdminLogsScreen({
  visible,
  onClose,
  variant = 'screen',
  onOpenDrawer,
}: AdminLogsScreenProps) {
  const { activeAccount } = useAccount();
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AutomationLogStatusFilter>('all');
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const loadLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const data = await adminLogsService.fetchLogs(activeAccount);
      setLogs(data);
      setLoading(false);
      setRefreshing(false);
    },
    [activeAccount],
  );

  useEffect(() => {
    if (!visible) return;
    void loadLogs();
  }, [visible, loadLogs]);

  const filteredLogs = useMemo(() => {
    if (statusFilter === 'all') return logs;
    return logs.filter((log) => log.status === statusFilter);
  }, [logs, statusFilter]);

  const handleRetry = async (id: string) => {
    setReplayingId(id);
    const success = await adminLogsService.triggerRetry(id, activeAccount);
    setReplayingId(null);
    if (success) {
      await loadLogs(true);
    }
  };

  const content = (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {variant === 'screen' && onOpenDrawer ? (
          <Pressable style={styles.menuButton} onPress={onOpenDrawer}>
            <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
          </Pressable>
        ) : null}
        <View style={styles.headerTitleRow}>
          <Ionicons name="pulse" size={22} color={arcadeColors.neonPink} />
          <View>
            <Text style={styles.title}>OPS CONSOLE</Text>
            <Text style={styles.subtitle}>Automation log monitor</Text>
          </View>
        </View>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={22} color={arcadeColors.neonCyan} />
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        <FlatList
          horizontal
          data={AUTOMATION_LOG_FILTERS}
          keyExtractor={(item) => item.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => {
            const active = statusFilter === item.value;
            return (
              <Pressable
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setStatusFilter(item.value)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={arcadeColors.neonCyan} />
          <Text style={styles.loadingText}>Scanning automation ledger…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredLogs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadLogs(true)}
              tintColor={arcadeColors.neonCyan}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No automation logs found.</Text>
          }
          renderItem={({ item }) => (
            <LogListItem
              log={item}
              replaying={replayingId === item.id}
              onRetry={() => void handleRetry(item.id)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );

  if (variant === 'screen') {
    if (!visible) return null;
    return content;
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: arcadeColors.bgDeep,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: arcadeColors.borderMuted,
    gap: 10,
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
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: arcadeColors.neonPink,
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: arcadeColors.textMuted,
    fontSize: 12,
    fontFamily: arcadeFonts.body,
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 1,
    borderColor: arcadeColors.borderCyan,
  },
  filterRow: {
    borderBottomWidth: 1,
    borderBottomColor: arcadeColors.borderMuted,
  },
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    backgroundColor: arcadeColors.bgPanel,
    marginRight: 8,
  },
  filterChipActive: {
    borderColor: arcadeColors.neonPink,
    backgroundColor: 'rgba(255, 102, 204, 0.12)',
  },
  filterChipText: {
    color: arcadeColors.textMuted,
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    letterSpacing: 0.3,
  },
  filterChipTextActive: {
    color: arcadeColors.neonPink,
  },
  loadingText: {
    color: arcadeColors.textMuted,
    fontSize: 14,
    fontFamily: arcadeFonts.body,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: arcadeColors.bgPanel,
    padding: 16,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  eventType: {
    flex: 1,
    fontWeight: '700',
    fontSize: 12,
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.pixel,
    letterSpacing: 0.3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontWeight: '600',
    fontSize: 9,
    fontFamily: arcadeFonts.pixel,
    letterSpacing: 0.2,
  },
  statusCompleted: {
    backgroundColor: 'rgba(102, 255, 153, 0.15)',
    borderColor: '#66FF99',
  },
  statusCompletedText: {
    color: '#66FF99',
  },
  statusFailed: {
    backgroundColor: 'rgba(255, 68, 102, 0.15)',
    borderColor: '#FF4466',
  },
  statusFailedText: {
    color: '#FF4466',
  },
  statusDeadLetter: {
    backgroundColor: 'rgba(255, 224, 102, 0.15)',
    borderColor: '#FFE066',
  },
  statusDeadLetterText: {
    color: '#FFE066',
  },
  statusProcessing: {
    backgroundColor: 'rgba(122, 168, 204, 0.15)',
    borderColor: '#7AA8CC',
  },
  statusProcessingText: {
    color: '#7AA8CC',
  },
  statusPending: {
    backgroundColor: 'rgba(199, 216, 255, 0.12)',
    borderColor: '#C7D8FF',
  },
  statusPendingText: {
    color: '#C7D8FF',
  },
  statusDefault: {
    backgroundColor: arcadeColors.bgDeep,
    borderColor: arcadeColors.borderMuted,
  },
  statusDefaultText: {
    color: arcadeColors.textMuted,
  },
  messageId: {
    color: arcadeColors.textDim,
    fontSize: 11,
    fontFamily: arcadeFonts.body,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  date: {
    fontSize: 11,
    color: arcadeColors.textMuted,
    fontFamily: arcadeFonts.body,
  },
  retryCount: {
    fontSize: 11,
    color: arcadeColors.textDim,
    fontFamily: arcadeFonts.body,
  },
  errorText: {
    color: arcadeColors.danger,
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
    fontFamily: arcadeFonts.body,
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: arcadeColors.neonYellow,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  retryButtonDisabled: {
    opacity: 0.7,
  },
  retryText: {
    color: arcadeColors.bgDeep,
    fontWeight: '700',
    fontSize: 10,
    fontFamily: arcadeFonts.pixel,
    letterSpacing: 0.3,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: arcadeColors.textMuted,
    fontSize: 14,
    fontFamily: arcadeFonts.body,
  },
});
