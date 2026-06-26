import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import type { FinanceSummary } from '../types/finance';
import { formatUsd } from '../services/financeService';

const SCREEN_WIDTH = Dimensions.get('window').width;
const METRIC_PAGE_WIDTH = SCREEN_WIDTH - 64;

interface FinanceRunwayStripProps {
  summary: FinanceSummary | null;
  loading: boolean;
}

interface MetricChip {
  key: string;
  label: string;
  value: number;
  accent: string;
  caption: string;
}

function formatShortDate(dateString: string): string {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function FinanceRunwayStrip({
  summary,
  loading,
}: FinanceRunwayStripProps) {
  const [activeMetricIndex, setActiveMetricIndex] = useState(0);

  const metrics = useMemo<MetricChip[]>(() => {
    const byProject = summary?.byProject ?? {
      AlphaRounds: 0,
      DealShield: 0,
      ServiceLog: 0,
      General: 0,
    };

    return [
      {
        key: 'total',
        label: 'Total Dev Cost',
        value: summary?.totalMonthToDate ?? 0,
        accent: '#5B8DEF',
        caption: 'Month-to-date operational spend',
      },
      {
        key: 'alpharounds',
        label: 'AlphaRounds Overhead',
        value: byProject.AlphaRounds,
        accent: '#C084FC',
        caption: 'MTD run rate for AlphaRounds',
      },
      {
        key: 'dealshield',
        label: 'DealShield Infrastructure',
        value: byProject.DealShield,
        accent: '#6EE7A0',
        caption: 'MTD infrastructure for DealShield',
      },
    ];
  }, [summary]);

  const transactions = summary?.transactions ?? [];

  const handleMetricScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / METRIC_PAGE_WIDTH);
    setActiveMetricIndex(index);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.glow} />
      <View style={styles.panel}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>📊 Project Runway & Finances</Text>
          {loading ? <ActivityIndicator color="#8EB5FF" size="small" /> : null}
        </View>

        <ScrollView
          horizontal
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={METRIC_PAGE_WIDTH}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleMetricScrollEnd}
          contentContainerStyle={styles.metricPager}
        >
          {metrics.map((metric) => (
            <View key={metric.key} style={styles.metricPage}>
              <View style={[styles.metricChip, { borderColor: metric.accent }]}>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                <Text style={[styles.metricValue, { color: metric.accent }]}>
                  {formatUsd(metric.value)}
                </Text>
                <Text style={styles.metricCaption}>{metric.caption}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {metrics.length > 1 ? (
          <View style={styles.dotsRow}>
            {metrics.map((metric, index) => (
              <View
                key={metric.key}
                style={[
                  styles.dot,
                  index === activeMetricIndex && styles.dotActive,
                  index === activeMetricIndex && { backgroundColor: metric.accent },
                ]}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.feedHeader}>
          <Text style={styles.feedTitle}>Recent Transactions</Text>
          <Text style={styles.feedMeta}>
            {summary?.monthKey ?? 'This month'} · {summary?.transactionCount ?? 0} logged
          </Text>
        </View>

        {transactions.length > 0 ? (
          <View style={styles.feedList}>
            {transactions.slice(0, 8).map((tx) => (
              <View key={tx.id} style={styles.feedRow}>
                <View style={styles.feedCopy}>
                  <Text style={styles.feedLine} numberOfLines={1}>
                    <Text style={styles.feedStrong}>{formatUsd(tx.amount)}</Text>
                    <Text style={styles.feedMuted}> · </Text>
                    <Text style={styles.feedStrong}>{tx.vendor}</Text>
                  </Text>
                  <Text style={styles.feedSubline} numberOfLines={1}>
                    {tx.projectName} · {tx.category} · {formatShortDate(tx.date)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            Billing emails and renewals will auto-parse into this ledger.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(110, 231, 160, 0.12)',
  },
  panel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#232A38',
    backgroundColor: '#10131C',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    color: '#E8ECF5',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  metricPager: {
    paddingBottom: 4,
  },
  metricPage: {
    width: METRIC_PAGE_WIDTH,
    paddingRight: 8,
  },
  metricChip: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#141824',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricLabel: {
    color: '#9AA3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  metricCaption: {
    color: '#6B7288',
    fontSize: 11,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A3142',
  },
  dotActive: {
    width: 16,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#1C2230',
  },
  feedTitle: {
    color: '#C7D0E0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  feedMeta: {
    color: '#5C6478',
    fontSize: 11,
  },
  feedList: {
    gap: 6,
  },
  feedRow: {
    paddingVertical: 4,
  },
  feedCopy: {
    flex: 1,
  },
  feedLine: {
    color: '#D7DEEA',
    fontSize: 13,
    lineHeight: 18,
  },
  feedStrong: {
    color: '#F3F6FC',
    fontWeight: '700',
  },
  feedMuted: {
    color: '#5C6478',
    fontWeight: '400',
  },
  feedSubline: {
    color: '#6B7288',
    fontSize: 11,
    marginTop: 1,
  },
  emptyText: {
    color: '#5C6478',
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 4,
  },
});
