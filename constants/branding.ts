/**
 * Shared branding assets (splash, auth hero, in-app logo).
 */

export const branding = {
  authHeroBackground: require('@/assets/images/authHerobg.png'),
  cofiLogo: require('@/assets/images/COFILogo.png'),
  /** Static native splash (pre-JS) — matches animated launcher first frame */
  launcherSplashImage: require('@/assets/images/launcher-splash.png'),
  /** Home screen + native init label */
  appDisplayName: 'Community Finance',
  /** Native splash + launcher base (matches custom launcher gradient start) */
  splashBackgroundColor: '#061528',
  launcherBackground: '#061528',
  launcherGradient: ['#061528', '#0a3d7a', '#0c4a94'] as const,
} as const;
