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
import {
  arcadeColors,
  arcadePanel,
  arcadeTypography,
} from '../theme/arcadeTheme';

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
        label: 'TOTAL DEV COST',
        value: summary?.totalMonthToDate ?? 0,
        accent: arcadeColors.neonCyan,
        caption: 'Month-to-date operational spend',
      },
      {
        key: 'alpharounds',
        label: 'ALPHAROUNDS OH',
        value: byProject.AlphaRounds,
        accent: arcadeColors.neonPurple,
        caption: 'MTD run rate for AlphaRounds',
      },
      {
        key: 'dealshield',
        label: 'DEALSHIELD INFRA',
        value: byProject.DealShield,
        accent: arcadeColors.neonGreen,
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
          <View style={styles.headerCopy}>
            <Text style={styles.title}>OPERATION WAR CHEST</Text>
            <Text style={styles.subtitle}>FIELD EXPENSES // CASE FUNDS</Text>
          </View>
          {loading ? <ActivityIndicator color={arcadeColors.neonGreen} size="small" /> : null}
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
          <Text style={styles.feedTitle}>RECENT TXNS</Text>
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
                    <Text style={[styles.feedStrong, { color: arcadeColors.neonGreen }]}>
                      {formatUsd(tx.amount)}
                    </Text>
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
    borderRadius: 8,
    backgroundColor: 'rgba(102, 255, 153, 0.1)',
  },
  panel: {
    ...arcadePanel('green'),
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerCopy: {
    gap: 4,
    flex: 1,
  },
  title: {
    ...arcadeTypography.pixelTitlePink,
  },
  subtitle: {
    ...arcadeTypography.pixelSubtitle,
  },
  metricPager: {
    paddingBottom: 4,
  },
  metricPage: {
    width: METRIC_PAGE_WIDTH,
    paddingRight: 8,
  },
  metricChip: {
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: arcadeColors.bgPanelElevated,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricLabel: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.textMuted,
    marginBottom: 6,
  },
  metricValue: {
    ...arcadeTypography.retroValue,
    marginBottom: 4,
  },
  metricCaption: {
    ...arcadeTypography.retroCaption,
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
    borderRadius: 2,
    backgroundColor: arcadeColors.borderMuted,
  },
  dotActive: {
    width: 16,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: arcadeColors.borderMuted,
  },
  feedTitle: {
    ...arcadeTypography.sectionLabel,
  },
  feedMeta: {
    ...arcadeTypography.retroMeta,
  },
  feedList: {
    gap: 6,
  },
  feedRow: {
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: arcadeColors.borderMuted,
    paddingLeft: 8,
  },
  feedCopy: {
    flex: 1,
  },
  feedLine: {
    ...arcadeTypography.retroBody,
  },
  feedStrong: {
    ...arcadeTypography.retroBodyBright,
    color: arcadeColors.neonCyan,
  },
  feedMuted: {
    ...arcadeTypography.retroCaption,
  },
  feedSubline: {
    ...arcadeTypography.retroMeta,
    marginTop: 2,
  },
  emptyText: {
    ...arcadeTypography.retroCaption,
    paddingVertical: 4,
  },
});
