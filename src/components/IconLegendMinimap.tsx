import { useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ArcadeArchiveIcon,
  ArcadeCassetteIcon,
  ArcadeComputerIcon,
  ArcadeCrosshairIcon,
  ArcadeFirewallIcon,
  ArcadeJoystickIcon,
  ArcadeMapIcon,
  ArcadeRadarIcon,
  ArcadeRobotIcon,
  ArcadeSirenIcon,
  ArcadeSoundWaveIcon,
  ArcadeTrashIcon,
} from './ArcadeIcons';
import {
  arcadeColors,
  arcadeFonts,
  arcadePanel,
  arcadeTypography,
  neonCyanText,
} from '../theme/arcadeTheme';

interface LegendEntry {
  label: string;
  description: string;
  icon: ReactNode;
}

interface LegendSection {
  title: string;
  entries: LegendEntry[];
}

const emojiIconStyle = {
  fontSize: 16,
  lineHeight: 20,
  textAlign: 'center' as const,
};

const LEGEND_SECTIONS: LegendSection[] = [
  {
    title: 'HEADER CONTROLS',
    entries: [
      {
        label: 'Joystick',
        description: 'Record a voice note into the ops ledger.',
        icon: <ArcadeJoystickIcon size={16} color={arcadeColors.neonCyan} />,
      },
      {
        label: 'Firewall',
        description: 'Open smart firewall routing rules.',
        icon: <ArcadeFirewallIcon size={16} color={arcadeColors.neonPink} />,
      },
      {
        label: 'Computer',
        description: 'Open auto-pilot automation hub.',
        icon: <ArcadeComputerIcon size={16} color={arcadeColors.neonCyan} />,
      },
      {
        label: 'Cassette',
        description: 'Open core knowledge / AI memory base.',
        icon: <ArcadeCassetteIcon size={16} color={arcadeColors.neonCyan} />,
      },
      {
        label: 'Minimap',
        description: 'This icon key — explains symbols across the app.',
        icon: <ArcadeMapIcon size={16} color={arcadeColors.neonYellow} />,
      },
    ],
  },
  {
    title: 'CRIME BULLETIN',
    entries: [
      {
        label: 'Siren',
        description: 'Daily crime bulletin / street intel summary.',
        icon: <ArcadeSirenIcon size={14} color={arcadeColors.neonPink} />,
      },
      {
        label: 'Crosshair',
        description: 'Open cases and priority action items.',
        icon: <ArcadeCrosshairIcon size={14} color={arcadeColors.neonYellow} />,
      },
      {
        label: 'Radar',
        description: 'Signal filtering — noise vs. critical leads.',
        icon: <ArcadeRadarIcon size={14} color={arcadeColors.neonCyan} />,
      },
      {
        label: '▶',
        description: 'Expand or collapse the crime bulletin dossier.',
        icon: <Text style={emojiIconStyle}>▶</Text>,
      },
    ],
  },
  {
    title: 'MESSAGE SOURCES',
    entries: [
      { label: '✉️', description: 'Inbound email signal.', icon: <Text style={emojiIconStyle}>✉️</Text> },
      { label: '💬', description: 'Slack channel ping.', icon: <Text style={emojiIconStyle}>💬</Text> },
      { label: '🎮', description: 'Discord message.', icon: <Text style={emojiIconStyle}>🎮</Text> },
      { label: '📱', description: 'SMS text message.', icon: <Text style={emojiIconStyle}>📱</Text> },
      { label: '💚', description: 'WhatsApp message.', icon: <Text style={emojiIconStyle}>💚</Text> },
    ],
  },
  {
    title: 'FEED ACTIONS',
    entries: [
      {
        label: 'Archive',
        description: 'Archive / stash a message out of the active feed.',
        icon: <ArcadeArchiveIcon size={16} color={arcadeColors.textMuted} />,
      },
      {
        label: 'Trash',
        description: 'Delete / purge a message from the case file.',
        icon: <ArcadeTrashIcon size={16} color={arcadeColors.neonRed} />,
      },
      {
        label: '🧠',
        description: 'AI remembers prior thread context for this sender.',
        icon: <Text style={emojiIconStyle}>🧠</Text>,
      },
      {
        label: '📎',
        description: 'Image file attached to the message.',
        icon: <Text style={emojiIconStyle}>📎</Text>,
      },
      {
        label: '📄',
        description: 'PDF attachment scanned by the relay.',
        icon: <Text style={emojiIconStyle}>📄</Text>,
      },
      {
        label: '✨',
        description: 'AI reply assistant quick-response chips.',
        icon: <Ionicons name="sparkles-outline" size={16} color={arcadeColors.neonPurple} />,
      },
      {
        label: '⚡',
        description: 'Urgency score — hotter glow means higher priority.',
        icon: <Ionicons name="flash-outline" size={16} color={arcadeColors.neonYellow} />,
      },
    ],
  },
  {
    title: 'CALENDAR GUARD',
    entries: [
      {
        label: '🟢',
        description: 'Proposed meeting window is open on your calendar.',
        icon: <Text style={emojiIconStyle}>🟢</Text>,
      },
      {
        label: '⚠️',
        description: 'Schedule conflict detected for the proposed time.',
        icon: <Text style={emojiIconStyle}>⚠️</Text>,
      },
      {
        label: '📅',
        description: 'Scheduling check — reviewing proposed time slot.',
        icon: <Text style={emojiIconStyle}>📅</Text>,
      },
    ],
  },
  {
    title: 'AUTOMATION',
    entries: [
      {
        label: 'Robot',
        description: 'Auto-pilot rule — automated reply or archive.',
        icon: <ArcadeRobotIcon size={16} color={arcadeColors.neonCyan} />,
      },
      {
        label: 'Sound wave',
        description: 'Action complete — mission succeeded chime.',
        icon: <ArcadeSoundWaveIcon size={16} color={arcadeColors.neonPink} />,
      },
    ],
  },
];

interface IconLegendMinimapProps {
  /** Renders as a header utility pill instead of a floating corner button. */
  embedded?: boolean;
}

export default function IconLegendMinimap({ embedded = false }: IconLegendMinimapProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          embedded ? styles.embeddedTrigger : styles.trigger,
          pressed && styles.triggerPressed,
        ]}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Open icon legend minimap"
      >
        <ArcadeMapIcon size={16} color={arcadeColors.neonYellow} />
      </Pressable>

      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheetWrap} onPress={(event) => event.stopPropagation()}>
            <SafeAreaView edges={['top', 'bottom']} style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetTitleRow}>
                  <ArcadeMapIcon size={18} color={arcadeColors.neonYellow} />
                  <Text style={styles.sheetTitle}>ICON MINIMAP</Text>
                </View>
                <Pressable
                  style={styles.closeButton}
                  onPress={() => setVisible(false)}
                  accessibilityLabel="Close icon legend"
                >
                  <Ionicons name="close" size={20} color={arcadeColors.neonCyan} />
                </Pressable>
              </View>

              <Text style={styles.sheetHint}>
                Field guide to every symbol in Jeromeomegatron&apos;s Shadow Inbox.
              </Text>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {LEGEND_SECTIONS.map((section) => (
                  <View key={section.title} style={styles.section}>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <View style={styles.entryList}>
                      {section.entries.map((entry) => (
                        <View key={`${section.title}-${entry.label}`} style={styles.entryRow}>
                          <View style={styles.entryIcon}>{entry.icon}</View>
                          <View style={styles.entryCopy}>
                            <Text style={styles.entryLabel}>{entry.label}</Text>
                            <Text style={styles.entryDescription}>{entry.description}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'absolute',
    top: 6,
    right: 10,
    zIndex: 20,
    width: 34,
    height: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 2,
    borderColor: arcadeColors.neonYellow,
    shadowColor: arcadeColors.neonYellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 6,
  },
  embeddedTrigger: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 2,
    borderColor: arcadeColors.neonYellow,
    shadowColor: arcadeColors.neonYellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  triggerPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 8, 18, 0.82)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 48,
    paddingRight: 10,
    paddingLeft: 10,
  },
  sheetWrap: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '88%',
    alignSelf: 'flex-end',
  },
  sheet: {
    ...arcadePanel('cyan'),
    borderRadius: 8,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: arcadeColors.borderMuted,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 0.5,
    ...neonCyanText(),
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: arcadeColors.borderCyan,
    backgroundColor: arcadeColors.bgPanelElevated,
  },
  sheetHint: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textMuted,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    lineHeight: 16,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    gap: 12,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonPink,
    letterSpacing: 0.4,
  },
  entryList: {
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 4,
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
  },
  entryIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCopy: {
    flex: 1,
    gap: 2,
  },
  entryLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonCyan,
  },
  entryDescription: {
    ...arcadeTypography.retroCaption,
    fontSize: 11,
    lineHeight: 16,
    color: arcadeColors.textMuted,
  },
});
