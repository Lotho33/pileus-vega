// Subtitles drawn by the app instead of KeplerCaptionsView, which takes no
// styling at all: this implements Shaka's TextDisplayer interface
// (shaka.extern.TextDisplayer), keeps the cues and answers "what text is
// on screen at time t". PlayerScreen renders that with the profile's
// subtitle style (pileus-player's Preferenze › Sottotitoli).

export interface ShakaCue {
  startTime: number;
  endTime: number;
  payload: string;
  nestedCues?: ShakaCue[];
  lineBreak?: boolean;
}

function cueText(c: ShakaCue): string {
  if (c.lineBreak) {
    return '\n';
  }
  const own = (c.payload ?? '').replace(/<[^>]*>/g, '');
  const nested = (c.nestedCues ?? []).map(cueText).join('');
  return own + nested;
}

export class CueStore {
  private cues: ShakaCue[] = [];
  private visible = false;
  private listeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private changed() {
    this.listeners.forEach(cb => cb());
  }

  /** Text showing at `t` (seconds), '' when hidden or between cues. */
  textAt(t: number): string {
    if (!this.visible) {
      return '';
    }
    return this.cues
      .filter(c => c.startTime <= t && t < c.endTime)
      .map(cueText)
      .map(s => s.trim())
      .filter(Boolean)
      .join('\n');
  }

  // ── shaka.extern.TextDisplayer ──
  configure(_config: unknown) {}

  destroy(): Promise<void> {
    this.cues = [];
    this.changed();
    return Promise.resolve();
  }

  append(cues: ShakaCue[]) {
    const seen = new Set(this.cues.map(c => `${c.startTime}|${c.endTime}|${cueText(c)}`));
    for (const c of cues) {
      const key = `${c.startTime}|${c.endTime}|${cueText(c)}`;
      if (!seen.has(key)) {
        seen.add(key);
        this.cues.push(c);
      }
    }
    this.changed();
  }

  remove(startTime: number, endTime: number): boolean {
    this.cues = this.cues.filter(c => !(c.startTime >= startTime && c.endTime <= endTime));
    this.changed();
    return true;
  }

  isTextVisible(): boolean {
    return this.visible;
  }

  setTextVisibility(on: boolean) {
    this.visible = on;
    this.changed();
  }

  setTextLanguage(_language: string) {}

  enableTextDisplayer() {}
}
