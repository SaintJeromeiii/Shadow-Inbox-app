import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MarkdownBriefing from './MarkdownBriefing';
import type { DailyBriefing } from '../types/briefing';

interface BriefingCardProps {
  briefing: DailyBriefing | null;
  loading: boolean;
  error: string | null;
  onDismiss: () => void;
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function BriefingCard({
  briefing,
  loading,
  error,
  onDismiss,
}: BriefingCardProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.wrapper}>
      <View style={styles.glowTop} />
      <View style={styles.card}>
        <Pressable
          style={styles.headerRow}
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <View style={styles.headerLeft}>
            <Text style={styles.emoji}>🌅</Text>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Your Smart Morning Briefing</Text>
              {briefing ? (
                <Text style={styles.meta}>
                  {briefing.stats.totalToday} emails today ·{' '}
                  {briefing.stats.actionRequired} priorities · updated{' '}
                  {formatGeneratedAt(briefing.generatedAt)}
                  {briefing.mode === 'fallback' ? ' · local summary' : ''}
                </Text>
              ) : (
                <Text style={styles.meta}>
                  {loading ? 'Generating executive summary…' : 'Pull to refresh'}
                </Text>
              )}
            </View>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#9EB8F0"
          />
        </Pressable>

        {expanded && (
          <View style={styles.body}>
            {loading && !briefing ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#8EB5FF" size="small" />
                <Text style={styles.loadingText}>Synthesizing your day…</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {briefing ? <MarkdownBriefing markdown={briefing.markdown} /> : null}

            {briefing?.warning ? (
              <Text style={styles.warningText}>{briefing.warning}</Text>
            ) : null}

            <View style={styles.footerRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.dismissButton,
                  pressed && styles.dismissButtonPressed,
                ]}
                onPress={onDismiss}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#9EB8F0" />
                <Text style={styles.dismissText}>Dismiss Briefing</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(142, 181, 255, 0.22)',
    backgroundColor: '#141B33',
  },
  glowTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(91, 141, 239, 0.14)',
  },
  card: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  emoji: {
    fontSize: 22,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#F4F7FF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  meta: {
    color: '#8FA3CC',
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(142, 181, 255, 0.12)',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  loadingText: {
    color: '#9EB8F0',
    fontSize: 13,
  },
  errorText: {
    color: '#FF8E8E',
    fontSize: 13,
    marginBottom: 10,
  },
  warningText: {
    color: '#FFB347',
    fontSize: 12,
    marginTop: 10,
    fontStyle: 'italic',
  },
  footerRow: {
    marginTop: 14,
    alignItems: 'flex-start',
  },
  dismissButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(142, 181, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(142, 181, 255, 0.16)',
  },
  dismissButtonPressed: {
    opacity: 0.8,
  },
  dismissText: {
    color: '#9EB8F0',
    fontSize: 13,
    fontWeight: '600',
  },
});
