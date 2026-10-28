jest.mock('@amazon-devices/react-native-async-storage__async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import {StreamSource} from '../src/gen/media';
import {
  AudioLangPref,
  chooseSource,
  languageBadge,
  languageNotice,
  languageOfLabel,
  matchAudioTrack,
  parsePreferredLanguage,
  preferredFirst,
  setLanguageProfile,
  sourceMemory,
  writePreferredLanguage,
} from '../src/core/language';

const src = (id: string, label: string) => StreamSource.fromPartial({id, label});
const ita = src('a', 'Italiano (Doppiato)');
const jap = src('b', 'Giapponese (Sub ITA)');

describe('language rule', () => {
  afterEach(() => setLanguageProfile(''));

  it('reads labels', () => {
    expect(languageOfLabel('Giapponese (Sub ITA)')).toBe('original');
    expect(languageOfLabel('Italiano')).toBe('it');
    expect(languageOfLabel('ITA')).toBe('it');
    expect(languageOfLabel('Inglese')).toBe('original');
    expect(languageOfLabel('Nodo 2')).toBeNull();
  });

  it('explicit, then remembered, then preferred, then first', () => {
    expect(chooseSource([ita, jap], {explicitLabel: 'giapponese (sub ita)'}).source).toBe(jap);
    expect(chooseSource([ita, jap], {rememberedLabel: 'Giapponese (Sub ITA)'}).source).toBe(jap);
    expect(chooseSource([jap, ita], {language: 'it'}).source).toBe(ita);
    expect(chooseSource([jap], {language: 'it'})).toEqual({source: jap, usedFallback: true});
    const nodes = [src('n1', 'Nodo 1'), src('n2', 'Nodo 2')];
    expect(chooseSource(nodes, {language: 'original'})).toEqual({source: nodes[0], usedFallback: false});
  });

  it('puts the pick first, using the series memory per profile', () => {
    expect(preferredFirst([jap, ita], {language: 'it'})).toEqual([ita, jap]);
    setLanguageProfile('p1');
    sourceMemory.remember('pl', 's1', jap.label);
    sourceMemory.remember('pl', 's1', 'Nodo 1'); // not a language: ignored
    expect(preferredFirst([ita, jap], {pluginId: 'pl', seriesId: 's1', language: 'it'})).toEqual([jap, ita]);
    setLanguageProfile('p2');
    expect(sourceMemory.labelFor('pl', 's1')).toBe('');
  });

  it('says when only another language exists', () => {
    expect(languageNotice([src('e', 'Inglese')], src('e', 'Inglese'), 'it')).toBe('Disponibile solo in inglese');
    expect(languageNotice([ita, jap], ita, 'it')).toBe('');
  });

  it('round-trips the profile blob keeping other blocks', () => {
    const json = writePreferredLanguage(JSON.stringify({subtitles: {fontSize: 40}}), 'original');
    expect(parsePreferredLanguage(json)).toBe('original');
    expect(JSON.parse(json).subtitles.fontSize).toBe(40);
    expect(parsePreferredLanguage('')).toBe('it');
    expect(parsePreferredLanguage('{bad')).toBe('it');
  });

  it('badges', () => {
    expect(languageBadge('jap')?.label).toBe('JAP');
    expect(languageBadge('eng', 'ita')?.label).toBe('ENG · SUB ITA');
    expect(languageBadge('both')).toBeNull();
  });
});

describe('audio track memory', () => {
  const tracks = [
    {id: '1', label: 'ITA · Italian', active: true},
    {id: '2', label: 'JPN · Japanese', active: false},
  ];

  it('matches whole language tokens only', () => {
    expect(matchAudioTrack(tracks, 'JPN')?.id).toBe('2');
    expect(matchAudioTrack(tracks, 'JP')).toBeNull();
  });

  it('anchors the series on what plays first, then follows explicit picks', () => {
    setLanguageProfile('p1');
    let scope = {pluginId: 'pl', seriesId: 'show'};
    const pref = new AudioLangPref(() => scope);
    expect(pref.pick(tracks)).toBeNull(); // anchors ITA
    pref.remember('JPN · Japanese');
    pref.reset();
    expect(pref.pick(tracks)?.id).toBe('2');
    scope = {pluginId: 'pl', seriesId: 'other'};
    pref.reset();
    // Another series falls back to the profile's last pick.
    expect(pref.pick(tracks)?.id).toBe('2');
    setLanguageProfile('');
  });
});
