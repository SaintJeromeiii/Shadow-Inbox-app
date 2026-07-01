import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { arcadeColors, arcadeFonts } from '../theme/arcadeTheme';

const PRIVACY_SECTIONS: Array<{ title: string; body: string }> = [
  {
    title: 'What we collect',
    body:
      'Email you connect via Google (subject, body, sender), your onboarding profile, Knowledge Core notes, progress stats, and optional push tokens.',
  },
  {
    title: 'How we use it',
    body:
      'To triage your inbox, draft replies in your voice, send/archive/trash when you confirm, and notify you about action-required mail.',
  },
  {
    title: 'Third parties',
    body:
      'Google (Gmail), our AI provider for triage/drafts, Supabase/Railway for backend storage and processing. We do not sell your data.',
  },
  {
    title: 'Your choices',
    body:
      'Disconnect Gmail anytime, edit Knowledge Core, disable notifications, and clear local cache by signing out.',
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated June 30, 2026</Text>
        <Text style={styles.lead}>
          Shadow Inbox processes your email to help you sort noise, draft replies, and clear your
          inbox. AI triage runs on our server — your OpenAI key is never stored in the app.
        </Text>

        {PRIVACY_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <Text style={styles.footer}>
          Full policy: PRIVACY.md in the Shadow Inbox repository.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 14,
  },
  title: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 12,
    lineHeight: 18,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.6,
  },
  updated: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textDim,
  },
  lead: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 12,
    color: arcadeColors.textPrimary,
  },
  section: {
    gap: 6,
    paddingTop: 4,
  },
  sectionTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    color: arcadeColors.neonPink,
  },
  sectionBody: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 12,
    color: arcadeColors.textPrimary,
  },
  footer: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.textDim,
    marginTop: 8,
  },
});
