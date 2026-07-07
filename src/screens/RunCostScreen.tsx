import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArcadeHamburgerIcon } from '../components/ArcadeIcons';
import FinanceRunwayStrip from '../components/FinanceRunwayStrip';
import { formatUsd } from '../services/financeService';
import { fetchRunCostSummary, type RunCostSummary } from '../services/runCostService';
import { arcadeColors, arcadeFonts, arcadePanel, arcadeTypography } from '../theme/arcadeTheme';

interface RunCostScreenProps {
  onOpenDrawer: () => void;
  isScreenFocused?: boolean;
}

const REFRESH_MS = 45_000;

function formatUsageLine(label: string, used: number, limit: number): string {
  if (limit <= 0) {
    return `${label}: ${used}`;
  }
  return `${label}: ${used}/${limit}`;
}

export default function RunCostScreen({
  onOpenDrawer,
  isScreenFocused = true,
}: RunCostScreenProps) {
  const [summary, setSummary] = useState<RunCostSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const fetchedAtRef = useRef(0);
  const requestRef = useRef(false);

  const load = useCallback(async (force = false) => {
    if (requestRef.current) {
      return;
    }

    const now = Date.now();
    if (!force && now - fetchedAtRef.current < REFRESH_MS && summary) {
      return;
    }

    requestRef.current = true;
    setErrorText(null);
    setLoading(true);

    try {
      const nextSummary = await fetchRunCostSummary();
      setSummary(nextSummary);
      fetchedAtRef.current = Date.now();

      if (!nextSummary) {
        setErrorText('Could not load cost telemetry right now.');
      }
    } finally {
      requestRef.current = false;
      setLoading(false);
    }
  }, [summary]);

  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }
    void load();
  }, [isScreenFocused, load]);

  const trackedSpend = summary?.totals.trackedLedgerMonthToDate ?? 0;
  const estimatedSpend = summary?.totals.providerEstimateMonthToDate ?? 0;
  const combinedSpend = summary?.totals.combinedViewMonthToDate ?? 0;
  const transactionCount = summary?.finance.transactionCount ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.menuButton} onPress={onOpenDrawer}>
          <ArcadeHamburgerIcon size={18} color={arcadeColors.neonCyan} />
        </Pressable>
        <View>
          <Text style={styles.title}>RUN COST</Text>
          <Text style={styles.subtitle}>What Shadow Inbox can currently see you paying</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>VISIBILITY STATUS</Text>
          <Text style={styles.bodyText}>
            Shadow Inbox can currently see costs that arrive as billing emails and receipts inside
            your inbox. It cannot see your live Railway, Supabase, Expo, OpenAI, or Google billing
            dashboards unless those accounts are integrated separately.
          </Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <Text style={styles.metricLabel}>TRACKED THIS MONTH</Text>
            <Text style={styles.metricValue}>{formatUsd(trackedSpend)}</Text>
            <Text style={styles.metricCaption}>Known charges from parsed billing receipts</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>ESTIMATED CLOUD + AI</Text>
            <Text style={[styles.metricValue, styles.metricValueSmall]}>{formatUsd(estimatedSpend)}</Text>
            <Text style={styles.metricCaption}>Manual provider estimates + AI usage estimate</Text>
          </View>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>COMBINED VIEW</Text>
          <Text style={[styles.metricValue, styles.metricValueCombined]}>{formatUsd(combinedSpend)}</Text>
          <Text style={styles.metricCaption}>
            Billing ledger plus configured provider and AI estimates
          </Text>
        </View>

        <FinanceRunwayStrip summary={summary?.finance ?? null} loading={loading} />

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>AI ACTIVITY</Text>
            {loading ? <ActivityIndicator color={arcadeColors.neonYellow} size="small" /> : null}
          </View>

          {summary?.aiToday ? (
            <>
              <Text style={styles.bodyText}>
                {summary.visibility.hasTokenBasedAiCosting
                  ? 'AI cost is now being estimated from real token usage returned by the model APIs.'
                  : 'These are usage counters, not direct invoice totals yet. They still help show where AI-related cost is likely coming from.'}
              </Text>
              <View style={styles.metaStack}>
                <Text style={styles.metaLine}>
                  {formatUsageLine('Today triage runs', summary.aiToday.triage.used, summary.aiToday.triage.limit)}
                </Text>
                <Text style={styles.metaLine}>
                  {formatUsageLine('Today drafts & replies', summary.aiToday.llm.used, summary.aiToday.llm.limit)}
                </Text>
                <Text style={styles.metaLine}>
                  {formatUsageLine('Today embeddings', summary.aiToday.embedding.used, summary.aiToday.embedding.limit)}
                </Text>
                <Text style={styles.metaLine}>Month triage runs: {summary.aiMonthUsage.triage}</Text>
                <Text style={styles.metaLine}>Month drafts & replies: {summary.aiMonthUsage.llm}</Text>
                <Text style={styles.metaLine}>Month embeddings: {summary.aiMonthUsage.embedding}</Text>
                <Text style={styles.metaLine}>Month prompt tokens: {summary.aiCostSummary.promptTokens}</Text>
                <Text style={styles.metaLine}>Month completion tokens: {summary.aiCostSummary.completionTokens}</Text>
                <Text style={styles.metaLine}>Month total tokens: {summary.aiCostSummary.totalTokens}</Text>
                <Text style={styles.metaLine}>
                  Token-based AI estimate: {formatUsd(summary.aiCostSummary.estimatedCostUsd)}
                </Text>
                <Text style={styles.metaLine}>Account: {summary.aiToday.accountKey}</Text>
                <Text style={styles.metaLine}>Day: {summary.aiToday.date}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.bodyText}>
              AI usage telemetry is not available right now for this account.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>HOW TO MAKE THIS MORE ACCURATE</Text>
          <Text style={styles.bodyText}>
            For true live operating cost, the next step would be to connect provider billing APIs
            or ingest billing emails from Railway, Supabase, Expo, Google, and any AI vendor you
            use. Right now this screen is strongest at surfacing recognized billing receipts plus
            AI activity volume.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>PROVIDER ESTIMATES</Text>
          <View style={styles.metaStack}>
            {(summary?.providerEstimates ?? []).map((item) => (
              <Text key={item.key} style={styles.metaLine}>
                {item.label}: {formatUsd(item.amount)}{' '}
                <Text style={styles.metaSource}>
                  {item.source === 'estimated_from_usage' ? '(estimated from app usage)' : '(configured estimate)'}
                </Text>
              </Text>
            ))}
          </View>
          <Text style={styles.bodyText}>
            You can tune these estimates by setting backend env vars like
            `RUN_COST_RAILWAY_MONTHLY_USD`, `RUN_COST_SUPABASE_MONTHLY_USD`,
            `RUN_COST_EXPO_MONTHLY_USD`, `RUN_COST_GOOGLE_MONTHLY_USD`,
            `RUN_COST_AI_TRIAGE_UNIT_USD`, `RUN_COST_AI_LLM_UNIT_USD`, and
            `RUN_COST_AI_EMBEDDING_UNIT_USD`.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>WHAT TO CONNECT NEXT</Text>
          <Text style={styles.bodyText}>
            For real billing, connect Railway, Supabase, and AI vendor invoices into this screen.
            The fastest path is billing emails first, then provider APIs if you want live numbers.
          </Text>
        </View>

        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
      </ScrollView>
    </SafeAreaView>
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
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: arcadeColors.borderMuted,
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
  title: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 10,
    lineHeight: 16,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: arcadeFonts.body,
    fontSize: 11,
    color: arcadeColors.textMuted,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  card: {
    ...arcadePanel('cyan'),
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.neonPink,
  },
  bodyText: {
    ...arcadeTypography.retroBody,
  },
  metricsRow: {
    gap: 12,
  },
  metricCard: {
    ...arcadePanel('green'),
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  metricCardPrimary: {
    borderColor: arcadeColors.borderCyan,
  },
  metricLabel: {
    ...arcadeTypography.sectionLabel,
    color: arcadeColors.textMuted,
  },
  metricValue: {
    ...arcadeTypography.retroValue,
    color: arcadeColors.neonGreen,
  },
  metricValueSmall: {
    color: arcadeColors.neonYellow,
  },
  metricValueCombined: {
    color: arcadeColors.neonCyan,
  },
  metricCaption: {
    ...arcadeTypography.retroCaption,
  },
  metaStack: {
    gap: 4,
  },
  metaLine: {
    ...arcadeTypography.retroMeta,
    color: arcadeColors.neonCyan,
  },
  metaSource: {
    color: arcadeColors.textDim,
  },
  errorText: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.neonPink,
  },
});
