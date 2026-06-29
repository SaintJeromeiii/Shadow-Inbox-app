import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchKnowledgeBase,
  formatKnowledgeTimestamp,
  updateKnowledgeBase,
  type KnowledgeMemory,
} from '../services/knowledgeAdminService';
import { ArcadeCassetteIcon, ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import { useRetroFeedback } from '../context/RetroFeedbackContext';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

interface KnowledgeScreenProps {
  visible: boolean;
  onClose: () => void;
  variant?: 'modal' | 'screen';
  onOpenDrawer?: () => void;
}

export default function KnowledgeScreen({
  visible,
  onClose,
  variant = 'modal',
  onOpenDrawer,
}: KnowledgeScreenProps) {
  const [snippet, setSnippet] = useState('');
  const [memories, setMemories] = useState<KnowledgeMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const successScale = useRef(new Animated.Value(0.8)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const { showActionComplete } = useRetroFeedback();

  const loadMemories = async () => {
    setLoading(true);
    setError(null);
    try {
      const knowledge = await fetchKnowledgeBase();
      setMemories(knowledge.recentMemories);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load knowledge base from relay.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    void loadMemories();
  }, [visible]);

  const playSuccessAnimation = () => {
    setSuccessVisible(true);
    showActionComplete('MEMORY UPDATED!');
    successScale.setValue(0.8);
    successOpacity.setValue(0);

    Animated.parallel([
      Animated.spring(successScale, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }).start(() => setSuccessVisible(false));
      }, 1400);
    });
  };

  const handleUpdateBrain = async () => {
    const nextSnippet = snippet.trim();
    if (!nextSnippet || saving) return;

    setSaving(true);
    setError(null);

    try {
      const knowledge = await updateKnowledgeBase(nextSnippet);
      setMemories(knowledge.recentMemories);
      setSnippet('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSuccessAnimation();
    } catch (updateError) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Could not update knowledge base.',
      );
    } finally {
      setSaving(false);
    }
  };

  const content = (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            {variant === 'screen' && onOpenDrawer ? (
              <Pressable style={styles.menuButton} onPress={onOpenDrawer}>
                <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
              </Pressable>
            ) : null}
            <View style={styles.headerCopy}>
              <ArcadeCassetteIcon size={22} color={arcadeColors.neonCyan} />
              <View>
                <Text style={styles.title}>DATA CORE</Text>
                <Text style={styles.subtitle}>
                  Teach Shadow Inbox live — no restart required.
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={arcadeColors.neonCyan} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>New core memory</Text>
              <TextInput
                style={styles.input}
                value={snippet}
                onChangeText={setSnippet}
                placeholder="Add new project rules, app updates, or tester notes here..."
                placeholderTextColor="#5C6478"
                multiline
                textAlignVertical="top"
                editable={!saving}
              />
              <Pressable
                style={({ pressed }) => [
                  styles.updateButton,
                  (!snippet.trim() || saving) && styles.updateButtonDisabled,
                  pressed && snippet.trim() && !saving && styles.updateButtonPressed,
                ]}
                onPress={() => void handleUpdateBrain()}
                disabled={!snippet.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#0D0F14" size="small" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={16} color="#0D0F14" />
                    <Text style={styles.updateButtonText}>Update Brain</Text>
                  </>
                )}
              </Pressable>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.memoriesSection}>
              <View style={styles.memoriesHeader}>
                <Text style={styles.memoriesTitle}>Recent Core Memories</Text>
                {loading ? <ActivityIndicator color="#8EB5FF" size="small" /> : null}
              </View>

              {memories.length === 0 && !loading ? (
                <Text style={styles.emptyText}>
                  No live updates yet. Add your first note above.
                </Text>
              ) : null}

              {memories.map((memory) => (
                <View key={memory.id} style={styles.memoryCard}>
                  <Text style={styles.memoryTime}>
                    {formatKnowledgeTimestamp(memory.timestamp)}
                  </Text>
                  <Text style={styles.memoryText}>{memory.text}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {successVisible ? (
            <Animated.View
              style={[
                styles.successToast,
                {
                  opacity: successOpacity,
                  transform: [{ scale: successScale }],
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={20} color="#6EE7A0" />
              <Text style={styles.successText}>Brain Updated Successfully.</Text>
            </Animated.View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
  );

  if (variant === 'screen') {
    if (!visible) return null;
    return content;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: arcadeColors.bgDeep,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#232A38',
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
  headerCopy: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    paddingRight: 12,
  },
  emoji: {
    fontSize: 28,
    marginTop: 2,
  },
  title: {
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#7D89A8',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161B27',
    borderWidth: 1,
    borderColor: '#2A3142',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 18,
  },
  inputCard: {
    backgroundColor: '#121722',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A3550',
    padding: 16,
    gap: 12,
  },
  inputLabel: {
    color: '#8B93A8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 140,
    maxHeight: 220,
    color: '#E8ECF4',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0D1018',
    borderWidth: 1,
    borderColor: '#2E3548',
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8EB5FF',
    borderRadius: 12,
    paddingVertical: 13,
  },
  updateButtonDisabled: {
    opacity: 0.45,
  },
  updateButtonPressed: {
    opacity: 0.85,
  },
  updateButtonText: {
    color: '#0D0F14',
    fontSize: 14,
    fontWeight: '800',
  },
  errorText: {
    color: '#FF8A8A',
    fontSize: 13,
    lineHeight: 18,
  },
  memoriesSection: {
    gap: 10,
  },
  memoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memoriesTitle: {
    color: '#D0D5E0',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#6B7288',
    fontSize: 13,
    lineHeight: 19,
  },
  memoryCard: {
    backgroundColor: '#10141D',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#232A38',
    padding: 14,
    gap: 8,
  },
  memoryTime: {
    color: '#7D89A8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  memoryText: {
    color: '#D9DEE8',
    fontSize: 14,
    lineHeight: 21,
  },
  successToast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#141B28',
    borderWidth: 1,
    borderColor: 'rgba(110, 231, 160, 0.35)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  successText: {
    color: '#E8FFF1',
    fontSize: 14,
    fontWeight: '700',
  },
});
