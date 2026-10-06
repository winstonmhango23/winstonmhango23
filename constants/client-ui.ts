/**
 * Client (borrower) UI design tokens — premium banking experience.
 * Extends the global CoFi theme with client-specific layout and chrome.
 */

import { CoFiColors, Radius, Shadows, Spacing } from '@/constants/theme';

export const ClientUI = {
  colors: {
    canvas: '#f4f6fa',
    surface: '#ffffff',
    surfaceMuted: '#f8fafc',
    primary: CoFiColors.primary,
    primaryDeep: CoFiColors.primaryDark,
    accent: CoFiColors.accent,
    accentSoft: 'rgba(230, 184, 0, 0.14)',
    primarySoft: 'rgba(10, 61, 122, 0.08)',
    border: '#e8ecf2',
    borderLight: '#f0f3f8',
    text: CoFiColors.foreground,
    textMuted: CoFiColors.mutedForeground,
    textSubtle: '#94a3b8',
    success: CoFiColors.success,
    warning: CoFiColors.warning,
    danger: CoFiColors.destructive,
    heroGradientTop: '#0a3d7a',
    heroGradientBottom: '#061528',
    /** Refined header top accent — professional blue, not bright gold */
    headerAccentStart: '#6eb3f2',
    headerAccentMid: '#3d7ab8',
    headerAccentEnd: '#1a4a7a',
    headerEdgeLine: 'rgba(255,255,255,0.14)',
    tabBar: '#ffffff',
    tabBarBorder: '#e8ecf2',
    tabActive: CoFiColors.primary,
    tabInactive: '#94a3b8',
  },
  spacing: Spacing,
  radius: {
    ...Radius,
    card: 18,
    pill: 999,
    hero: 22,
  },
  shadows: {
    card: Shadows.card,
    hero: {
      shadowColor: '#061528',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 8,
    },
    action: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    actionPressed: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    tab: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 12,
    },
  },
  typography: {
    heroAmount: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
    sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
    cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
    caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
    overline: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600' as const,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
  },
} as const;
