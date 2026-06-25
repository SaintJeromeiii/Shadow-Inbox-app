import { Text, View, StyleSheet } from 'react-native';

interface MarkdownBriefingProps {
  markdown: string;
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

        if (trimmed.startsWith('## ')) {
          return (
            <Text key={`h2-${index}`} style={styles.heading}>
              {trimmed.slice(3)}
            </Text>
          );
        }

        if (trimmed.startsWith('# ')) {
          return (
            <Text key={`h1-${index}`} style={styles.headingLarge}>
              {trimmed.slice(2)}
            </Text>
          );
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const content = trimmed.slice(2);
          return (
            <View key={`bullet-${index}`} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
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
  },
  spacer: {
    height: 8,
  },
  headingLarge: {
    color: '#F4F7FF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 4,
  },
  heading: {
    color: '#D6E4FF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 2,
    marginBottom: 6,
  },
  bulletDot: {
    color: '#8EB5FF',
    fontSize: 14,
    lineHeight: 20,
    width: 12,
  },
  bulletText: {
    flex: 1,
    color: '#C8D2E8',
    fontSize: 14,
    lineHeight: 20,
  },
  paragraph: {
    color: '#C8D2E8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  bold: {
    color: '#F0F4FF',
    fontWeight: '700',
  },
});
