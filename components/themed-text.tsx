import { StyleSheet, Text, type TextProps } from 'react-native';

import { CoFiColors, Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';

/** Portal screens use a light canvas; default readable text on both OS themes. */
const PORTAL_TEXT = CoFiColors.foreground;

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

const f = Fonts;

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor(
    {
      light: lightColor ?? PORTAL_TEXT,
      dark: darkColor ?? PORTAL_TEXT,
    },
    'text'
  );

  return (
    <Text
      style={[
        { color },
        type === 'default' ? { ...styles.default, fontFamily: f.sans } : undefined,
        type === 'title' ? { ...styles.title, fontFamily: f.headingBold } : undefined,
        type === 'defaultSemiBold' ? { ...styles.defaultSemiBold, fontFamily: f.sansSemiBold } : undefined,
        type === 'subtitle' ? { ...styles.subtitle, fontFamily: f.heading } : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontSize: 32,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
});
