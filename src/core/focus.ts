import {useCallback, useRef} from 'react';

// Explicit D-pad focus on Vega. hasTVPreferredFocus alone loses races: when
// a focused view is unmounted or a panel opens over it, the native engine
// reassigns focus on its own (it picked off-screen carousel cards), so
// panels and rows move focus themselves with Vega's requestTVFocus command,
// which View/Pressable refs carry at runtime (untyped in the SDK).

interface TVFocusable {
  requestTVFocus?: () => void;
  focus?: () => void;
}

export function requestFocus(target: unknown): boolean {
  const t = target as TVFocusable | null | undefined;
  if (!t) {
    return false;
  }
  if (t.requestTVFocus) {
    t.requestTVFocus();
  } else {
    t.focus?.();
  }
  return true;
}

/**
 * Focuses the view `get()` returns once the current commit has landed, and
 * once more a beat later in case the native engine reassigned focus after
 * it. Returns a cancel function (use it as an effect cleanup).
 */
export function focusSoon(get: () => unknown): () => void {
  const first = setTimeout(() => requestFocus(get()), 0);
  const again = setTimeout(() => requestFocus(get()), 60);
  return () => {
    clearTimeout(first);
    clearTimeout(again);
  };
}

/** How long focus events stay suspect after a covering view went away. */
export const SETTLE_MS = 300;

/**
 * True while `blocked` (a popup, the player, a panel is over this view) and
 * for SETTLE_MS after it ends: the native engine reassigns focus when the
 * covering view unmounts, often to a random off-screen card or episode,
 * and that focus must not move rows or "remembered" positions. The view
 * then puts focus back itself.
 */
export function useFocusGate(blocked: boolean): () => boolean {
  const blockedRef = useRef(blocked);
  const until = useRef(0);
  if (blockedRef.current && !blocked) {
    until.current = Date.now() + SETTLE_MS;
  }
  blockedRef.current = blocked;
  return useCallback(() => blockedRef.current || Date.now() < until.current, []);
}
