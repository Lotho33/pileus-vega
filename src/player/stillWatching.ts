// "Stai ancora guardando?" (pileus-player's features/player/still_watching.dart).
// Episodes that start by themselves keep a screen nobody is watching
// streaming all night, and mycelium proxying it. So at an episode boundary
// the player asks first when, since the last key press, MAX_EPISODES
// episodes have played back to back or MAX_IDLE_MS has gone by. It never
// interrupts an episode or a film midway.

export const MAX_EPISODES = 3;
export const MAX_IDLE_MS = 90 * 60 * 1000;

export class StillWatchingGuard {
  private lastInput: number;
  // Episodes started since the last input, the one playing included.
  private episodes = 1;

  constructor(private readonly now: () => number = Date.now) {
    this.lastInput = now();
  }

  /** A key press: someone is there. */
  noteInput() {
    this.lastInput = this.now();
    this.episodes = 1;
  }

  /** The countdown is about to start the next episode by itself: true to ask first. */
  get shouldAsk(): boolean {
    return this.episodes >= MAX_EPISODES || this.now() - this.lastInput >= MAX_IDLE_MS;
  }

  /** The next episode started by itself. */
  noteAutoAdvance() {
    this.episodes++;
  }
}

/** The prompt's text: with the series' name when known. */
export function stillWatchingMessage(showTitle: string | undefined): string {
  const t = (showTitle ?? '').trim();
  return t ? `Stai ancora guardando «${t}»?` : 'Stai ancora guardando?';
}
