import {HEALTHY_AFTER_MS, LiveFailover} from '../src/player/liveFailover';

describe('LiveFailover', () => {
  it('tries each node once per bad stretch, wrapping around', () => {
    const f = new LiveFailover(['a', 'b', 'c'], 'b');
    expect(f.next()).toBe('c');
    expect(f.next()).toBe('a');
    expect(f.next()).toBeNull();
  });

  it('forgets failures after playing fine for a while', () => {
    let now = 0;
    const f = new LiveFailover(['a', 'b'], 'a', () => now);
    expect(f.next()).toBe('b');
    f.playing();
    now += HEALTHY_AFTER_MS;
    f.playing();
    expect(f.next()).toBe('a');
  });

  it('does nothing with a single node', () => {
    expect(new LiveFailover(['a'], 'a').next()).toBeNull();
  });
});
