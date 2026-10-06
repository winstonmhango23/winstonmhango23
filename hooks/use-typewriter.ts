import { useEffect, useState } from 'react';

/** Reveals text left-to-right, one character at a time. */
export function useTypewriter(text: string, speedMs = 80, startDelayMs = 700) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setVisibleCount(0);
    setDone(false);

    let interval: ReturnType<typeof setInterval> | undefined;

    const startTimer = setTimeout(() => {
      interval = setInterval(() => {
        setVisibleCount((prev) => {
          if (prev >= text.length) return prev;
          const next = prev + 1;
          if (next >= text.length) {
            if (interval) clearInterval(interval);
            setDone(true);
          }
          return next;
        });
      }, speedMs);
    }, startDelayMs);

    return () => {
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
    };
  }, [text, speedMs, startDelayMs]);

  return {
    text: text.slice(0, visibleCount),
    done,
    progress: text.length > 0 ? visibleCount / text.length : 0,
  };
}
