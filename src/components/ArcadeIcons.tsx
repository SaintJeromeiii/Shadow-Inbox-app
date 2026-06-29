import { View, StyleSheet } from 'react-native';
import { arcadeColors } from '../theme/arcadeTheme';

type Pixel = 0 | 1 | 2;

interface PixelSpriteProps {
  /** 0 = transparent, 1 = primary, 2 = accent */
  grid: Pixel[][];
  pixelSize?: number;
  color?: string;
  accentColor?: string;
}

function PixelSprite({
  grid,
  pixelSize = 2,
  color = arcadeColors.neonCyan,
  accentColor = arcadeColors.neonPink,
}: PixelSpriteProps) {
  return (
    <View style={styles.sprite}>
      {grid.map((row, rowIndex) => (
        <View key={`r-${rowIndex}`} style={styles.row}>
          {row.map((cell, colIndex) => (
            <View
              key={`c-${rowIndex}-${colIndex}`}
              style={{
                width: pixelSize,
                height: pixelSize,
                backgroundColor:
                  cell === 1 ? color : cell === 2 ? accentColor : 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Original 80s arcade joystick — voice / mic actions */
export function ArcadeJoystickIcon({
  size = 20,
  color = arcadeColors.neonCyan,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 10));
  const grid: Pixel[][] = [
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 2, 1, 1, 2, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonPink} />;
}

/** Armored hero + shield — firewall / security rules */
export function ArcadeFirewallIcon({
  size = 20,
  color = arcadeColors.neonPink,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 10));
  const grid: Pixel[][] = [
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 2, 2, 1, 1, 0, 0],
    [0, 1, 1, 2, 2, 2, 2, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
    [1, 0, 0, 0, 1, 1, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonCyan} />;
}

/** Cassette tape with data stream — AI / knowledge synthesis */
export function ArcadeCassetteIcon({
  size = 20,
  color = arcadeColors.neonCyan,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 10));
  const grid: Pixel[][] = [
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [1, 0, 2, 2, 0, 0, 2, 2, 0, 1],
    [1, 0, 2, 2, 0, 0, 2, 2, 0, 1],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 2, 0, 2, 2, 0, 2, 0, 0],
    [0, 0, 0, 2, 0, 0, 2, 0, 0, 0],
    [0, 0, 0, 0, 2, 2, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 2, 0, 0, 0, 0],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonPink} />;
}

/** 80s desktop computer — automation / auto-pilot */
export function ArcadeComputerIcon({
  size = 20,
  color = arcadeColors.neonCyan,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 10));
  const grid: Pixel[][] = [
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 2, 2, 2, 2, 2, 2, 1, 1],
    [1, 1, 2, 2, 2, 2, 2, 2, 1, 1],
    [1, 1, 2, 2, 2, 2, 2, 2, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonPink} />;
}

/** Pixel hamburger — side deck menu */
export function ArcadeHamburgerIcon({
  size = 18,
  color = arcadeColors.neonCyan,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 9));
  const grid: Pixel[][] = [
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonPink} />;
}

/** Pixel minimap — icon legend key */
export function ArcadeMapIcon({
  size = 16,
  color = arcadeColors.neonYellow,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 8));
  const grid: Pixel[][] = [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 2, 1],
    [1, 0, 1, 1, 0, 0, 0, 1],
    [1, 0, 1, 1, 0, 2, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 2, 0, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonCyan} />;
}

/** Retro police siren — crime bulletin / sitrep headers */
export function ArcadeSirenIcon({
  size = 16,
  color = arcadeColors.neonPink,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 8));
  const grid: Pixel[][] = [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 2, 1, 1, 2, 1, 0],
    [1, 1, 2, 2, 2, 2, 1, 1],
    [1, 1, 1, 2, 2, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 0, 0, 1, 0, 0],
    [0, 1, 1, 0, 0, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 1, 1],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonCyan} />;
}

/** Pixel crosshair — action items / priorities */
export function ArcadeCrosshairIcon({
  size = 16,
  color = arcadeColors.neonYellow,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 8));
  const grid: Pixel[][] = [
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 1, 2, 2, 1, 0, 0],
    [0, 1, 0, 2, 2, 0, 1, 0],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [1, 2, 2, 2, 2, 2, 2, 1],
    [0, 1, 0, 2, 2, 0, 1, 0],
    [0, 0, 1, 2, 2, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonPink} />;
}

/** Retro radar sweep — signal filtering */
export function ArcadeRadarIcon({
  size = 16,
  color = arcadeColors.neonCyan,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 8));
  const grid: Pixel[][] = [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 2, 2, 0, 0, 1],
    [1, 0, 2, 2, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 2, 0, 1],
    [1, 0, 0, 0, 2, 2, 0, 1],
    [0, 1, 0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonGreen} />;
}

/** 8-bit robot — auto-pilot / automation rules */
export function ArcadeRobotIcon({
  size = 16,
  color = arcadeColors.neonCyan,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 8));
  const grid: Pixel[][] = [
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 2, 2, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 1, 0, 1, 1, 1, 1, 0, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 0, 1, 1, 0, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 2, 1, 1, 2, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonPink} />;
}

/** 8-bit trash can — delete / purge actions */
export function ArcadeTrashIcon({
  size = 18,
  color = arcadeColors.neonRed,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 9));
  const grid: Pixel[][] = [
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 0, 1, 1, 0, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 2, 1, 1, 2, 1, 0, 0],
    [0, 0, 1, 2, 1, 1, 2, 1, 0, 0],
    [0, 0, 1, 2, 1, 1, 2, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonPink} />;
}

/** Pixel archive box — stash / archive actions */
export function ArcadeArchiveIcon({
  size = 18,
  color = arcadeColors.textMuted,
}: {
  size?: number;
  color?: string;
}) {
  const pixelSize = Math.max(2, Math.round(size / 9));
  const grid: Pixel[][] = [
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 0, 0, 0, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 1, 2, 2, 2, 2, 1, 0, 1],
    [1, 0, 1, 2, 2, 2, 2, 1, 0, 1],
    [1, 0, 1, 2, 2, 2, 2, 1, 0, 1],
    [1, 0, 1, 2, 2, 2, 2, 1, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  return <PixelSprite grid={grid} pixelSize={pixelSize} color={color} accentColor={arcadeColors.neonCyan} />;
}

/** Sound wave bars for action-complete confirmation */
export function ArcadeSoundWaveIcon({
  size = 20,
  color = arcadeColors.neonPink,
  heights = [0.4, 0.7, 1, 0.6, 0.85, 0.5],
}: {
  size?: number;
  color?: string;
  heights?: number[];
}) {
  const barWidth = Math.max(2, Math.round(size / 12));
  const gap = 2;
  const maxHeight = size;

  return (
    <View style={[styles.soundWave, { height: maxHeight, gap }]}>
      {heights.map((ratio, index) => (
        <View
          key={index}
          style={{
            width: barWidth,
            height: Math.max(3, maxHeight * ratio),
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sprite: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  soundWave: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
});
