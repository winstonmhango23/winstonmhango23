/**
 * CoFi Banking Design System – Mobile App Theme
 * Matches the dashboard (cofi-bms-dashboard) for consistent brand identity.
 * Professional, premium-quality banking theme for Malawi microfinance.
 */

import { Platform } from 'react-native';

// CoFi Banking palette (hex equivalents of dashboard HSL values)
export const CoFiColors = {
  // Primary – deep navy blue (hsl 217 91% 22%)
  primary: '#0a3d7a',
  primaryDark: '#061528',
  primaryLight: '#0a4a8f',

  // Secondary – gold/amber accent (hsl 45 93% 47%)
  accent: '#e6b800',
  accentGold: '#f59e0b',

  // Teal – success/accent (hsl 174 62% 38%)
  teal: '#2ba894',

  // Semantic
  success: '#22c55e',
  warning: '#f59e0b',
  destructive: '#ef4444',

  // Neutrals – light mode
  background: '#f8f9fb',
  backgroundCard: '#ffffff',
  foreground: '#0f172a',
  muted: '#f1f3f5',
  mutedForeground: '#6b7280',
  border: '#e2e6ea',
  input: '#e2e6ea',

  // Dark mode
  dark: {
    background: '#05080f',
    backgroundCard: '#061528',
    foreground: '#f1f3f5',
    muted: '#0a2744',
    mutedForeground: '#94a3b8',
    border: '#0f2744',
  },
};

// Tab bar and navigation
const tintLight = CoFiColors.primary;
const tintDark = CoFiColors.accent;

export const Colors = {
  light: {
    text: CoFiColors.foreground,
    background: CoFiColors.background,
    foreground: CoFiColors.foreground,
    tint: tintLight,
    icon: CoFiColors.mutedForeground,
    tabIconDefault: CoFiColors.mutedForeground,
    tabIconSelected: tintLight,
    primary: CoFiColors.primary,
    accent: CoFiColors.accent,
    success: CoFiColors.success,
    warning: CoFiColors.warning,
    destructive: CoFiColors.destructive,
    card: CoFiColors.backgroundCard,
    border: CoFiColors.border,
    muted: CoFiColors.muted,
    mutedForeground: CoFiColors.mutedForeground,
  },
  dark: {
    text: CoFiColors.dark.foreground,
    background: CoFiColors.dark.background,
    foreground: CoFiColors.dark.foreground,
    tint: tintDark,
    icon: CoFiColors.dark.mutedForeground,
    tabIconDefault: CoFiColors.dark.mutedForeground,
    tabIconSelected: tintDark,
    primary: CoFiColors.accent,
    accent: CoFiColors.accent,
    success: CoFiColors.success,
    warning: CoFiColors.warning,
    destructive: CoFiColors.destructive,
    card: CoFiColors.dark.backgroundCard,
    border: CoFiColors.dark.border,
    muted: CoFiColors.dark.muted,
    mutedForeground: CoFiColors.dark.mutedForeground,
  },
};

/** Inter for body text, Poppins for headings. Loaded via expo-font in _layout. */
export const Fonts = Platform.select({
  ios: {
    sans: 'Inter_400Regular',
    sansSemiBold: 'Inter_600SemiBold',
    sansBold: 'Inter_700Bold',
    heading: 'Poppins_600SemiBold',
    headingBold: 'Poppins_700Bold',
    serif: 'ui-serif',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Inter_400Regular',
    sansSemiBold: 'Inter_600SemiBold',
    sansBold: 'Inter_700Bold',
    heading: 'Poppins_600SemiBold',
    headingBold: 'Poppins_700Bold',
    serif: 'serif',
    mono: 'monospace',
  },
  web: {
    sans: 'Inter_400Regular',
    sansSemiBold: 'Inter_600SemiBold',
    sansBold: 'Inter_700Bold',
    heading: 'Poppins_600SemiBold',
    headingBold: 'Poppins_700Bold',
    serif: "Georgia, 'Times New Roman', serif",
    mono: "SFMono-Regular, Menlo, Monaco, monospace",
  },
});

// Spacing & layout (consistent with dashboard)
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Border radius
export const Radius = {
  sm: 6,
  md: 10,
  lg: 12,
  xl: 16,
  full: 9999,
};

// Shadow presets – premium financial app, soft depth
export const Shadows = {
  card: {
    shadowColor: '#0a3d7a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardGold: {
    shadowColor: '#0a3d7a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
};

// Status badge colors (for application/loan status)
export const StatusColors = {
  approved: { bg: '#dcfce7', text: '#22c55e', border: '#86efac' },
  pending: { bg: '#fef3c7', text: '#f59e0b', border: '#fcd34d' },
  rejected: { bg: '#fee2e2', text: '#ef4444', border: '#fca5a5' },
  disbursed: { bg: '#ccfbf1', text: '#2ba894', border: '#5eead4' },
  submitted: { bg: '#dbeafe', text: '#0a3d7a', border: '#93c5fd' },
};
