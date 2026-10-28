import {
  isLiveNow,
  livePlotWithoutStatus,
  liveStartAt,
  liveStartTimeLabel,
  liveWhenLabel,
  liveWhenShort,
  sportAccentColor,
} from '../src/details/live';

describe('live helpers', () => {
  it('reads is_live', () => {
    expect(isLiveNow({is_live: '1'})).toBe(true);
    expect(isLiveNow({is_live: '0'})).toBe(false);
    expect(isLiveNow(undefined)).toBe(false);
  });

  it('finds a start time in the usual keys and formats', () => {
    expect(liveStartTimeLabel({kickoff: '21:45'})).toBe('21:45');
    expect(liveStartTimeLabel({time: 'oggi 9:05 CET'})).toBe('09:05');
    const epoch = Math.floor(new Date(2026, 9, 18, 20, 30).getTime() / 1000);
    expect(liveStartTimeLabel({start_unix: String(epoch)})).toBe('20:30');
    expect(liveStartTimeLabel({start: String(epoch * 1000)})).toBe('20:30');
    expect(liveStartTimeLabel({plot: 'x'})).toBeNull();
  });

  it('maps sport accents with a default', () => {
    expect(sportAccentColor('football')).toBe('#2E7D32');
    expect(sportAccentColor('curling')).toBe('#1A237E');
  });

  it('reads the start from the plot line and labels it relative to now', () => {
    const now = new Date(2026, 9, 25, 10, 0); // Sunday
    const at = liveStartAt({plot: 'Inizio: 25/10 12:00\nSerie A'}, now)!;
    expect(at.getHours()).toBe(12);
    expect(liveWhenLabel(at, now)).toBe('Oggi alle 12:00');
    expect(liveWhenLabel(new Date(2026, 9, 25, 10, 25), now)).toBe('Tra 25 min');
    expect(liveWhenLabel(new Date(2026, 9, 26, 15, 0), now)).toBe('Domani alle 15:00');
    expect(liveWhenLabel(new Date(2026, 9, 31, 18, 0), now)).toBe('Sabato alle 18:00');
    expect(liveWhenShort(new Date(2026, 9, 31, 18, 0), now)).toBe('Sab 18:00');
    expect(liveWhenShort(new Date(2026, 10, 2, 21, 0), now)).toBe('02/11 21:00');
    expect(liveWhenShort(new Date(2026, 9, 25, 9, 0), now)).toBe('In attesa');
    // A date seen at the turn of the year is next year's.
    const jan = liveStartAt({plot: 'Inizio: 02/01 20:00'}, new Date(2026, 11, 30))!;
    expect(jan.getFullYear()).toBe(2027);
  });

  it('drops the lines the status already shows', () => {
    expect(livePlotWithoutStatus('Inizio: 25/10 12:00\nIN DIRETTA\nDerby', true)).toBe('Derby');
    expect(livePlotWithoutStatus("IN DIRETTA · 63' (1-0)", true)).toBe("IN DIRETTA · 63' (1-0)");
    expect(livePlotWithoutStatus('Inizio: 25/10 12:00', false)).toBe('Inizio: 25/10 12:00');
  });
});

