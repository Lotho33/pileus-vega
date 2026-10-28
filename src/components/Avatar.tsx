import React from 'react';
import {Image, View} from 'react-native';
import {SvgXml} from '@amazon-devices/react-native-svg';
import {colors, scaledStyles} from '../theme';
import {Gradient, GradientName} from './Gradient';

// pileus-player's kDefaultAvatars (shared/widgets/default_avatars.dart): a
// Material "round" icon on a diagonal gradient of its colour. The avatar is
// stored as "avatar://<index>"; any other URL is an image. Icon markup from
// Google's Material Icons (Apache 2.0), 24×24 viewBox.
// Colours live in gradients/defs.json too (avatar0…avatar9 ramps).
const AVATARS: {color: string; svg: string}[] = [
  {
    // face_rounded
    color: '#7C6AF7',
    svg: '<path d="M10.25 13a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0zM15 11.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5zm7 .25c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2s10 4.48 10 10zm-2 0c0-.78-.12-1.53-.33-2.24-.7.15-1.42.24-2.17.24a10 10 0 0 1-7.76-3.69A10.016 10.016 0 0 1 4 11.86c.01.04 0 .09 0 .14 0 4.41 3.59 8 8 8s8-3.59 8-8z"/>',
  },
  {
    // pets_rounded
    color: '#f97316',
    svg: '<circle cx="4.5" cy="9.5" r="2.5"/><circle cx="9" cy="5.5" r="2.5"/><circle cx="15" cy="5.5" r="2.5"/><circle cx="19.5" cy="9.5" r="2.5"/><path d="M17.34 14.86c-.87-1.02-1.6-1.89-2.48-2.91-.46-.54-1.05-1.08-1.75-1.32-.11-.04-.22-.07-.33-.09-.25-.04-.52-.04-.78-.04s-.53 0-.79.05c-.11.02-.22.05-.33.09-.7.24-1.28.78-1.75 1.32-.87 1.02-1.6 1.89-2.48 2.91-1.31 1.31-2.92 2.76-2.62 4.79.29 1.02 1.02 2.03 2.33 2.32.73.15 3.06-.44 5.54-.44h.18c2.48 0 4.81.58 5.54.44 1.31-.29 2.04-1.31 2.33-2.32.31-2.04-1.3-3.49-2.61-4.8z"/>',
  },
  {
    // rocket_launch_rounded
    color: '#38bdf8',
    svg: '<path d="M9.19 6.35c-2.04 2.29-3.44 5.58-3.57 5.89l-2.26-.97c-.65-.28-.81-1.13-.31-1.63l3.01-3.01c.47-.47 1.15-.68 1.81-.55l1.32.27zm1.49 10.16c.3.3.74.38 1.12.2 1.16-.54 3.65-1.81 5.26-3.42 4.59-4.59 4.63-8.33 4.36-9.93a.979.979 0 0 0-.79-.79c-1.6-.27-5.34-.23-9.93 4.36-1.61 1.61-2.87 4.1-3.42 5.26-.18.38-.09.83.2 1.12l3.2 3.2zm6.97-1.7c-2.29 2.04-5.58 3.44-5.89 3.57l.97 2.26c.28.65 1.13.81 1.63.31l3.01-3.01c.47-.47.68-1.15.55-1.81l-.27-1.32zm-8.71 2.6a3 3 0 0 1-.82 2.71c-.77.77-3.16 1.34-4.71 1.64-.69.13-1.3-.48-1.17-1.17.3-1.55.86-3.94 1.64-4.71a3 3 0 0 1 2.71-.82c1.17.22 2.13 1.18 2.35 2.35zM13 9c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"/>',
  },
  {
    // movie_rounded
    color: '#ef4444',
    svg: '<path d="m18 4 1.82 3.64c.08.16-.04.36-.22.36h-1.98c-.38 0-.73-.21-.89-.55L15 4h-2l1.82 3.64c.08.16-.04.36-.22.36h-1.98c-.38 0-.73-.21-.89-.55L10 4H8l1.82 3.64c.08.16-.04.36-.22.36H7.62c-.38 0-.73-.21-.9-.55L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-.55-.45-1-1-1h-3z"/>',
  },
  {
    // sports_esports_rounded
    color: '#22c55e',
    svg: '<path d="m21.58 16.09-1.09-7.66A3.996 3.996 0 0 0 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66a2.545 2.545 0 0 0 4.32 2.16L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>',
  },
  {
    // star_rounded
    color: '#f59e0b',
    svg: '<path d="m12 17.27 4.15 2.51c.76.46 1.69-.22 1.49-1.08l-1.1-4.72 3.67-3.18c.67-.58.31-1.68-.57-1.75l-4.83-.41-1.89-4.46c-.34-.81-1.5-.81-1.84 0L9.19 8.63l-4.83.41c-.88.07-1.24 1.17-.57 1.75l3.67 3.18-1.1 4.72c-.2.86.73 1.54 1.49 1.08l4.15-2.5z"/>',
  },
  {
    // local_fire_department_rounded
    color: '#dc2626',
    svg: '<path d="m12 12.9-2.03 2c-.46.46-.82 1.03-.93 1.67C8.74 18.41 10.18 20 12 20s3.26-1.59 2.96-3.42c-.11-.64-.46-1.22-.93-1.67L12 12.9z"/><path d="M15.56 6.55C14.38 8.02 12 7.19 12 5.3V3.77c0-.8-.89-1.28-1.55-.84C8.12 4.49 4 7.97 4 13c0 2.92 1.56 5.47 3.89 6.86a4.86 4.86 0 0 1-.81-3.68c.19-1.04.75-1.98 1.51-2.72l2.71-2.67c.39-.38 1.01-.38 1.4 0l2.73 2.69c.74.73 1.3 1.65 1.48 2.68.25 1.36-.07 2.64-.77 3.66 1.89-1.15 3.29-3.06 3.71-5.3.61-3.27-.81-6.37-3.22-8.1-.33-.25-.8-.2-1.07.13z"/>',
  },
  {
    // emoji_events_rounded
    color: '#a855f7',
    svg: '<path d="M19 5h-2V4c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1v1H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H8c-.55 0-1 .45-1 1s.45 1 1 1h8c.55 0 1-.45 1-1s-.45-1-1-1h-3v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>',
  },
  {
    // music_note_rounded
    color: '#ec4899',
    svg: '<path d="M12 5v8.55c-.94-.54-2.1-.75-3.33-.32-1.34.48-2.37 1.67-2.61 3.07a4.007 4.007 0 0 0 4.59 4.65c1.96-.31 3.35-2.11 3.35-4.1V7h2c1.1 0 2-.9 2-2s-.9-2-2-2h-2c-1.1 0-2 .9-2 2z"/>',
  },
  {
    // eco_rounded
    color: '#14b8a6',
    svg: '<path d="M6.05,8.05c-2.73,2.73-2.73,7.15-0.02,9.88c1.47-3.4,4.09-6.24,7.36-7.93c-2.77,2.34-4.71,5.61-5.39,9.32 c2.6,1.23,5.8,0.78,7.95-1.37c2.99-2.99,3.83-11.14,4.01-13.38c0.02-0.31-0.23-0.56-0.53-0.53C17.19,4.22,9.04,5.06,6.05,8.05z"/>',
  },
];

const SCHEME = 'avatar://';
export const AVATAR_COUNT = AVATARS.length;
export const avatarUrl = (i: number) => `${SCHEME}${i}`;

export function avatarIndex(url: string): number {
  const n = parseInt(url.slice(SCHEME.length), 10) || 0;
  return Math.min(Math.max(n, 0), AVATARS.length - 1);
}

export function Avatar({name, url, size}: {name: string; url: string; size: number}) {
  const box = {width: size, height: size, borderRadius: size / 2};
  if (url && !url.startsWith(SCHEME)) {
    return <Image accessibilityLabel={name} source={{uri: url}} style={[box, styles.image]} />;
  }
  const idx = url ? avatarIndex(url) : 0;
  const a = AVATARS[idx];
  // A top→bottom gradient turned 45°, oversized to cover the circle:
  // Flutter's topLeft→bottomRight.
  const d = size * Math.SQRT2;
  const icon = size * 0.5;
  return (
    <View accessibilityLabel={name} style={[box, styles.clip]}>
      <View
        style={{
          position: 'absolute',
          width: d,
          height: d,
          left: (size - d) / 2,
          top: (size - d) / 2,
          transform: [{rotate: '-45deg'}],
        }}>
        <Gradient name={`avatar${idx}` as GradientName} direction="toBottom" />
      </View>
      <SvgXml
        xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff">${a.svg}</svg>`}
        width={icon}
        height={icon}
      />
    </View>
  );
}

const styles = scaledStyles({
  image: {backgroundColor: colors.surface2},
  clip: {overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg},
});
