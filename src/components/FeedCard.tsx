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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { TriagedNotification } from '../types/notification';
import { SOURCE_COLORS, SOURCE_LABELS } from '../constants/sourceStyles';
import {
  formatShadowLabelName,
  SHADOW_LABEL_STYLES,
} from '../constants/shadowLabels';

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
  isRemoving?: boolean;
  actionBusy?: boolean;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function urgencyColor(score: number): string {
  if (score >= 8) return '#FF6B6B';
  if (score >= 5) return '#FFB347';
  return '#6BCB77';
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
  isRemoving = false,
  actionBusy = false,
}: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [sending, setSending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [localAction, setLocalAction] = useState<'archive' | 'trash' | null>(null);
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
  const isActionRequired = triage?.category === 'action_required';
  const isEmail = notification.sourceApp === 'Email';
  const busy = sending || actionBusy || localAction !== null;

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
          <View style={[styles.sourceTag, { backgroundColor: sourceColor }]}>
            <Ionicons name="mail-outline" size={12} color="#FFFFFF" />
            <Text style={styles.sourceTagText}>
              {SOURCE_LABELS[notification.sourceApp]}
            </Text>
          </View>
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
              <View style={styles.replyHeader}>
                <Ionicons name="create-outline" size={14} color="#5B8DEF" />
                <Text style={styles.replyLabel}>Your reply</Text>
              </View>
              <Text style={styles.replyHint}>
                Edit freely — your final text is what gets sent.
              </Text>
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
                editable={!sending}
                autoCorrect
                autoCapitalize="sentences"
                selectionColor="#5B8DEF"
                onPressIn={stopCardPress}
              />
              <View style={styles.actionRow}>
                <ActionButton
                  label="Copy"
                  icon="copy-outline"
                  onPress={(e) => {
                    stopCardPress(e);
                    void handleCopy();
                  }}
                  disabled={sending}
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.sendButton,
                    (sending || !draftText.trim()) && styles.actionButtonDisabled,
                    pressed && !sending && styles.buttonPressed,
                  ]}
                  onPress={(e) => {
                    stopCardPress(e);
                    void handleSend();
                  }}
                  disabled={sending || !draftText.trim()}
                >
                  {sending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="send" size={17} color="#FFFFFF" />
                      <Text style={styles.sendButtonText}>Send</Text>
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
    borderRadius: 8,
  },
  sourceTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
