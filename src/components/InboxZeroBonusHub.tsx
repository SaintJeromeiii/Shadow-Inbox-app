import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  arcadeCard,
  arcadeColors,
  arcadeFonts,
  arcadeTypography,
} from '../theme/arcadeTheme';
import { ArcadeArchiveIcon, ArcadeTrashIcon } from './ArcadeIcons';
import { MailSorterDeluxeGame } from './MailSorterDeluxeModal';
import StampSmashGame from './StampSmashGame';

type BonusScreen = 'picker' | 'mail_sorter' | 'stamp_smash';

interface InboxZeroBonusHubProps {
  visible: boolean;
  onClose: () => void;
}

const GAME_CARDS: Array<{
  id: Exclude<BonusScreen, 'picker'>;
  title: string;
  subtitle: string;
  accent: string;
}> = [
  {
    id: 'mail_sorter',
    title: 'MAIL SORTER DELUXE',
    subtitle: 'Route falling envelopes into priority, archive, or trash.',
    accent: arcadeColors.neonCyan,
  },
  {
    id: 'stamp_smash',
    title: 'STAMP SMASH',
    subtitle: 'Whack-a-spam: stamp junk before it disappears.',
    accent: arcadeColors.neonPink,
  },
];

export default function InboxZeroBonusHub({ visible, onClose }: InboxZeroBonusHubProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const [screen, setScreen] = useState<BonusScreen>('picker');

  useEffect(() => {
    if (!visible) {
      setScreen('picker');
    }
  }, [visible]);

  const headerTitle =
    screen === 'picker'
      ? 'BONUS STAGE ARCADE'
      : screen === 'mail_sorter'
        ? 'MAIL SORTER DELUXE'
        : 'STAMP SMASH';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {screen !== 'picker' ? (
              <Pressable onPress={() => setScreen('picker')} style={styles.headerButton}>
                <Text style={styles.headerButtonText}>BACK</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.kicker}>INBOX ZERO</Text>
            <Text style={styles.title}>{headerTitle}</Text>
          </View>

          <View style={[styles.headerSide, styles.headerSideRight]}>
            <Pressable onPress={onClose} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>EXIT</Text>
            </Pressable>
          </View>
        </View>

        {screen === 'picker' ? (
          <View style={[styles.pickerContent, { paddingBottom: bottomPad }]}>
            <Text style={styles.pickerLead}>
              Inbox cleared. Pick a retro mail mini-game while you wait for fresh signal.
            </Text>

            {GAME_CARDS.map((game) => (
              <Pressable
                key={game.id}
                style={({ pressed }) => [
                  styles.gameCard,
                  { borderColor: game.accent },
                  pressed && styles.gameCardPressed,
                ]}
                onPress={() => setScreen(game.id)}
              >
                <View style={styles.gameCardTop}>
                  {game.id === 'mail_sorter' ? (
                    <ArcadeArchiveIcon size={22} color={game.accent} />
                  ) : (
                    <ArcadeTrashIcon size={22} color={game.accent} />
                  )}
                  <Text style={[styles.gameCardTitle, { color: game.accent }]}>
                    {game.title}
                  </Text>
                </View>
                <Text style={styles.gameCardSubtitle}>{game.subtitle}</Text>
                <Text style={styles.gameCardCta}>INSERT COIN</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {screen === 'mail_sorter' ? (
          <MailSorterDeluxeGame onBackToHub={() => setScreen('picker')} />
        ) : null}

        {screen === 'stamp_smash' ? (
          <StampSmashGame onBackToHub={() => setScreen('picker')} />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: arcadeColors.bgDeep,
  },
  header: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: arcadeColors.borderMuted,
  },
  headerSide: {
    width: 72,
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerButtonText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 10,
    color: arcadeColors.neonCyan,
  },
  kicker: {
    ...arcadeTypography.pixelSubtitle,
    color: arcadeColors.neonYellow,
  },
  title: {
    ...arcadeTypography.pixelTitlePink,
    marginTop: 4,
    textAlign: 'center',
  },
  pickerContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 16,
  },
  pickerLead: {
    ...arcadeTypography.retroBody,
    textAlign: 'center',
  },
  gameCard: {
    ...arcadeCard('cyan'),
    padding: 18,
    gap: 10,
    borderWidth: 2,
  },
  gameCardPressed: {
    opacity: 0.86,
  },
  gameCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gameCardTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 8,
    lineHeight: 12,
    flex: 1,
  },
  gameCardSubtitle: {
    ...arcadeTypography.retroBody,
  },
  gameCardCta: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonYellow,
    marginTop: 4,
  },
});
