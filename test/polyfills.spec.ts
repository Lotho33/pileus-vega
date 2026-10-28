import {decodeUtf8} from '../src/core/polyfills';

const {TextEncoder: NodeTextEncoder} = require('util');
const enc = (s: string): Uint8Array => new NodeTextEncoder().encode(s);

describe('decodeUtf8', () => {
  it('matches the native decoder on mixed text', () => {
    const text = 'Ciao è € 𝄞 日本 — ok';
    expect(decodeUtf8(enc(text))).toBe(text);
  });

  it('replaces invalid sequences unless fatal', () => {
    const bad = Uint8Array.of(0x61, 0xc3, 0x28, 0x62);
    expect(decodeUtf8(bad)).toBe('a�(b');
    expect(() => decodeUtf8(bad, true)).toThrow(TypeError);
  });

  it('rejects overlongs and surrogates', () => {
    expect(decodeUtf8(Uint8Array.of(0xe0, 0x80, 0xaf))).toBe('�');
    expect(decodeUtf8(Uint8Array.of(0xed, 0xa0, 0x80))).toBe('�');
  });

  it('handles long inputs', () => {
    const text = 'àbc'.repeat(10000);
    expect(decodeUtf8(enc(text))).toBe(text);
  });
});
