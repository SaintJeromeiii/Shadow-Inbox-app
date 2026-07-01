import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  createAutoPilotRule,
  fetchAutoPilotHistory,
  fetchAutoPilotRules,
  formatAutoPilotTimestamp,
  formatRulePlatform,
  toggleAutoPilotRule,
} from '../services/autoPilotService';
import type { AutoPilotHistoryEntry, AutoPilotRule } from '../types/autoPilot';
import { ArcadeComputerIcon, ArcadeHamburgerIcon, ArcadeRobotIcon } from '../components/ArcadeIcons';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface AutoPilotScreenProps {
  visible: boolean;
  onClose: () => void;
  variant?: 'modal' | 'screen';
  onOpenDrawer?: () => void;
}

export default function AutoPilotScreen({
  visible,
  onClose,
  variant = 'modal',
  onOpenDrawer,
}: AutoPilotScreenProps) {
  const [rules, setRules] = useState<AutoPilotRule[]>([]);
  const [history, setHistory] = useState<AutoPilotHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState<string | null>(null);
  const [creatingRule, setCreatingRule] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleCondition, setRuleCondition] = useState("contains word 'fixed'");
  const [ruleReplyText, setRuleReplyText] = useState('Thanks — marking this resolved.');
  const [rulePlatform, setRulePlatform] = useState('any');
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesResult, historyEntries] = await Promise.all([
        fetchAutoPilotRules(),
        fetchAutoPilotHistory(30),
      ]);
      setRules(rulesResult.rules);
      setHistory(historyEntries);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load auto-pilot settings from relay.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void loadData();
  }, [visible, loadData]);

  const handleCreateRule = async () => {
    if (!ruleName.trim() || !ruleCondition.trim()) {
      setError('Rule name and condition are required.');
      return;
    }

    setCreatingRule(true);
    setError(null);
    try {
      const created = await createAutoPilotRule({
        name: ruleName.trim(),
        platform: rulePlatform,
        condition: ruleCondition.trim(),
        action: 'reply',
        replyText: ruleReplyText.trim(),
        enabled: true,
      });
      setRules((prev) => [...prev, created]);
      setRuleName('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create rule.');
    } finally {
      setCreatingRule(false);
    }
  };

  const handleToggleRule = async (rule: AutoPilotRule, enabled: boolean) => {
    setTogglingRuleId(rule.id);
    try {
      const updated = await toggleAutoPilotRule(rule.id, enabled);
      setRules((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : 'Could not update rule.',
      );
    } finally {
      setTogglingRuleId(null);
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
            <ArcadeComputerIcon size={22} color={arcadeColors.neonCyan} />
            <View>
              <Text style={styles.title}>AUTO-PILOT</Text>
              <Text style={styles.subtitle}>Automated rules engine</Text>
            </View>
          </View>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={arcadeColors.neonCyan} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#5B8DEF" size="large" />
            <Text style={styles.loadingText}>Loading automation hub…</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.builderCard}>
              <Text style={styles.sectionTitle}>CREATE RULE</Text>
              <Text style={styles.sectionHint}>
                Example: If Slack message contains "fixed", auto-reply and archive.
              </Text>
              <TextInput
                style={styles.input}
                value={ruleName}
                onChangeText={setRuleName}
                placeholder="Rule name"
                placeholderTextColor={arcadeColors.textDim}
              />
              <TextInput
                style={styles.input}
                value={rulePlatform}
                onChangeText={setRulePlatform}
                placeholder="Platform: any, email, slack, discord"
                placeholderTextColor={arcadeColors.textDim}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={ruleCondition}
                onChangeText={setRuleCondition}
                placeholder="Condition"
                placeholderTextColor={arcadeColors.textDim}
              />
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={ruleReplyText}
                onChangeText={setRuleReplyText}
                placeholder="Auto-reply text"
                placeholderTextColor={arcadeColors.textDim}
                multiline
              />
              <Pressable
                style={[styles.createButton, creatingRule && styles.createButtonDisabled]}
                onPress={() => void handleCreateRule()}
                disabled={creatingRule}
              >
                <Text style={styles.createButtonText}>
                  {creatingRule ? 'CREATING…' : 'ADD RULE'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.sectionTitleRow}>
              <ArcadeRobotIcon size={16} color={arcadeColors.neonCyan} />
              <Text style={styles.sectionTitle}>AUTO-PILOT ACTIVE RULES</Text>
            </View>
            <Text style={styles.sectionHint}>
              Matched messages are replied to, tasks closed, and removed from your inbox automatically.
            </Text>

            <View style={styles.rulesList}>
              {rules.map((rule) => (
                <View key={rule.id} style={styles.ruleCard}>
                  <View style={styles.ruleTopRow}>
                    <View style={styles.ruleCopy}>
                      <Text style={styles.ruleName}>{rule.name}</Text>
                      <Text style={styles.rulePlatform}>{formatRulePlatform(rule.platform)}</Text>
                    </View>
                    <Switch
                      value={rule.enabled}
                      onValueChange={(value) => void handleToggleRule(rule, value)}
                      disabled={togglingRuleId === rule.id}
                      trackColor={{ false: '#2A3142', true: '#5B8DEF' }}
                      thumbColor={rule.enabled ? '#FFFFFF' : '#8B93A8'}
                    />
                  </View>
                  <Text style={styles.ruleCondition}>If {rule.condition}</Text>
                  {rule.action === 'reply' && rule.replyText ? (
                    <Text style={styles.ruleReply} numberOfLines={2}>
                      → "{rule.replyText}"
                    </Text>
                  ) : (
                    <Text style={styles.ruleReply}>→ Archive without reply</Text>
                  )}
                  {rule.autoCloseTask ? (
                    <Text style={styles.ruleMeta}>Auto-closes linked Kanban task</Text>
                  ) : null}
                </View>
              ))}
            </View>

            <Text style={[styles.sectionTitleStandalone, styles.historyTitle]}>
              LIVE AUTOMATION HISTORY
            </Text>
            <Text style={styles.sectionHint}>
              Rolling ledger of what Auto-Pilot handled today.
            </Text>

            {history.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryText}>
                  No automated actions yet. Matching pings will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.historyList}>
                {history.map((entry) => (
                  <View key={entry.id} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historySummary}>{entry.summary}</Text>
                      <Text style={styles.historyTime}>
                        {formatAutoPilotTimestamp(entry.timestamp)}
                      </Text>
                    </View>
                    <Text style={styles.historyMeta}>
                      Rule: {entry.ruleName} · {entry.platform}
                    </Text>
                    {entry.replyText ? (
                      <Text style={styles.historyReply} numberOfLines={2}>
                        Sent: "{entry.replyText}"
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
  );

  if (variant === 'screen') {
    if (!visible) return null;
    return content;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {content}
    </Modal>
  );
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
    color: arcadeColors.neonCyan,
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
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#6B7288',
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 36,
    gap: 10,
  },
  errorText: {
    color: '#FF8A8A',
    fontSize: 13,
    marginBottom: 8,
  },
  sectionTitleStandalone: {
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sectionTitle: {
    flex: 1,
    color: arcadeColors.neonPink,
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 0.3,
  },
  sectionHint: {
    color: '#6B7288',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  rulesList: {
    gap: 10,
  },
  ruleCard: {
    backgroundColor: '#121722',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A3550',
    padding: 14,
    gap: 6,
  },
  ruleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  ruleCopy: {
    flex: 1,
    gap: 2,
  },
  ruleName: {
    color: '#F4F6FB',
    fontSize: 15,
    fontWeight: '700',
  },
  rulePlatform: {
    color: '#9EB8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  ruleCondition: {
    color: '#A8B0C2',
    fontSize: 13,
  },
  ruleReply: {
    color: '#D0D5E0',
    fontSize: 13,
    fontStyle: 'italic',
  },
  ruleMeta: {
    color: '#6EE7A0',
    fontSize: 11,
    fontWeight: '600',
  },
  historyTitle: {
    marginTop: 18,
  },
  emptyHistory: {
    backgroundColor: '#10141D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232A38',
    padding: 16,
  },
  emptyHistoryText: {
    color: '#6B7288',
    fontSize: 13,
    lineHeight: 18,
  },
  historyList: {
    gap: 10,
  },
  historyCard: {
    backgroundColor: '#10141D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232A38',
    padding: 14,
    gap: 6,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  historySummary: {
    flex: 1,
    color: '#E8ECF5',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  historyTime: {
    color: '#6B7288',
    fontSize: 11,
  },
  historyMeta: {
    color: '#8B93A8',
    fontSize: 12,
  },
  historyReply: {
    color: '#9DB9F0',
    fontSize: 12,
    fontStyle: 'italic',
  },
  builderCard: {
    backgroundColor: '#10141D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2E3A52',
    padding: 14,
    gap: 8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2E3A52',
    borderRadius: 10,
    backgroundColor: '#0B0F17',
    color: '#E8ECF5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  createButton: {
    marginTop: 4,
    backgroundColor: arcadeColors.neonCyan,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: arcadeColors.bgDeep,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
