/**
 * Portrait tablets must keep a persistent icon rail (bottom tabs are hidden).
 * These helpers mirror the orientation rules used by TabletNavSidebar / layouts.
 */

describe('tablet portrait sidebar', () => {
  const TABLET_MIN = 768;

  function layout(width: number, height: number) {
    const isLandscape = width > height;
    const isTablet = Math.min(width, height) >= TABLET_MIN;
    return {
      isTablet,
      isLandscape,
      showPersistentIconRail: isTablet,
      persistentCollapsed: isTablet ? (isLandscape ? false : true) : false,
      showHamburger: isTablet && !isLandscape,
      shellRow: isTablet,
    };
  }

  it('shows a collapsed icon rail in tablet portrait', () => {
    const portrait = layout(768, 1024);
    expect(portrait.isTablet).toBe(true);
    expect(portrait.isLandscape).toBe(false);
    expect(portrait.showPersistentIconRail).toBe(true);
    expect(portrait.persistentCollapsed).toBe(true);
    expect(portrait.showHamburger).toBe(true);
    expect(portrait.shellRow).toBe(true);
  });

  it('keeps an expandable rail in tablet landscape', () => {
    const landscape = layout(1024, 768);
    expect(landscape.isTablet).toBe(true);
    expect(landscape.isLandscape).toBe(true);
    expect(landscape.showPersistentIconRail).toBe(true);
    expect(landscape.persistentCollapsed).toBe(false);
    expect(landscape.showHamburger).toBe(false);
    expect(landscape.shellRow).toBe(true);
  });

  it('does not show a tablet rail on phones', () => {
    const phone = layout(390, 844);
    expect(phone.isTablet).toBe(false);
    expect(phone.showPersistentIconRail).toBe(false);
    expect(phone.shellRow).toBe(false);
  });
});
