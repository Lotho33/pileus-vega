import {CueStore} from '../src/player/subtitles';

describe('CueStore', () => {
  it('shows the cues active at t, flattening nested cues and line breaks', () => {
    const s = new CueStore();
    s.append([
      {startTime: 1, endTime: 3, payload: '', nestedCues: [{startTime: 1, endTime: 3, payload: 'Ciao'}, {startTime: 1, endTime: 3, payload: '', lineBreak: true}, {startTime: 1, endTime: 3, payload: '<i>mondo</i>'}]},
      {startTime: 2, endTime: 4, payload: 'Secondo'},
    ]);
    expect(s.textAt(2)).toBe('');
    s.setTextVisibility(true);
    expect(s.textAt(0.5)).toBe('');
    expect(s.textAt(1.5)).toBe('Ciao\nmondo');
    expect(s.textAt(2.5)).toBe('Ciao\nmondo\nSecondo');
    expect(s.textAt(3.5)).toBe('Secondo');
  });

  it('ignores duplicates and removes ranges', () => {
    const s = new CueStore();
    s.setTextVisibility(true);
    s.append([{startTime: 1, endTime: 2, payload: 'A'}]);
    s.append([{startTime: 1, endTime: 2, payload: 'A'}]);
    expect(s.textAt(1.5)).toBe('A');
    s.remove(0, 10);
    expect(s.textAt(1.5)).toBe('');
  });
});
