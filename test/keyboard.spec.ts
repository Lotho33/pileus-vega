import {keyboardRows} from '../src/components/OnScreenKeyboard';

const labels = (rows: ReturnType<typeof keyboardRows>) => rows.map(r => r.map(k => k.label).join(' '));
const base = {shift: false, symbols: false, showEnter: true};

describe('keyboardRows', () => {
  it('pairing code is digits + A-Z only, no space or symbols', () => {
    const keys = keyboardRows('code', base).flat().map(k => k.label);
    const typed = keys.filter(k => k.length === 1 && k !== '⌫');
    expect(typed.join('')).toBe('1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(keys).not.toContain('Spazio');
    expect(keys).not.toContain('123');
  });

  it('search is locked to caps with no shift key and no Invio', () => {
    const rows = labels(keyboardRows('search', {...base, showEnter: false}));
    expect(rows[0]).toBe('A B C D E F G');
    expect(rows.join(' ')).not.toMatch(/⇧|Invio/);
  });

  it('text toggles case with shift and has a symbols layer', () => {
    expect(labels(keyboardRows('text', base))[0]).toBe('a b c d e f g');
    expect(labels(keyboardRows('text', {...base, shift: true}))[0]).toBe('A B C D E F G');
    expect(labels(keyboardRows('text', {...base, symbols: true}))[4]).toBe('ABC ⌫ Invio');
  });

  it('host starts with digits and has the URL punctuation', () => {
    const rows = labels(keyboardRows('host', base));
    expect(rows[0]).toBe('1 2 3 4 5 6 7 8 9 0');
    expect(rows[4]).toBe('. - : / ⌫ Invio');
  });
});
