import {MAX_IDLE_MS, StillWatchingGuard, stillWatchingMessage} from '../src/player/stillWatching';

describe('StillWatchingGuard', () => {
  let now = 0;
  const guard = () => new StillWatchingGuard(() => now);
  beforeEach(() => {
    now = 1_000_000;
  });

  it('asks before the 4th episode in a row with no input', () => {
    const g = guard();
    expect(g.shouldAsk).toBe(false);
    g.noteAutoAdvance();
    expect(g.shouldAsk).toBe(false);
    g.noteAutoAdvance();
    expect(g.shouldAsk).toBe(true);
  });

  it('any input starts the count again', () => {
    const g = guard();
    g.noteAutoAdvance();
    g.noteAutoAdvance();
    g.noteInput();
    expect(g.shouldAsk).toBe(false);
  });

  it('asks after 90 minutes without input', () => {
    const g = guard();
    now += MAX_IDLE_MS - 1;
    expect(g.shouldAsk).toBe(false);
    now += 1;
    expect(g.shouldAsk).toBe(true);
  });

  it('names the series when known', () => {
    expect(stillWatchingMessage('')).toBe('Stai ancora guardando?');
    expect(stillWatchingMessage(' Naruto ')).toBe('Stai ancora guardando «Naruto»?');
  });
});
