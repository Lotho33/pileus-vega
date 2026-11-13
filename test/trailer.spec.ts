import {avatarCacheKey} from '../src/core/avatarCache';
import {openTrailer, trailerUris, youtubeIdOf} from '../src/core/trailer';
import {CatalogItem} from '../src/gen/media';
import {searchVariant} from '../src/home/model';
import {pickerValues} from '../src/components/AvatarPicker';
import {initialOf} from '../src/components/Avatar';
import {PLAYBACK_SPEEDS, playbackSpeedLabel} from '../src/player/speed';

describe('trailer', () => {
  it('finds the YouTube id in every link shape', () => {
    const id = 'dQw4w9WgXcQ';
    expect(youtubeIdOf(id)).toBe(id);
    expect(youtubeIdOf(`https://www.youtube.com/watch?v=${id}&t=10`)).toBe(id);
    expect(youtubeIdOf(`https://youtu.be/${id}`)).toBe(id);
    expect(youtubeIdOf(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(youtubeIdOf(`https://youtube.com/shorts/${id}`)).toBe(id);
    expect(youtubeIdOf('https://vimeo.com/123')).toBeNull();
    expect(youtubeIdOf('not a link')).toBeNull();
  });

  it('tries the YouTube app first, then the https link', async () => {
    expect(trailerUris('dQw4w9WgXcQ')).toEqual([
      'youtube://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ]);
    expect(trailerUris('https://vimeo.com/1')).toEqual(['https://vimeo.com/1']);
    expect(trailerUris('')).toEqual([]);
    const openURL = jest.fn().mockRejectedValueOnce(new Error('no app')).mockResolvedValueOnce(true);
    expect(await openTrailer('dQw4w9WgXcQ', {openURL})).toBe(true);
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(await openTrailer('', {openURL: jest.fn()})).toBe(false);
  });
});

describe('playback speed', () => {
  it('offers the six steps with Italian labels', () => {
    expect(PLAYBACK_SPEEDS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
    expect(PLAYBACK_SPEEDS.map(playbackSpeedLabel)).toEqual(['0,5×', '0,75×', 'Normale', '1,25×', '1,5×', '2×']);
  });
});

describe('profile avatars', () => {
  it('keys a mycelium photo without the host', () => {
    const lan = 'http://192.168.1.5:8080/profile-avatar/abc?v=3';
    const vpn = 'https://myc.example.ts.net/profile-avatar/abc?v=3';
    expect(avatarCacheKey(lan)).toBe('/profile-avatar/abc?v=3');
    expect(avatarCacheKey(vpn)).toBe(avatarCacheKey(lan));
    expect(avatarCacheKey('/profile-avatar/abc?x=1&v=4')).toBe('/profile-avatar/abc?v=4');
    expect(avatarCacheKey('https://image.tmdb.org/t/p/w185/x.jpg')).toBeNull();
  });

  it('offers the initial first only when creating a profile', () => {
    expect(pickerValues(true)[0]).toBe('');
    expect(pickerValues(true)).toHaveLength(11);
    expect(pickerValues(false)).toHaveLength(10);
    expect(pickerValues(false)).not.toContain('');
    expect(initialOf('  andrea')).toBe('A');
    expect(initialOf('')).toBe('?');
  });
});

describe('search layout', () => {
  const item = (mediaType: string) => CatalogItem.fromPartial({id: mediaType + Math.random(), mediaType});
  it('goes 16:9 when most results are live', () => {
    expect(searchVariant([item('live'), item('live'), item('movie')])).toBe('landscape');
    expect(searchVariant([item('live'), item('movie')])).toBe('poster');
    expect(searchVariant([])).toBe('poster');
  });
});
