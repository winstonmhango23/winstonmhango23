import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type TabletNavContextValue = {
  isTablet: boolean;
  isLandscape: boolean;
  /** Portrait tablet: hamburger opens labeled drawer (icon rail stays visible). */
  showHamburger: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  railCollapsed: boolean;
  toggleRailCollapsed: () => void;
};

const TabletNavContext = createContext<TabletNavContextValue | null>(null);

export function TabletNavProvider({ children }: { children: React.ReactNode }) {
  const { isTablet, isLandscape } = useResponsiveLayout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Landscape starts expanded; portrait always uses the collapsed icon rail.
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    if (isLandscape || !isTablet) setDrawerOpen(false);
  }, [isLandscape, isTablet]);

  useEffect(() => {
    if (isTablet && !isLandscape) setRailCollapsed(true);
  }, [isTablet, isLandscape]);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleRailCollapsed = useCallback(() => setRailCollapsed((v) => !v), []);

  const value = useMemo(
    () => ({
      isTablet,
      isLandscape,
      showHamburger: isTablet && !isLandscape,
      drawerOpen,
      openDrawer,
      closeDrawer,
      railCollapsed,
      toggleRailCollapsed,
    }),
    [
      isTablet,
      isLandscape,
      drawerOpen,
      openDrawer,
      closeDrawer,
      railCollapsed,
      toggleRailCollapsed,
    ]
  );

  return <TabletNavContext.Provider value={value}>{children}</TabletNavContext.Provider>;
}

export function useTabletNav(): TabletNavContextValue {
  const ctx = useContext(TabletNavContext);
  if (!ctx) {
    return {
      isTablet: false,
      isLandscape: false,
      showHamburger: false,
      drawerOpen: false,
      openDrawer: () => undefined,
      closeDrawer: () => undefined,
      railCollapsed: false,
      toggleRailCollapsed: () => undefined,
    };
  }
  return ctx;
}
