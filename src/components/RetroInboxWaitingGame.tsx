import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  arcadeCard,
  arcadeColors,
  arcadeFonts,
  arcadeRadii,
  arcadeTypography,
} from '../theme/arcadeTheme';

const BOARD_COLUMNS = 7;
const BOARD_ROWS = 7;
const PLAYER_ROW = BOARD_ROWS - 1;
const TICK_MS = 420;

interface FallingMail {
  id: number;
  col: number;
  row: number;
}

interface RetroInboxWaitingGameProps {
  title: string;
  subtitle: string;
  lastCheckedLabel: string;
  refreshing?: boolean;
}

function getRandomColumn(): number {
  return Math.floor(Math.random() * BOARD_COLUMNS);
}

function buildBoardCells() {
  return Array.from({ length: BOARD_ROWS }, (_, row) =>
    Array.from({ length: BOARD_COLUMNS }, (_, col) => ({ row, col })),
  );
}

export default function RetroInboxWaitingGame({
  title,
  subtitle,
  lastCheckedLabel,
  refreshing = false,
}: RetroInboxWaitingGameProps) {
  const boardCells = useMemo(buildBoardCells, []);
  const [playerCol, setPlayerCol] = useState(Math.floor(BOARD_COLUMNS / 2));
  const [mail, setMail] = useState<FallingMail>(() => ({
    id: 1,
    col: getRandomColumn(),
    row: 0,
  }));
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [shields, setShields] = useState(3);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState('Catch signal packets until new mail arrives.');

  const resetRun = useCallback(() => {
    setPlayerCol(Math.floor(BOARD_COLUMNS / 2));
    setMail({ id: Date.now(), col: getRandomColumn(), row: 0 });
    setScore(0);
    setStreak(0);
    setShields(3);
    setPaused(false);
    setStatus('Scanner rebooted. Defend the inbox lane.');
  }, []);

  const movePlayer = useCallback(
    (direction: -1 | 1) => {
      if (shields <= 0) {
        resetRun();
        return;
      }

      setPaused(false);
      setPlayerCol((current) =>
        Math.max(0, Math.min(BOARD_COLUMNS - 1, current + direction)),
      );
    },
    [resetRun, shields],
  );

  useEffect(() => {
    if (paused || shields <= 0) {
      return;
    }

    const intervalId = setInterval(() => {
      setMail((current) => {
        const nextRow = current.row + 1;

        if (nextRow < PLAYER_ROW) {
          return { ...current, row: nextRow };
        }

        if (current.col === playerCol) {
          setScore((currentScore) => currentScore + 100 + streak * 25);
          setStreak((currentStreak) => currentStreak + 1);
          setStatus('Packet captured. Inbox perimeter holding.');
        } else {
          setStreak(0);
          setShields((currentShields) => Math.max(0, currentShields - 1));
          setStatus('Packet leaked. Slide into the lane before impact.');
        }

        return {
          id: current.id + 1,
          col: getRandomColumn(),
          row: 0,
        };
      });
    }, TICK_MS);

    return () => clearInterval(intervalId);
  }, [paused, playerCol, shields, streak]);

  useEffect(() => {
    if (shields === 0) {
      setStatus('Game over. Tap REBOOT to defend the quiet inbox again.');
    }
  }, [shields]);

  const shieldSlots = Array.from({ length: 3 }, (_, index) => index < shields);
  const scannerLabel = refreshing ? 'SYNCING' : paused ? 'PAUSED' : 'SCANNING';
  const gameOver = shields <= 0;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headingRow}>
        <View style={styles.pixelBadge}>
          <Text style={styles.pixelBadgeText}>WAIT MODE</Text>
        </View>
        <Text style={styles.syncMeta}>{lastCheckedLabel}</Text>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.cabinet}>
        <View style={styles.cabinetTop}>
          <View>
            <Text style={styles.gameTitle}>MAIL RUNNER 90</Text>
            <Text style={styles.gameCaption}>Intercept packets before they hit bottom.</Text>
          </View>
          <View style={styles.scannerPill}>
            <View style={[styles.scannerDot, refreshing && styles.scannerDotActive]} />
            <Text style={styles.scannerText}>{scannerLabel}</Text>
          </View>
        </View>

        <View style={styles.scoreboard}>
          <View style={styles.scoreCell}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreValue}>{score}</Text>
          </View>
          <View style={styles.scoreCell}>
            <Text style={styles.scoreLabel}>CHAIN</Text>
            <Text style={styles.scoreValue}>{streak}</Text>
          </View>
          <View style={styles.scoreCell}>
            <Text style={styles.scoreLabel}>SHIELD</Text>
            <View style={styles.shieldRow}>
              {shieldSlots.map((filled, index) => (
                <View
                  key={`shield-${index}`}
                  style={[styles.shieldBlock, filled && styles.shieldBlockFilled]}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.board}>
          {boardCells.map((row) => (
            <View key={`row-${row[0].row}`} style={styles.boardRow}>
              {row.map((cell) => {
                const hasMail = mail.row === cell.row && mail.col === cell.col;
                const hasPlayer = cell.row === PLAYER_ROW && playerCol === cell.col;

                return (
                  <View key={`cell-${cell.row}-${cell.col}`} style={styles.boardCell}>
                    {hasMail ? (
                      <View style={styles.mailSprite}>
                        <View style={styles.mailFlap} />
                      </View>
                    ) : null}
                    {hasPlayer ? <View style={styles.playerSprite} /> : null}
                  </View>
                );
              })}
            </View>
          ))}
          <View style={styles.scanline} pointerEvents="none" />
        </View>

        <Text style={styles.statusText}>{status}</Text>

        <View style={styles.controls}>
          <Pressable
            style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
            onPress={() => movePlayer(-1)}
            accessibilityLabel="Move packet runner left"
          >
            <Text style={styles.controlText}>LEFT</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
            onPress={() => (gameOver ? resetRun() : setPaused((current) => !current))}
            accessibilityLabel={gameOver ? 'Reboot mini game' : 'Pause mini game'}
          >
            <Text style={styles.controlText}>{gameOver ? 'REBOOT' : paused ? 'RESUME' : 'PAUSE'}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.controlButton, pressed && styles.controlPressed]}
            onPress={() => movePlayer(1)}
            accessibilityLabel="Move packet runner right"
          >
            <Text style={styles.controlText}>RIGHT</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 28,
    paddingBottom: 18,
    gap: 10,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pixelBadge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: arcadeColors.borderPink,
    borderRadius: arcadeRadii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 102, 204, 0.08)',
  },
  pixelBadgeText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonPink,
    letterSpacing: 0.5,
  },
  syncMeta: {
    flexShrink: 1,
    textAlign: 'right',
    ...arcadeTypography.retroCaption,
  },
  title: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 12,
    lineHeight: 18,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.5,
  },
  subtitle: {
    ...arcadeTypography.retroBody,
  },
  cabinet: {
    ...arcadeCard('pink'),
    padding: 12,
    gap: 12,
  },
  cabinetTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  gameTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 9,
    lineHeight: 14,
    color: arcadeColors.neonPink,
    letterSpacing: 0.5,
  },
  gameCaption: {
    ...arcadeTypography.retroCaption,
  },
  scannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: arcadeColors.borderCyan,
    borderRadius: arcadeRadii.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(51, 255, 255, 0.06)',
  },
  scannerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: arcadeColors.neonGreen,
  },
  scannerDotActive: {
    backgroundColor: arcadeColors.neonYellow,
  },
  scannerText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 9,
    color: arcadeColors.neonCyan,
  },
  scoreboard: {
    flexDirection: 'row',
    gap: 8,
  },
  scoreCell: {
    flex: 1,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    borderRadius: arcadeRadii.sm,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: arcadeColors.bgPanelElevated,
    gap: 4,
  },
  scoreLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 6,
    lineHeight: 9,
    color: arcadeColors.textDim,
  },
  scoreValue: {
    fontFamily: arcadeFonts.body,
    fontSize: 16,
    fontWeight: '800',
    color: arcadeColors.neonYellow,
  },
  shieldRow: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 18,
    alignItems: 'center',
  },
  shieldBlock: {
    width: 13,
    height: 13,
    borderWidth: 1,
    borderColor: arcadeColors.borderMuted,
    backgroundColor: 'transparent',
  },
  shieldBlockFilled: {
    backgroundColor: arcadeColors.neonGreen,
    borderColor: arcadeColors.neonGreen,
  },
  board: {
    position: 'relative',
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    backgroundColor: 'rgba(3, 8, 18, 0.92)',
    padding: 6,
    gap: 4,
    overflow: 'hidden',
  },
  boardRow: {
    flexDirection: 'row',
    gap: 4,
  },
  boardCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(51, 255, 255, 0.09)',
    backgroundColor: 'rgba(51, 255, 255, 0.025)',
  },
  mailSprite: {
    width: '58%',
    height: '42%',
    borderWidth: 2,
    borderColor: arcadeColors.neonYellow,
    backgroundColor: 'rgba(255, 224, 102, 0.25)',
  },
  mailFlap: {
    position: 'absolute',
    left: '22%',
    right: '22%',
    top: 2,
    height: 2,
    backgroundColor: arcadeColors.neonYellow,
  },
  playerSprite: {
    width: '70%',
    height: '34%',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: arcadeColors.neonPink,
  },
  scanline: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  statusText: {
    ...arcadeTypography.retroCaption,
    color: arcadeColors.textMuted,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
    borderRadius: arcadeRadii.sm,
    paddingVertical: 11,
    backgroundColor: arcadeColors.bgPanelElevated,
  },
  controlPressed: {
    opacity: 0.78,
    transform: [{ translateY: 1 }],
  },
  controlText: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    color: arcadeColors.neonCyan,
    letterSpacing: 0.5,
  },
});
