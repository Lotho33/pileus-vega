// Automatic move to the next node of a live event when the one playing fails
// for good (resolve failed, or a playback error that outlived its grace
// window) — pileus-player's live_failover.dart. The manual "Sorgente" pick
// stays; this only decides what happens on failure.
//
// Each node is tried once per bad stretch: a failed node isn't tried again
// until the stream has played fine for HEALTHY_AFTER_MS (then every node is
// fair game again). When every node has failed, next() returns null and the
// screen shows its error as before.

export const HEALTHY_AFTER_MS = 60_000;

export class LiveFailover {
  private current: number;
  private readonly failed = new Set<number>();
  private healthySince: number | null = null;

  constructor(
    /** The event's node stream ids, in the plugin's order. */
    readonly sources: string[],
    current: string,
    private readonly now: () => number = Date.now,
  ) {
    this.current = sources.indexOf(current);
  }

  get enabled(): boolean {
    return this.sources.length > 1;
  }

  /** The user (or the screen) switched to `streamId` — follow it. */
  switchedTo(streamId: string) {
    const i = this.sources.indexOf(streamId);
    if (i >= 0) {
      this.current = i;
    }
    this.healthySince = null;
  }

  /** A position tick: clears the failed set once playback has held a while. */
  playing() {
    if (this.healthySince === null) {
      this.healthySince = this.now();
    }
    if (this.failed.size && this.now() - this.healthySince >= HEALTHY_AFTER_MS) {
      this.failed.clear();
    }
  }

  /** The current node failed: the next one not yet failed, or null. */
  next(): string | null {
    this.healthySince = null;
    if (!this.enabled) {
      return null;
    }
    if (this.current >= 0) {
      this.failed.add(this.current);
    }
    const base = this.current < 0 ? -1 : this.current;
    for (let k = 1; k <= this.sources.length; k++) {
      const i = (base + k) % this.sources.length;
      if (!this.failed.has(i)) {
        this.current = i;
        return this.sources[i];
      }
    }
    return null;
  }
}
