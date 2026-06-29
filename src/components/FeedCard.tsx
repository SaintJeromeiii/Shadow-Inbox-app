import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Animated,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import type { TriagedNotification } from '../types/notification';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { SOURCE_COLORS, SOURCE_LABELS, SOURCE_PILL_EMOJI } from '../constants/sourceStyles';
import {
  formatShadowLabelName,
  SHADOW_LABEL_STYLES,
} from '../constants/shadowLabels';
import {
  DEFAULT_REPLY_TONE,
  REPLY_TONE_OPTIONS,
  type ReplyTone,
} from '../types/replyTone';
import { generateQuickReplies } from '../services/quickReplyService';
import {
  QUICK_REPLY_CHIP_LABELS,
  type QuickReplyChipKey,
  type QuickReplyOptions,
} from '../types/quickReply';
import { arcadeColors, arcadeFonts, arcadeTypography } from '../theme/arcadeTheme';
import { ArcadeArchiveIcon, ArcadeTrashIcon } from './ArcadeIcons';

interface FeedCardProps {
  notification: TriagedNotification;
  draftText: string;
  onDraftChange: (id: string, text: string) => void;
  onGmailArchive: (notification: TriagedNotification) => Promise<void>;
  onTrash: (notification: TriagedNotification) => Promise<void>;
  onSendReply: (
    notification: TriagedNotification,
    replyText: string,
  ) => Promise<void>;
  onRedraft: (
    notification: TriagedNotification,
    tone: ReplyTone,
    currentDraft: string,
  ) => Promise<string>;
  onVoiceCommand: (
    notification: TriagedNotification,
    audioUri: string,
    currentDraft: string,
  ) => Promise<string>;
  isRemoving?: boolean;
  actionBusy?: boolean;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCalendarPreviewTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function urgencyColor(score: number): string {
  if (score >= 8) return '#FF6B6B';
  if (score >= 5) return '#FFB347';
  return '#6BCB77';
}

function sourceIconName(
  source: TriagedNotification['sourceApp'],
): keyof typeof Ionicons.glyphMap {
  switch (source) {
    case 'Slack':
      return 'chatbubbles-outline';
    case 'Discord':
      return 'game-controller-outline';
    case 'SMS':
      return 'chatbox-outline';
    case 'WhatsApp':
      return 'logo-whatsapp';
    default:
      return 'mail-outline';
  }
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled,
  variant = 'secondary',
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: (event?: { stopPropagation?: () => void }) => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionButton,
        isPrimary && styles.sendButton,
        isGhost && styles.archiveButton,
        !isPrimary && !isGhost && styles.copyButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons
        name={icon}
        size={17}
        color={isPrimary ? '#FFFFFF' : isGhost ? '#8B93A8' : '#D0D5E0'}
      />
      <Text
        style={[
          styles.actionButtonText,
          isPrimary && styles.sendButtonText,
          isGhost && styles.archiveButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function FeedCard({
  notification,
  draftText,
  onDraftChange,
  onGmailArchive,
  onTrash,
  onSendReply,
  onRedraft,
  onVoiceCommand,
  isRemoving = false,
  actionBusy = false,
}: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [redrafting, setRedrafting] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [selectedTone, setSelectedTone] = useState<ReplyTone>(DEFAULT_REPLY_TONE);
  const [isEditing, setIsEditing] = useState(false);
  const [localAction, setLocalAction] = useState<'archive' | 'trash' | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReplyOptions | null>(null);
  const [loadingQuickReplies, setLoadingQuickReplies] = useState(false);
  const [quickReplyModalVisible, setQuickReplyModalVisible] = useState(false);
  const [quickReplyModalText, setQuickReplyModalText] = useState('');
  const [quickReplyChipKey, setQuickReplyChipKey] = useState<QuickReplyChipKey | null>(
    null,
  );
  const [quickReplySending, setQuickReplySending] = useState(false);
  const {
    isRecording,
    pulseAnim,
    startRecording,
    stopRecording,
  } = useVoiceRecording();
  const replyInputRef = useRef<TextInput>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const triage = notification.triage;
  const shadowLabels =
    notification.shadowLabels && notification.shadowLabels.length > 0
      ? notification.shadowLabels
      : triage?.category
        ? [
            {
              key: triage.category,
              name:
                triage.category === 'action_required'
                  ? 'Shadow/Action-Required'
                  : triage.category === 'fyi'
                    ? 'Shadow/FYI'
                    : 'Shadow/Newsletter',
            },
          ]
        : [];
  const sourceColor = SOURCE_COLORS[notification.sourceApp];
  const sendActionLabel =
    notification.sourceApp === 'Slack'
      ? 'Send to Slack'
      : notification.sourceApp === 'Discord'
        ? 'Send to Discord'
        : 'Approve & Send';
  const isActionRequired = triage?.category === 'action_required';
  const isEmail = notification.sourceApp === 'Email';
  const attachmentLabels = notification.attachmentScan?.labels ?? [];
  const remembersPastThread = notification.memoryContext?.injected === true;
  const calendarGuard = notification.calendarGuard;
  const showCalendarGuard =
    calendarGuard?.checked === true && Boolean(calendarGuard.proposedWindow);
  const busy =
    sending ||
    redrafting ||
    voiceProcessing ||
    isRecording ||
    actionBusy ||
    localAction !== null;

  useEffect(() => {
    if (!isRemoving) {
      fadeAnim.setValue(1);
      return;
    }

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, isRemoving]);

  useEffect(() => {
    if (!expanded || !isActionRequired) {
      return;
    }

    let cancelled = false;
    setLoadingQuickReplies(true);

    void generateQuickReplies({ messageId: notification.id })
      .then((result) => {
        if (cancelled) return;
        setQuickReplies(result.options);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn('[FeedCard] Quick replies failed:', error);
        setQuickReplies(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingQuickReplies(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [expanded, isActionRequired, notification.id]);

  const handleQuickReplyChipPress = (key: QuickReplyChipKey, text: string) => {
    stopCardPress();
    setQuickReplyChipKey(key);
    setQuickReplyModalText(text);
    setQuickReplyModalVisible(true);
  };

  const handleQuickReplyModalSend = async () => {
    const finalReply = quickReplyModalText.trim();
    if (!finalReply || quickReplySending) return;

    Keyboard.dismiss();
    setQuickReplySending(true);
    try {
      await onSendReply(notification, finalReply);
      setQuickReplyModalVisible(false);
      setQuickReplyModalText('');
      setQuickReplyChipKey(null);
    } finally {
      setQuickReplySending(false);
    }
  };

  const handleCopy = async () => {
    if (!draftText.trim()) return;
    await Clipboard.setStringAsync(draftText.trim());
    Alert.alert('Copied', 'Your edited reply was copied to clipboard.');
  };

  const handleToneSelect = async (tone: ReplyTone) => {
    if (tone === selectedTone || redrafting || sending) return;

    const previousTone = selectedTone;
    stopCardPress();
    setSelectedTone(tone);
    setRedrafting(true);

    try {
      const nextDraft = await onRedraft(notification, tone, draftText);
      onDraftChange(notification.id, nextDraft);
    } catch (error) {
      setSelectedTone(previousTone);
      Alert.alert(
        'Redraft Failed',
        error instanceof Error
          ? error.message
          : 'Could not rewrite the draft. Is the email relay running?',
      );
    } finally {
      setRedrafting(false);
    }
  };

  const handleMicPress = async () => {
    if (voiceProcessing || redrafting || sending) return;

    stopCardPress();

    if (!isRecording) {
      if (!draftText.trim()) {
        Alert.alert('Voice Command', 'Add or generate a draft before recording a voice command.');
        return;
      }

      try {
        await startRecording();
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        Alert.alert(
          'Microphone',
          error instanceof Error
            ? error.message
            : 'Could not start recording.',
        );
      }
      return;
    }

    setVoiceProcessing(true);

    try {
      const audioUri = await stopRecording();
      if (!audioUri) {
        throw new Error('No audio was captured. Try recording again.');
      }

      const nextDraft = await onVoiceCommand(notification, audioUri, draftText);
      onDraftChange(notification.id, nextDraft);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Voice Command Failed',
        error instanceof Error
          ? error.message
          : 'Could not process your voice command.',
      );
    } finally {
      setVoiceProcessing(false);
    }
  };

  const handleSend = async () => {
    const finalReply = draftText.trim();
    if (!finalReply || sending) return;

    Keyboard.dismiss();
    setSending(true);
    try {
      await onSendReply(notification, finalReply);
    } finally {
      setSending(false);
    }
  };

  const handleQuickArchive = async () => {
    if (busy) return;
    setLocalAction('archive');
    try {
      await onGmailArchive(notification);
    } finally {
      setLocalAction(null);
    }
  };

  const handleQuickTrash = async () => {
    if (busy) return;
    setLocalAction('trash');
    try {
      await onTrash(notification);
    } finally {
      setLocalAction(null);
    }
  };

  const stopCardPress = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
  };

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
    <Pressable
      onPress={() => {
        if (!isEditing) {
          setExpanded((prev) => !prev);
        }
      }}
      style={({ pressed }) => [
        styles.card,
        pressed && !isEditing && styles.cardPressed,
        expanded && styles.cardExpanded,
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.cardTopLeft}>
          <View
            style={[
              styles.sourceTag,
              { backgroundColor: sourceColor },
              notification.sourceApp === 'Slack' && styles.sourceTagSlack,
              notification.sourceApp === 'Discord' && styles.sourceTagDiscord,
            ]}
          >
            <Text style={styles.sourceTagEmoji}>
              {SOURCE_PILL_EMOJI[notification.sourceApp]}
            </Text>
            <Ionicons
              name={sourceIconName(notification.sourceApp)}
              size={12}
              color="#FFFFFF"
            />
            <Text style={styles.sourceTagText}>
              {SOURCE_LABELS[notification.sourceApp]}
            </Text>
          </View>
          {notification.channelName ? (
            <Text style={styles.channelContext} numberOfLines={1}>
              {notification.channelName}
            </Text>
          ) : null}
          {shadowLabels.length > 0 && (
            <View style={styles.labelRow}>
              {shadowLabels.map((label) => {
                const style =
                  SHADOW_LABEL_STYLES[label.key] ?? SHADOW_LABEL_STYLES.fyi;
                return (
                  <View
                    key={`${notification.id}-${label.key}`}
                    style={[
                      styles.shadowLabelPill,
                      {
                        backgroundColor: style.backgroundColor,
                        borderColor: style.borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.shadowLabelText, { color: style.textColor }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {formatShadowLabelName(label.name)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          {attachmentLabels.length > 0 && (
            <View style={styles.attachmentRow}>
              {attachmentLabels.map((label) => (
                <View key={`${notification.id}-${label}`} style={styles.attachmentPill}>
                  <Text style={styles.attachmentPillText}>
                    {label === 'Image Attached' ? '📎 Image Attached' : '📄 PDF Scanned'}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {remembersPastThread && (
            <View style={styles.memoryPill}>
              <Text style={styles.memoryPillText}>🧠 Remembers past thread</Text>
            </View>
          )}
        </View>
        {triage && (
          <View style={styles.urgencyWrap}>
            <Ionicons
              name="flash-outline"
              size={12}
              color={urgencyColor(triage.urgencyScore)}
            />
            <View
              style={[
                styles.urgencyBadge,
                { borderColor: urgencyColor(triage.urgencyScore) },
              ]}
            >
              <Text
                style={[
                  styles.urgencyText,
                  { color: urgencyColor(triage.urgencyScore) },
                ]}
              >
                {triage.urgencyScore}
              </Text>
            </View>
          </View>
        )}
      </View>

      <Text style={styles.sender} numberOfLines={1}>
        {notification.sender}
      </Text>

      <Text style={styles.summary}>
        {triage?.cleanSummary ?? 'Awaiting triage…'}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={12} color="#5C6478" />
        <Text style={styles.timestamp}>{formatTimestamp(notification.timestamp)}</Text>
      </View>

      {isEmail && (
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionButton,
              pressed && !busy && styles.quickActionPressed,
              busy && styles.quickActionDisabled,
            ]}
            onPress={(e) => {
              stopCardPress(e);
              void handleQuickArchive();
            }}
            disabled={busy}
            accessibilityLabel="Archive email"
          >
            {localAction === 'archive' ? (
              <ActivityIndicator size="small" color={arcadeColors.neonCyan} />
            ) : (
              <ArcadeArchiveIcon size={18} color={arcadeColors.textMuted} />
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionButton,
              styles.quickActionDanger,
              pressed && !busy && styles.quickActionPressed,
              busy && styles.quickActionDisabled,
            ]}
            onPress={(e) => {
              stopCardPress(e);
              void handleQuickTrash();
            }}
            disabled={busy}
            accessibilityLabel="Trash email"
          >
            {localAction === 'trash' ? (
              <ActivityIndicator size="small" color={arcadeColors.neonRed} />
            ) : (
              <ArcadeTrashIcon size={18} color={arcadeColors.neonRed} />
            )}
          </Pressable>
        </View>
      )}

      {expanded && (
        <View style={styles.expandedSection}>
          <Text style={styles.expandedLabel}>Raw message</Text>
          <View style={styles.rawTextContainer}>
            <Text style={styles.rawText}>{notification.rawText}</Text>
          </View>

          {isActionRequired && (
            <View style={styles.quickReplySection}>
              <View style={styles.quickReplyHeader}>
                <Ionicons name="sparkles-outline" size={14} color="#9B7BFF" />
                <Text style={styles.quickReplyTitle}>AI Reply Assistant</Text>
              </View>
              {loadingQuickReplies ? (
                <View style={styles.quickReplyLoading}>
                  <ActivityIndicator color="#9B7BFF" size="small" />
                  <Text style={styles.quickReplyLoadingText}>Generating options…</Text>
                </View>
              ) : quickReplies ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickReplyChipRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {(Object.keys(QUICK_REPLY_CHIP_LABELS) as QuickReplyChipKey[]).map(
                    (key) => (
                      <Pressable
                        key={key}
                        style={({ pressed }) => [
                          styles.quickReplyChip,
                          pressed && !busy && styles.quickReplyChipPressed,
                          busy && styles.quickReplyChipDisabled,
                        ]}
                        onPress={(e) => {
                          stopCardPress(e);
                          handleQuickReplyChipPress(key, quickReplies[key]);
                        }}
                        disabled={busy}
                      >
                        <Text style={styles.quickReplyChipText}>
                          {QUICK_REPLY_CHIP_LABELS[key]}
                        </Text>
                      </Pressable>
                    ),
                  )}
                </ScrollView>
              ) : (
                <Text style={styles.quickReplyEmpty}>
                  Could not load AI suggestions. Use the draft box below.
                </Text>
              )}
            </View>
          )}

          {isActionRequired && (
            <Pressable
              style={styles.replyBlock}
              onPress={stopCardPress}
              onPressIn={stopCardPress}
            >
              {showCalendarGuard && (
                <View style={styles.calendarGuardSection}>
                  <View
                    style={[
                      styles.calendarGuardBadge,
                      calendarGuard?.status === 'clear' && styles.calendarGuardBadgeClear,
                      calendarGuard?.status === 'conflict' && styles.calendarGuardBadgeConflict,
                      calendarGuard?.status === 'unavailable' &&
                        styles.calendarGuardBadgeUnavailable,
                    ]}
                  >
                    <Text style={styles.calendarGuardBadgeText}>
                      {calendarGuard?.status === 'clear'
                        ? `🟢 ${calendarGuard.badgeMessage || `Calendar Clear: ${calendarGuard.proposedWindow?.label} is open`}`
                        : calendarGuard?.status === 'conflict'
                          ? `⚠️ ${calendarGuard.badgeMessage || `Schedule Conflict: Overlaps with ${calendarGuard.conflictEvent?.title || 'another event'}`}`
                          : `📅 ${calendarGuard?.badgeMessage || `Scheduling: ${calendarGuard?.proposedWindow?.label}`}`}
                    </Text>
                  </View>

                  {(calendarGuard?.surroundingEvents?.length ?? 0) > 0 && (
                    <View style={styles.calendarPreviewStrip}>
                      <Text style={styles.calendarPreviewTitle}>Nearby on your calendar</Text>
                      {calendarGuard?.surroundingEvents?.map((event) => (
                        <View
                          key={`${notification.id}-${event.title}-${event.start}`}
                          style={styles.calendarPreviewRow}
                        >
                          <View style={styles.calendarPreviewDot} />
                          <View style={styles.calendarPreviewCopy}>
                            <Text style={styles.calendarPreviewEvent} numberOfLines={1}>
                              {event.title}
                            </Text>
                            <Text style={styles.calendarPreviewTime}>
                              {formatCalendarPreviewTime(event.start)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {calendarGuard?.status === 'conflict' &&
                    (calendarGuard.alternativeSlots?.length ?? 0) > 0 && (
                      <View style={styles.calendarAltSlots}>
                        <Text style={styles.calendarAltSlotsTitle}>Open alternatives</Text>
                        {calendarGuard.alternativeSlots?.slice(0, 2).map((slot) => (
                          <Text
                            key={`${notification.id}-${slot.start}`}
                            style={styles.calendarAltSlotText}
                          >
                            • {slot.label}
                          </Text>
                        ))}
                      </View>
                    )}
                </View>
              )}

              <View style={styles.replyHeader}>
                <Ionicons name="create-outline" size={14} color="#5B8DEF" />
                <Text style={styles.replyLabel}>Your reply</Text>
              </View>
              <Text style={styles.replyHint}>
                Edit freely — your final text is what gets sent.
              </Text>
              <View style={styles.replyInputWrap}>
                <TextInput
                  ref={replyInputRef}
                  style={styles.replyInput}
                  value={draftText}
                  onChangeText={(text) => onDraftChange(notification.id, text)}
                  onFocus={() => {
                    setIsEditing(true);
                    setExpanded(true);
                  }}
                  onBlur={() => setIsEditing(false)}
                  multiline
                  scrollEnabled
                  textAlignVertical="top"
                  placeholder="Draft or edit your reply here…"
                  placeholderTextColor="#5C6478"
                  editable={!sending && !redrafting && !voiceProcessing && !isRecording}
                  autoCorrect
                  autoCapitalize="sentences"
                  selectionColor="#5B8DEF"
                  onPressIn={stopCardPress}
                />
                {(redrafting || voiceProcessing || isRecording) && (
                  <View style={styles.redraftOverlay}>
                    <ActivityIndicator color="#5B8DEF" size="small" />
                    <Text style={styles.redraftOverlayText}>
                      {isRecording
                        ? 'Listening…'
                        : voiceProcessing
                          ? 'Processing voice…'
                          : 'Rewriting…'}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.toneRow}>
                <View style={styles.toneHeaderRow}>
                  <Text style={styles.toneLabel}>Tone</Text>
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.micButton,
                        isRecording && styles.micButtonActive,
                        (busy && !isRecording) && styles.micButtonDisabled,
                        pressed && !busy && styles.micButtonPressed,
                      ]}
                      onPress={(e) => {
                        stopCardPress(e);
                        void handleMicPress();
                      }}
                      disabled={busy && !isRecording}
                      accessibilityLabel={
                        isRecording ? 'Stop voice recording' : 'Record voice command'
                      }
                    >
                      <Ionicons
                        name={isRecording ? 'stop' : 'mic'}
                        size={16}
                        color={isRecording ? '#0D0F14' : '#C7D8FF'}
                      />
                    </Pressable>
                  </Animated.View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.toneChipRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {REPLY_TONE_OPTIONS.map((option) => {
                    const isActive = selectedTone === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        style={({ pressed }) => [
                          styles.toneChip,
                          isActive && styles.toneChipActive,
                          pressed && !busy && styles.toneChipPressed,
                          busy && styles.toneChipDisabled,
                        ]}
                        onPress={(e) => {
                          stopCardPress(e);
                          void handleToneSelect(option.key);
                        }}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text
                          style={[
                            styles.toneChipText,
                            isActive && styles.toneChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={styles.actionRow}>
                <ActionButton
                  label="Copy"
                  icon="copy-outline"
                  onPress={(e) => {
                    stopCardPress(e);
                    void handleCopy();
                  }}
                  disabled={sending || redrafting || voiceProcessing || isRecording}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.sendButton,
                    (sending ||
                      redrafting ||
                      voiceProcessing ||
                      isRecording ||
                      !draftText.trim()) &&
                      styles.actionButtonDisabled,
                    pressed &&
                      !sending &&
                      !redrafting &&
                      !voiceProcessing &&
                      !isRecording &&
                      styles.buttonPressed,
                  ]}
                  onPress={(e) => {
                    stopCardPress(e);
                    void handleSend();
                  }}
                  disabled={
                    sending ||
                    redrafting ||
                    voiceProcessing ||
                    isRecording ||
                    !draftText.trim()
                  }
                >
                  {sending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="send" size={17} color="#FFFFFF" />
                      <Text style={styles.sendButtonText}>{sendActionLabel}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>

      <Modal
        visible={quickReplyModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!quickReplySending) {
            setQuickReplyModalVisible(false);
          }
        }}
      >
        <Pressable
          style={styles.quickReplyModalBackdrop}
          onPress={() => {
            if (!quickReplySending) {
              setQuickReplyModalVisible(false);
            }
          }}
        >
          <Pressable style={styles.quickReplyModalSheet} onPress={stopCardPress}>
            <View style={styles.quickReplyModalHandle} />
            <Text style={styles.quickReplyModalTitle}>
              {quickReplyChipKey
                ? QUICK_REPLY_CHIP_LABELS[quickReplyChipKey]
                : 'Review Reply'}
            </Text>
            <Text style={styles.quickReplyModalHint}>
              Edit freely — your final text is what gets sent.
            </Text>
            <TextInput
              style={styles.quickReplyModalInput}
              value={quickReplyModalText}
              onChangeText={setQuickReplyModalText}
              multiline
              textAlignVertical="top"
              placeholder="Your reply…"
              placeholderTextColor="#5C6478"
              editable={!quickReplySending}
              autoFocus
              selectionColor="#9B7BFF"
            />
            <Pressable
              style={({ pressed }) => [
                styles.quickReplyModalSend,
                (!quickReplyModalText.trim() || quickReplySending) &&
                  styles.quickReplyModalSendDisabled,
                pressed &&
                  quickReplyModalText.trim() &&
                  !quickReplySending &&
                  styles.buttonPressed,
              ]}
              onPress={() => {
                void handleQuickReplyModalSend();
              }}
              disabled={!quickReplyModalText.trim() || quickReplySending}
            >
              {quickReplySending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="send" size={17} color="#FFFFFF" />
                  <Text style={styles.quickReplyModalSendText}>Send Reply</Text>
                </>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: arcadeColors.bgPanel,
    borderRadius: 8,
    padding: 18,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    shadowColor: arcadeColors.neonCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  cardExpanded: {
    borderColor: arcadeColors.borderPink,
    backgroundColor: arcadeColors.bgPanelElevated,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  cardTopLeft: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: '100%',
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attachmentPill: {
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.28)',
    backgroundColor: 'rgba(91, 141, 239, 0.08)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  attachmentPillText: {
    color: '#9DB9F0',
    fontSize: 11,
    fontWeight: '600',
  },
  memoryPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.28)',
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  memoryPillText: {
    color: '#C4B5FD',
    fontSize: 11,
    fontWeight: '600',
  },
  shadowLabelPill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
    flexShrink: 1,
  },
  shadowLabelText: {
    fontSize: 9,
    fontFamily: arcadeFonts.pixel,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  sourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sourceTagSlack: {
    shadowColor: '#E01E5A',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 2,
  },
  sourceTagDiscord: {
    shadowColor: '#5865F2',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 2,
  },
  sourceTagEmoji: {
    fontSize: 12,
  },
  sourceTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  channelContext: {
    color: '#8B93A8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    maxWidth: 220,
  },
  urgencyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  urgencyBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '800',
  },
  sender: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.neonPink,
    marginBottom: 8,
  },
  summary: {
    ...arcadeTypography.retroBodyBright,
    fontSize: 16,
    lineHeight: 23,
    color: arcadeColors.neonCyan,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  timestamp: {
    ...arcadeTypography.retroMeta,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  quickActionButton: {
    width: 36,
    height: 36,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgDeep,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
  },
  quickActionDanger: {
    borderColor: 'rgba(255, 68, 102, 0.55)',
    backgroundColor: 'rgba(255, 68, 102, 0.12)',
  },
  quickActionPressed: {
    opacity: 0.75,
  },
  quickActionDisabled: {
    opacity: 0.45,
  },
  expandedSection: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: arcadeColors.borderMuted,
  },
  expandedLabel: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.textDim,
    marginBottom: 10,
  },
  rawTextContainer: {
    backgroundColor: arcadeColors.bgDeep,
    borderRadius: 4,
    padding: 12,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
  },
  rawText: {
    ...arcadeTypography.retroBody,
    fontSize: 12,
    lineHeight: 19,
  },
  replyBlock: {
    marginTop: 16,
    backgroundColor: arcadeColors.bgDeep,
    borderRadius: 4,
    padding: 12,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    overflow: 'hidden',
  },
  calendarGuardSection: {
    marginBottom: 14,
    gap: 10,
  },
  calendarGuardBadge: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  calendarGuardBadgeClear: {
    backgroundColor: 'rgba(107, 203, 119, 0.12)',
    borderColor: 'rgba(107, 203, 119, 0.45)',
  },
  calendarGuardBadgeConflict: {
    backgroundColor: 'rgba(255, 179, 71, 0.12)',
    borderColor: 'rgba(255, 179, 71, 0.5)',
  },
  calendarGuardBadgeUnavailable: {
    backgroundColor: 'rgba(91, 141, 239, 0.1)',
    borderColor: 'rgba(91, 141, 239, 0.35)',
  },
  calendarGuardBadgeText: {
    color: '#E8ECF5',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  calendarPreviewStrip: {
    backgroundColor: '#171C28',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3142',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  calendarPreviewTitle: {
    color: '#8B93A8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  calendarPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarPreviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5B8DEF',
  },
  calendarPreviewCopy: {
    flex: 1,
    gap: 2,
  },
  calendarPreviewEvent: {
    color: '#D0D5E0',
    fontSize: 12,
    fontWeight: '600',
  },
  calendarPreviewTime: {
    color: '#6E768A',
    fontSize: 11,
  },
  calendarAltSlots: {
    paddingHorizontal: 2,
    gap: 4,
  },
  calendarAltSlotsTitle: {
    color: '#8B93A8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  calendarAltSlotText: {
    color: '#A8B0C2',
    fontSize: 11,
    lineHeight: 16,
  },
  quickReplySection: {
    marginTop: 14,
    marginBottom: 4,
    gap: 10,
    overflow: 'hidden',
  },
  quickReplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickReplyTitle: {
    color: '#9B7BFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  quickReplyLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  quickReplyLoadingText: {
    color: '#8B93A8',
    fontSize: 12,
  },
  quickReplyChipRow: {
    gap: 8,
    paddingRight: 4,
  },
  quickReplyChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#1E2230',
    borderWidth: 1,
    borderColor: '#4A3F7A',
  },
  quickReplyChipPressed: {
    backgroundColor: '#2A2540',
    borderColor: '#9B7BFF',
  },
  quickReplyChipDisabled: {
    opacity: 0.5,
  },
  quickReplyChipText: {
    color: '#D8CCFF',
    fontSize: 13,
    fontWeight: '600',
  },
  quickReplyEmpty: {
    color: '#6B7288',
    fontSize: 12,
    lineHeight: 18,
  },
  quickReplyModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  quickReplyModalSheet: {
    backgroundColor: '#141824',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: '#2A3142',
    gap: 12,
  },
  quickReplyModalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3D4558',
    marginBottom: 4,
  },
  quickReplyModalTitle: {
    color: '#E8ECF4',
    fontSize: 18,
    fontWeight: '700',
  },
  quickReplyModalHint: {
    color: '#6B7288',
    fontSize: 12,
  },
  quickReplyModalInput: {
    color: '#E8ECF4',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 140,
    maxHeight: 220,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#0D0F14',
    borderWidth: 1,
    borderColor: '#4A3F7A',
    borderRadius: 12,
  },
  quickReplyModalSend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#9B7BFF',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  quickReplyModalSendDisabled: {
    opacity: 0.45,
  },
  quickReplyModalSendText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  replyLabel: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.neonPink,
  },
  replyHint: {
    ...arcadeTypography.retroCaption,
    marginBottom: 12,
  },
  replyInputWrap: {
    position: 'relative',
  },
  replyInput: {
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.body,
    fontSize: 14,
    lineHeight: 22,
    minHeight: 108,
    maxHeight: 180,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: arcadeColors.bgDeep,
    borderWidth: 2,
    borderColor: arcadeColors.borderMuted,
    borderRadius: 8,
  },
  redraftOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 15, 20, 0.82)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  redraftOverlayText: {
    color: '#9AA3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  toneRow: {
    marginTop: 12,
    gap: 8,
  },
  toneHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toneLabel: {
    color: '#5C6478',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  toneChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  toneChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2E3548',
    backgroundColor: '#141824',
  },
  toneChipActive: {
    borderColor: 'rgba(91, 141, 239, 0.55)',
    backgroundColor: 'rgba(91, 141, 239, 0.12)',
  },
  toneChipPressed: {
    opacity: 0.8,
  },
  toneChipDisabled: {
    opacity: 0.5,
  },
  toneChipText: {
    color: '#8B93A8',
    fontSize: 11,
    fontWeight: '600',
  },
  toneChipTextActive: {
    color: '#8FB4FF',
  },
  micButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2030',
    borderWidth: 1,
    borderColor: 'rgba(91, 141, 239, 0.35)',
    shadowColor: '#5B8DEF',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  micButtonActive: {
    backgroundColor: '#FF6B6B',
    borderColor: '#FF8A8A',
    shadowColor: '#FF6B6B',
    shadowOpacity: 0.35,
  },
  micButtonDisabled: {
    opacity: 0.45,
  },
  micButtonPressed: {
    opacity: 0.85,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    minHeight: 42,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  copyButton: {
    backgroundColor: '#222938',
  },
  sendButton: {
    backgroundColor: '#5B8DEF',
  },
  archiveButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3D4455',
  },
  buttonPressed: {
    opacity: 0.78,
  },
  actionButtonText: {
    color: '#D0D5E0',
    fontSize: 12,
    fontWeight: '700',
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  archiveButtonText: {
    color: '#8B93A8',
    fontSize: 12,
    fontWeight: '700',
  },
});
