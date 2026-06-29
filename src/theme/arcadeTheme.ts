import { Platform, TextStyle, ViewStyle } from 'react-native';

/** Neon arcade palette — deep space grid + hot pink / electric cyan glow */
export const arcadeColors = {
  bgDeep: '#030812',
  bgMidnight: '#061018',
  bgPanel: '#0A1428',
  bgPanelElevated: '#0F1A35',
  gridLine: 'rgba(51, 255, 255, 0.07)',
  gridLineBright: 'rgba(51, 255, 255, 0.14)',

  neonPink: '#FF66CC',
  neonPinkDim: 'rgba(255, 102, 204, 0.55)',
  neonPinkGlow: 'rgba(255, 102, 204, 0.35)',
  neonCyan: '#33FFFF',
  neonCyanDim: 'rgba(51, 255, 255, 0.55)',
  neonCyanGlow: 'rgba(51, 255, 255, 0.35)',
  neonPurple: '#B366FF',
  neonYellow: '#FFE066',
  neonGreen: '#66FF99',
  neonRed: '#FF4466',

  textPrimary: '#33FFFF',
  textSecondary: '#FF66CC',
  textMuted: '#7AA8CC',
  textDim: '#4A6888',

  borderPink: 'rgba(255, 102, 204, 0.65)',
  borderCyan: 'rgba(51, 255, 255, 0.65)',
  borderMuted: 'rgba(51, 255, 255, 0.22)',

  tabInactive: '#0C1628',
  tabActive: '#122040',
  danger: '#FF4466',
  success: '#66FF99',
  warning: '#FFE066',
} as const;

export const arcadeFonts = {
  pixel: 'PressStart2P_400Regular',
  body: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const arcadeSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const arcadeRadii = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

/** Pixel title glow — React Native textShadow* */
export function neonTextGlow(color: string): TextStyle {
  return {
    textShadowColor: color,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  };
}

export function neonPinkText(): TextStyle {
  return {
    color: arcadeColors.neonPink,
    ...neonTextGlow(arcadeColors.neonPinkGlow),
  };
}

export function neonCyanText(): TextStyle {
  return {
    color: arcadeColors.neonCyan,
    ...neonTextGlow(arcadeColors.neonCyanGlow),
  };
}

/** Glowing neon card shell */
export function arcadeCard(variant: 'pink' | 'cyan' = 'cyan'): ViewStyle {
  const borderColor = variant === 'pink' ? arcadeColors.borderPink : arcadeColors.borderCyan;
  return {
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 2,
    borderColor,
    borderRadius: arcadeRadii.md,
    shadowColor: variant === 'pink' ? arcadeColors.neonPink : arcadeColors.neonCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  };
}

export function arcadePill(variant: 'pink' | 'cyan' = 'cyan'): ViewStyle {
  const borderColor = variant === 'pink' ? arcadeColors.borderPink : arcadeColors.borderCyan;
  return {
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 1,
    borderColor,
    borderRadius: arcadeRadii.pill,
  };
}

export function arcadeButtonPrimary(): ViewStyle {
  return {
    backgroundColor: arcadeColors.bgPanelElevated,
    borderWidth: 2,
    borderColor: arcadeColors.borderPink,
    borderRadius: arcadeRadii.sm,
    shadowColor: arcadeColors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  };
}

/**
 * Retro-modern typography: pixel font for headers/labels, monospace for readable body.
 */
export const arcadeTypography = {
  pixelTitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 9,
    lineHeight: 14,
    letterSpacing: 0.5,
    ...neonCyanText(),
  },
  pixelTitlePink: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 9,
    lineHeight: 14,
    letterSpacing: 0.5,
    ...neonPinkText(),
  },
  pixelSubtitle: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    letterSpacing: 0.4,
    color: arcadeColors.textDim,
  },
  sectionLabel: {
    fontFamily: arcadeFonts.pixel,
    fontSize: 7,
    lineHeight: 11,
    letterSpacing: 0.6,
    color: arcadeColors.neonPink,
    textTransform: 'uppercase' as const,
  },
  retroBody: {
    fontFamily: arcadeFonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: arcadeColors.textMuted,
  },
  retroBodyBright: {
    fontFamily: arcadeFonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: arcadeColors.neonCyan,
    fontWeight: '600' as const,
  },
  retroCaption: {
    fontFamily: arcadeFonts.body,
    fontSize: 11,
    lineHeight: 16,
    color: arcadeColors.textDim,
  },
  retroValue: {
    fontFamily: arcadeFonts.body,
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  retroHour: {
    fontFamily: arcadeFonts.body,
    fontSize: 18,
    fontWeight: '700' as const,
    letterSpacing: 1,
    color: arcadeColors.neonCyan,
  },
  retroMeta: {
    fontFamily: arcadeFonts.body,
    fontSize: 11,
    lineHeight: 16,
    color: arcadeColors.textDim,
  },
};

/** Shared neon panel shell for feed modules */
export function arcadePanel(variant: 'pink' | 'cyan' | 'green' = 'cyan'): ViewStyle {
  const borderColor =
    variant === 'pink'
      ? arcadeColors.borderPink
      : variant === 'green'
        ? 'rgba(102, 255, 153, 0.55)'
        : arcadeColors.borderCyan;
  const shadowColor =
    variant === 'pink'
      ? arcadeColors.neonPink
      : variant === 'green'
        ? arcadeColors.neonGreen
        : arcadeColors.neonCyan;

  return {
    borderRadius: arcadeRadii.md,
    borderWidth: 2,
    borderColor,
    backgroundColor: arcadeColors.bgPanel,
    overflow: 'hidden',
    shadowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  };
}
