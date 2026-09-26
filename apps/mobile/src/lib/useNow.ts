import { useEffect, useState } from 'react';

/** Current time, refreshed every `everyMs`, so screens can compare with "now" without impure renders. */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
