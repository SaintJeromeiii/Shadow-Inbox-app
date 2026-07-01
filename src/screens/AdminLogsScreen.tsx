import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccount } from '../context/AccountContext';
import {
  AUTOMATION_LOG_FILTERS,
  fetchAutomationLogs,
  formatAutomationEventType,
  formatAutomationLogTimestamp,
  getStatusBadgeColor,
  replayAutomationLog,
} from '../services/adminLogsService';
import type { AutomationLog, AutomationLogStatusFilter } from '../types/automationLog';
import { ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface AdminLogsScreenProps {
  visible: boolean;
  onClose: () => void;
  variant?: 'modal' | 'screen';
  onOpenDrawer?: () => void;
}

function formatJsonBlock(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function LogCard({
  log,
  expanded,
  onToggle,
  onReplay,
  replaying,
}: {
  log: AutomationLog;
  expanded: boolean;
  onToggle: () => void;
  onReplay: () => void;
  replaying: boolean;
}) {
  const badgeColor = getStatusBadgeColor(log.status);

  return (
    <Pressable
      style={[styles.logCard, expanded && styles.logCardExpanded]}
      onPress={onToggle}
    >
      <View style={styles.logHeader}>
        <View style={styles.logHeaderCopy}>
          <Text style={styles.eventType}>{formatAutomationEventType(log.eventType)}</Text>
          <Text style={styles.messageId} numberOfLines={1}>
            {log.messageId}
          </Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: badgeColor, backgroundColor: `${badgeColor}22` }]}>
          <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
            {log.status.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.logMetaRow}>
        <Text style={styles.metaText}>Retries: {log.retryCount}</Text>
        <Text style={styles.metaText}>{formatAutomationLogTimestamp(log.updatedAt)}</Text>
      </View>

      {expanded ? (
        <View style={styles.expandedBlock}>
          {log.errorMessage ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>ERROR MESSAGE</Text>
              <Text style={styles.detailBody}>{log.errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>PAYLOAD</Text>
            <Text style={styles.codeBlock}>{formatJsonBlock(log.payload)}</Text>
          </View>

          {log.resultPayload ? (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>RESULT</Text>
              <Text style={styles.codeBlock}>{formatJsonBlock(log.resultPayload)}</Text>
            </View>
          ) : null}

          {(log.status === 'dead_letter' || log.status === 'failed') ? (
            <Pressable
              style={[styles.replayButton, replaying && styles.replayButtonDisabled]}
              onPress={(event) => {
                event.stopPropagation?.();
                onReplay();
              }}
              disabled={replaying}
            >
              {replaying ? (
                <ActivityIndicator color={arcadeColors.bgDeep} size="small" />
              ) : (
                <>
                  <Ionicons name="refresh" size={14} color={arcadeColors.bgDeep} />
                  <Text style={styles.replayButtonText}>REPLAY REQUEST</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.tapHint}>Tap to inspect payload</Text>
      )}
    </Pressable>
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
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AutomationLogStatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const loadLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await fetchAutomationLogs({
          accountKey: activeAccount,
          status: statusFilter,
          limit: 50,
          allAccounts: true,
        });
        setLogs(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load automation logs.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeAccount, statusFilter],
  );

  useEffect(() => {
    if (!visible) return;
    void loadLogs();
  }, [visible, loadLogs]);

  const handleReplay = async (log: AutomationLog) => {
    setReplayingId(log.id);
    setError(null);

    try {
      const result = await replayAutomationLog(log.id, activeAccount);
      setLogs((prev) => prev.map((item) => (item.id === log.id ? result.log : item)));
      Alert.alert(
        'Replay queued',
        result.replayed
          ? 'Outbound relay replay completed successfully.'
          : result.message ?? 'Log reset to pending.',
      );
    } catch (replayError) {
      const message =
        replayError instanceof Error ? replayError.message : 'Replay request failed.';
      setError(message);
      Alert.alert('Replay failed', message);
    } finally {
      setReplayingId(null);
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

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={arcadeColors.neonCyan} size="large" />
          <Text style={styles.loadingText}>Scanning automation ledger…</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
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
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>NO LOG ENTRIES</Text>
              <Text style={styles.emptyBody}>
                Webhook and relay events will appear here once automation traffic flows.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <LogCard
              log={item}
              expanded={expandedId === item.id}
              onToggle={() =>
                setExpandedId((current) => (current === item.id ? null : item.id))
              }
              onReplay={() => void handleReplay(item)}
              replaying={replayingId === item.id}
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
  errorText: {
    color: arcadeColors.danger,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 12,
    fontFamily: arcadeFonts.body,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: arcadeColors.textMuted,
    fontSize: 14,
    fontFamily: arcadeFonts.body,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  logCard: {
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  logCardExpanded: {
    borderColor: arcadeColors.borderCyan,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  logHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  eventType: {
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    letterSpacing: 0.3,
  },
  messageId: {
    color: arcadeColors.textDim,
    fontSize: 11,
    fontFamily: arcadeFonts.body,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    letterSpacing: 0.2,
  },
  logMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  metaText: {
    color: arcadeColors.textMuted,
    fontSize: 11,
    fontFamily: arcadeFonts.body,
  },
  tapHint: {
    color: arcadeColors.textDim,
    fontSize: 10,
    marginTop: 10,
    fontFamily: arcadeFonts.body,
  },
  expandedBlock: {
    marginTop: 12,
    gap: 12,
  },
  detailSection: {
    gap: 6,
  },
  detailLabel: {
    color: arcadeColors.neonPink,
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    letterSpacing: 0.3,
  },
  detailBody: {
    color: arcadeColors.danger,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: arcadeFonts.body,
  },
  codeBlock: {
    color: arcadeColors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: arcadeFonts.body,
    backgroundColor: arcadeColors.bgDeep,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 8,
    padding: 10,
  },
  replayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: arcadeColors.neonYellow,
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 4,
  },
  replayButtonDisabled: {
    opacity: 0.7,
  },
  replayButtonText: {
    color: arcadeColors.bgDeep,
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    letterSpacing: 0.3,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.pixel,
    fontSize: 9,
  },
  emptyBody: {
    color: arcadeColors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: arcadeFonts.body,
  },
});
