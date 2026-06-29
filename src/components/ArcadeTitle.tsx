import { StyleSheet, Text, View } from 'react-native';
import { arcadeColors, arcadeFonts, neonCyanText, neonPinkText } from '../theme/arcadeTheme';

interface ArcadeTitleProps {
  subtitle?: string;
}

export default function ArcadeTitle({ subtitle }: ArcadeTitleProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
        SHADOW INBOX
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
    minWidth: 0,
  },
  title: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1,
    ...neonCyanText(),
  },
  subtitle: {
    fontFamily: arcadeFonts.body,
    fontSize: 11,
    color: arcadeColors.textMuted,
    letterSpacing: 0.3,
  },
});
