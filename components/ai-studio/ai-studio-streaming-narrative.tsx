import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { NarrativeWithCitations } from '@/components/ai-studio/ai-studio-citations';
import { ThemedText } from '@/components/themed-text';
import { ClientUI } from '@/constants/client-ui';
import { Fonts } from '@/constants/theme';

type Props = {
  text: string;
  streaming?: boolean;
  onCitationPress?: (id: string) => void;
};

export function AiStudioStreamingNarrative({ text, streaming, onCitationPress }: Props) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (streaming) {
      opacity.value = withRepeat(withTiming(0.2, { duration: 500 }), -1, true);
    } else {
      opacity.value = withTiming(1, { duration: 200 });
    }
  }, [streaming, opacity]);

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.wrap}>
      <NarrativeWithCitations text={text} onCitationPress={onCitationPress} />
      {streaming ? (
        <Animated.View style={[styles.cursor, cursorStyle]}>
          <ThemedText style={styles.cursorText}>▍</ThemedText>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  cursor: { marginLeft: 2 },
  cursorText: { color: ClientUI.colors.primary, fontSize: 14, fontFamily: Fonts.mono },
});
