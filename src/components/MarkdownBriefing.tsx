import { Text, View, StyleSheet } from 'react-native';
import {
  ArcadeCrosshairIcon,
  ArcadeRadarIcon,
  ArcadeSirenIcon,
} from './ArcadeIcons';
import { arcadeColors, arcadeFonts, arcadeTypography } from '../theme/arcadeTheme';

interface MarkdownBriefingProps {
  markdown: string;
}

const BRIEFING_HEADER_PREFIX =
  /^[\s\u26A1\u{1F6A8}\u{1F3AF}\u{1F50D}\u{1F4E1}\u{1F4E2}\uFE0F\u200D]+/u;

function stripLeadingEmoji(text: string): string {
  return text.replace(BRIEFING_HEADER_PREFIX, '').trim();
}

function renderSectionIcon(title: string) {
  const upper = title.toUpperCase();

  if (upper.includes('CRIME BULLETIN') || upper.includes('SITREP') || upper.includes('SITUATION REPORT')) {
    return <ArcadeSirenIcon size={14} color={arcadeColors.neonPink} />;
  }

  if (upper.includes('ACTION ITEM') || upper.includes('PRIORIT')) {
    return <ArcadeCrosshairIcon size={14} color={arcadeColors.neonYellow} />;
  }

  if (upper.includes('SIGNAL') || upper.includes('FILTER')) {
    return <ArcadeRadarIcon size={14} color={arcadeColors.neonCyan} />;
  }

  return null;
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={`${keyPrefix}-bold-${index}`} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }

    return part;
  });
}

export default function MarkdownBriefing({ markdown }: MarkdownBriefingProps) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  return (
    <View style={styles.container}>
      {lines.map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
          return <View key={`spacer-${index}`} style={styles.spacer} />;
        }

        if (trimmed.startsWith('### ')) {
          const title = stripLeadingEmoji(trimmed.slice(4));
          const icon = renderSectionIcon(title);

          return (
            <View key={`h3-${index}`} style={styles.sectionHeader}>
              {icon ? <View style={styles.sectionIcon}>{icon}</View> : null}
              <Text style={styles.heading} numberOfLines={2}>
                {title}
              </Text>
            </View>
          );
        }

        if (trimmed.startsWith('## ')) {
          const title = stripLeadingEmoji(trimmed.slice(3));
          return (
            <Text key={`h2-${index}`} style={styles.heading} numberOfLines={2}>
              {title}
            </Text>
          );
        }

        if (trimmed.startsWith('# ')) {
          const title = stripLeadingEmoji(trimmed.slice(2));
          return (
            <Text key={`h1-${index}`} style={styles.headingLarge} numberOfLines={2}>
              {title}
            </Text>
          );
        }

        if (trimmed.startsWith('|')) {
          return (
            <Text key={`table-${index}`} style={styles.tableLine} numberOfLines={3}>
              {trimmed.replace(/\|/g, ' · ').replace(/\s+/g, ' ').trim()}
            </Text>
          );
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.slice(2);
          return (
            <View key={`bullet-${index}`} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>▸</Text>
              <Text style={styles.bulletText}>
                {renderInlineMarkdown(content, `line-${index}`)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`p-${index}`} style={styles.paragraph}>
            {renderInlineMarkdown(trimmed, `line-${index}`)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
    overflow: 'hidden',
  },
  spacer: {
    height: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
    paddingRight: 4,
  },
  sectionIcon: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingLarge: {
    fontFamily: arcadeFonts.pixel,
    color: arcadeColors.neonCyan,
    fontSize: 9,
    lineHeight: 14,
    marginBottom: 6,
    marginTop: 4,
  },
  heading: {
    flex: 1,
    flexShrink: 1,
    fontFamily: arcadeFonts.pixel,
    color: arcadeColors.neonPink,
    fontSize: 7,
    lineHeight: 12,
    letterSpacing: 0.3,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 2,
    marginBottom: 6,
  },
  bulletDot: {
    color: arcadeColors.neonCyan,
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 16,
    width: 10,
  },
  bulletText: {
    flex: 1,
    flexShrink: 1,
    ...arcadeTypography.retroBody,
    fontSize: 12,
    lineHeight: 18,
  },
  paragraph: {
    ...arcadeTypography.retroBody,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  tableLine: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 4,
  },
  bold: {
    color: arcadeColors.neonCyan,
    fontWeight: '700',
  },
});
