import { useEffect, useState } from 'react';

interface SequentialTypewriterOptions {
  speedMs?: number;
  startDelayMs?: number;
  pauseBetweenMs?: number;
  loop?: boolean;
}

/**
 * Types each line in order, pauses, then advances to the next slogan.
 */
export function useSequentialTypewriter(
  lines: readonly string[],
  {
    speedMs = 38,
    startDelayMs = 620,
    pauseBetweenMs = 480,
    loop = true,
  }: SequentialTypewriterOptions = {}
) {
  const [lineIndex, setLineIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [lineDone, setLineDone] = useState(false);

  const currentLine = lines[lineIndex] ?? '';
  const displayText = currentLine.slice(0, visibleCount);
  const isTyping = started && !lineDone;

  useEffect(() => {
    setLineIndex(0);
    setVisibleCount(0);
    setStarted(false);
    setLineDone(false);

    if (lines.length === 0) return;

    const startTimer = setTimeout(() => setStarted(true), startDelayMs);
    return () => clearTimeout(startTimer);
  }, [lines, startDelayMs]);

  useEffect(() => {
    if (!started || lineDone || lines.length === 0) return;

    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= currentLine.length) return prev;
        const next = prev + 1;
        if (next >= currentLine.length) {
          setLineDone(true);
        }
        return next;
      });
    }, speedMs);

    return () => clearInterval(interval);
  }, [started, lineDone, currentLine, lines.length, speedMs]);

  useEffect(() => {
    if (!lineDone || lines.length === 0) return;

    const hasNext = lineIndex < lines.length - 1;
    if (!hasNext && !loop) return;

    const advanceTimer = setTimeout(() => {
      setLineIndex((prev) => {
        if (prev < lines.length - 1) return prev + 1;
        return loop ? 0 : prev;
      });
      setVisibleCount(0);
      setLineDone(false);
    }, pauseBetweenMs);

    return () => clearTimeout(advanceTimer);
  }, [lineDone, lineIndex, lines.length, loop, pauseBetweenMs]);

  return {
    text: displayText,
    lineIndex,
    isTyping,
    started,
  };
}
