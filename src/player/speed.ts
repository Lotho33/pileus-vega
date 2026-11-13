// User-selectable playback speeds (pileus-player engine/playback_speed.dart):
// the same steps on every player. On-demand only — on a live stream the
// live-sync owns the position and the choice is hidden. Per player session:
// it carries across the episodes of one session, a new Play starts at 1×.

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** "Normale" for 1×, otherwise e.g. "1,25×". */
export function playbackSpeedLabel(speed: number): string {
  if (Math.abs(speed - 1) < 0.001) {
    return 'Normale';
  }
  const s = speed.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${s.replace('.', ',')}×`;
}
