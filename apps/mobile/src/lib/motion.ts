// Motion tokens (DESIGN.md › Motion) and the "reduce motion" preference.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, Platform } from 'react-native';

export const ease = Easing.bezier(0.22, 1, 0.36, 1);

export const durations = {
  flip: 70,
  focus: 180,
  rise: 380,
  stagger: 60,
  tear: 500,
  timeline: 600,
  reduced: 150,
};

/** The browser animates styles itself; the native driver only exists on phones. */
export const nativeDriver = Platform.OS !== 'web';

/** True when the person asked their phone or browser for less motion: animations become a short fade. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
