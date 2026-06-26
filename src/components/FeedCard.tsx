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
                    <Text style={[styles.shadowLabelText, { color: style.textColor }]}>
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
              <ActivityIndicator size="small" color="#8B93A8" />
            ) : (
              <Ionicons name="archive-outline" size={18} color="#8B93A8" />
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
              <ActivityIndicator size="small" color="#FF8A8A" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#FF8A8A" />
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141824',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#232A38',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  cardExpanded: {
    borderColor: '#3D4F6F',
    backgroundColor: '#161B27',
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
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  shadowLabelText: {
    fontSize: 11,
    fontWeight: '700',
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
    color: '#8B93A8',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  summary: {
    color: '#F4F6FB',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  timestamp: {
    color: '#5C6478',
    fontSize: 12,
    fontWeight: '500',
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
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2030',
    borderWidth: 1,
    borderColor: '#2E3548',
  },
  quickActionDanger: {
    borderColor: 'rgba(255, 107, 107, 0.25)',
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
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
    borderTopColor: '#2A3142',
  },
  expandedLabel: {
    color: '#6B7288',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 10,
  },
  rawTextContainer: {
    backgroundColor: '#0D0F14',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#232A38',
  },
  rawText: {
    color: '#B8BECF',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  replyBlock: {
    marginTop: 16,
    backgroundColor: '#10141D',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A3550',
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
  replyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  replyLabel: {
    color: '#5B8DEF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  replyHint: {
    color: '#6B7288',
    fontSize: 12,
    marginBottom: 12,
  },
  replyInputWrap: {
    position: 'relative',
  },
  replyInput: {
    color: '#E8ECF4',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 108,
    maxHeight: 180,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#0D0F14',
    borderWidth: 1,
    borderColor: '#3D4F6F',
    borderRadius: 10,
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
