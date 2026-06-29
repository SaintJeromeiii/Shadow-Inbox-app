import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { AccountKey } from '../types/account';
import type {
  CreateFirewallRuleInput,
  FirewallActionEffect,
  FirewallRule,
  FirewallRuleType,
} from '../types/firewall';
import {
  createFirewallRule,
  deleteFirewallRule,
  fetchFirewallRules,
  formatFirewallAction,
  formatFirewallRuleType,
} from '../services/firewallService';
import { ArcadeFirewallIcon, ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import { useRetroFeedback } from '../context/RetroFeedbackContext';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface FirewallSettingsProps {
  visible: boolean;
  accountKey: AccountKey;
  onClose: () => void;
  variant?: 'modal' | 'screen';
  onOpenDrawer?: () => void;
}

const RULE_TYPES: FirewallRuleType[] = ['sender', 'subject_keyword', 'app_source'];
const ACTION_EFFECTS: FirewallActionEffect[] = [
  'MUTED_ARCHIVE',
  'HIGH_PRIORITY_PUSH',
  'BLOCK_DROP',
];

export default function FirewallSettings({
  visible,
  accountKey,
  onClose,
  variant = 'modal',
  onOpenDrawer,
}: FirewallSettingsProps) {
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchValue, setMatchValue] = useState('');
  const [ruleType, setRuleType] = useState<FirewallRuleType>('sender');
  const [actionEffect, setActionEffect] =
    useState<FirewallActionEffect>('MUTED_ARCHIVE');
  const { showActionComplete, playDeleteSound } = useRetroFeedback();

  const loadRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFirewallRules(accountKey);
      setRules(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load firewall rules.',
      );
    } finally {
      setLoading(false);
    }
  }, [accountKey]);

  useEffect(() => {
    if (!visible) return;
    void loadRules();
  }, [visible, loadRules]);

  const handleCreateRule = async () => {
    const trimmed = matchValue.trim();
    if (!trimmed) {
      Alert.alert('Firewall', 'Enter a match value for this rule.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload: CreateFirewallRuleInput = {
        ruleType,
        matchValue: trimmed,
        actionEffect,
      };
      const created = await createFirewallRule(payload, accountKey);
      setRules((prev) => [created, ...prev]);
      setMatchValue('');
      showActionComplete('RULE SAVED!');
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Could not create firewall rule.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (rule: FirewallRule) => {
    setDeletingId(rule.id);
    setError(null);

    try {
      await deleteFirewallRule(rule.id, accountKey);
      setRules((prev) => prev.filter((item) => item.id !== rule.id));
      playDeleteSound();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete firewall rule.',
      );
    } finally {
      setDeletingId(null);
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
            <ArcadeFirewallIcon size={22} color={arcadeColors.neonPink} />
            <View>
              <Text style={styles.title}>FIREWALL</Text>
              <Text style={styles.subtitle}>Signal filter overrides</Text>
            </View>
          </View>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={22} color={arcadeColors.neonCyan} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Create Rule</Text>

            <Text style={styles.fieldLabel}>Rule Type</Text>
            <View style={styles.optionRow}>
              {RULE_TYPES.map((type) => {
                const selected = ruleType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.optionChip, selected && styles.optionChipSelected]}
                    onPress={() => setRuleType(type)}
                  >
                    <Text
                      style={[
                        styles.optionChipText,
                        selected && styles.optionChipTextSelected,
                      ]}
                    >
                      {formatFirewallRuleType(type)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Match Value</Text>
            <TextInput
              style={styles.input}
              value={matchValue}
              onChangeText={setMatchValue}
              placeholder="noreply@annoying.com, CRITICAL, AlphaRounds"
              placeholderTextColor="#5C6478"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>Action Effect</Text>
            <View style={styles.optionColumn}>
              {ACTION_EFFECTS.map((action) => {
                const selected = actionEffect === action;
                return (
                  <Pressable
                    key={action}
                    style={[styles.actionRow, selected && styles.actionRowSelected]}
                    onPress={() => setActionEffect(action)}
                  >
                    <Text
                      style={[
                        styles.actionRowText,
                        selected && styles.actionRowTextSelected,
                      ]}
                    >
                      {formatFirewallAction(action)}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={18} color="#8EB5FF" />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.createButton,
                (saving || !matchValue.trim()) && styles.createButtonDisabled,
                pressed && !saving && styles.createButtonPressed,
              ]}
              onPress={() => void handleCreateRule()}
              disabled={saving || !matchValue.trim()}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.createButtonText}>Add Firewall Rule</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Active Rules</Text>
              {loading ? <ActivityIndicator color="#8EB5FF" size="small" /> : null}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {!loading && rules.length === 0 ? (
              <Text style={styles.emptyText}>
                No firewall rules yet. Add a sender, keyword, or app-source filter above.
              </Text>
            ) : null}

            {rules.map((rule) => (
              <View key={rule.id} style={styles.ruleRow}>
                <View style={styles.ruleCopy}>
                  <Text style={styles.ruleTitle}>
                    {formatFirewallRuleType(rule.ruleType)} · {formatFirewallAction(rule.actionEffect)}
                  </Text>
                  <Text style={styles.ruleMatch} numberOfLines={2}>
                    {rule.matchValue}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && styles.deleteButtonPressed,
                  ]}
                  onPress={() => void handleDeleteRule(rule)}
                  disabled={deletingId === rule.id}
                  accessibilityLabel="Delete firewall rule"
                >
                  {deletingId === rule.id ? (
                    <ActivityIndicator color="#FCA5A5" size="small" />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color="#FCA5A5" />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
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
    fontSize: 11,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: arcadeColors.textMuted,
    fontSize: 12,
    fontFamily: arcadeFonts.body,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 1,
    borderColor: arcadeColors.borderCyan,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  formCard: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    backgroundColor: arcadeColors.bgPanel,
    padding: 14,
  },
  listCard: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    backgroundColor: arcadeColors.bgPanel,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    color: '#E8ECF5',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  fieldLabel: {
    color: '#8B93A8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2A3142',
    backgroundColor: '#141824',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  optionChipSelected: {
    borderColor: '#5B8DEF',
    backgroundColor: '#182033',
  },
  optionChipText: {
    color: '#9AA3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  optionChipTextSelected: {
    color: '#D7E6FF',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3142',
    backgroundColor: '#141824',
    color: '#F3F6FC',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionColumn: {
    gap: 8,
  },
  actionRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3142',
    backgroundColor: '#141824',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionRowSelected: {
    borderColor: '#5B8DEF',
    backgroundColor: '#182033',
  },
  actionRowText: {
    color: '#C7D0E0',
    fontSize: 13,
    fontWeight: '600',
  },
  actionRowTextSelected: {
    color: '#E8F1FF',
  },
  createButton: {
    marginTop: 14,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  createButtonDisabled: {
    opacity: 0.55,
  },
  createButtonPressed: {
    opacity: 0.88,
  },
  createButtonText: {
    color: arcadeColors.neonPink,
    fontFamily: arcadeFonts.pixel,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
  },
  emptyText: {
    color: '#6B7288',
    fontSize: 12,
    lineHeight: 18,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232A38',
    backgroundColor: '#141824',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ruleCopy: {
    flex: 1,
  },
  ruleTitle: {
    color: '#E8ECF5',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  ruleMatch: {
    color: '#8B93A8',
    fontSize: 12,
  },
  deleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#24161A',
  },
  deleteButtonPressed: {
    opacity: 0.85,
  },
});
