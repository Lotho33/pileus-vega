// Full-bleed fanart + metadata column of the focused card. Port of the hero
// half of _StandardHomeShell (shell.dart) and HomeHeroBackground.

import React, {memo, useEffect, useState} from 'react';
import {Animated, Image, StyleSheet, Text, View} from 'react-native';
import {Gradient} from '../components/Gradient';
import {backdropSrc, posterSrc} from '../core/images';
import {logoRenderSize, logoUrlOnly} from '../core/logo';
import {colors, scaledStyles} from '../theme';
import type {HomeLayout} from './layout';
import type {HeroItem} from './model';

// TMDB logos are linked at /original (often 2000+ px PNGs): ask for a
// rendition about as wide as the logo box, as meta_zone.dart's posterSrc.
const logoSrc = (logo: string, L: HomeLayout) => posterSrc(logoUrlOnly(logo), L.metaW * 0.65);

/** URLs the hero will display for `item`, so callers can prefetch them. */
export function heroImageUrls(item: HeroItem, L: HomeLayout): string[] {
  const out: string[] = [];
  if (item.background) {
    out.push(backdropSrc(item.background, Math.round(L.W)));
  }
  if (item.logo) {
    out.push(logoSrc(item.logo, L));
  }
  return out;
}

/**
 * The title logo: invisible until decoded, then shown at once (no fade, as
 * meta_zone.dart's _LogoWidget); the title text if it fails (e.g. an SVG,
 * which Image can't decode).
 */
function HeroLogo({item, L}: {item: HeroItem; L: HomeLayout}) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>('loading');
  if (state === 'failed') {
    return <HeroTitle item={item} L={L} />;
  }
  const size = logoRenderSize(item.logo, L.metaW * 0.65, L.zTitleH, L.metaW * 0.65);
  return (
    <Image
      source={{uri: logoSrc(item.logo, L)}}
      style={[{width: size.w, height: size.h}, state !== 'ok' && styles.hidden]}
      resizeMode="contain"
      onLoad={() => setState('ok')}
      onError={() => setState('failed')}
    />
  );
}

function HeroTitle({item, L}: {item: HeroItem; L: HomeLayout}) {
  return (
    <Text style={[styles.title, {fontSize: L.titleFs, lineHeight: L.titleFs * 1.1}]} numberOfLines={2}>
      {item.title}
    </Text>
  );
}

interface Layer {
  url: string;
  opacity: Animated.Value;
}

/**
 * Fanart stack: a new image is added on top at opacity 0 and fades in only
 * once it has loaded; the ones below are dropped after. Layers keep their
 * key and position, so nothing already on screen remounts (which is what
 * made the old prev/cur pair blink on every change).
 */
const HeroBackground = memo(function HeroBackground({url, W}: {url: string; W: number}) {
  const [layers, setLayers] = useState<Layer[]>([]);

  useEffect(() => {
    setLayers(ls => {
      if (!url) {
        return [];
      }
      if (ls.length && ls[ls.length - 1].url === url) {
        return ls;
      }
      // A fanart still in the stack (already loaded, so onLoad won't fire
      // again) comes back on its own instead of as a new layer.
      const kept = ls.find(l => l.url === url);
      if (kept) {
        return [kept];
      }
      return [...ls, {url, opacity: new Animated.Value(0)}];
    });
  }, [url]);

  const onLoad = (layer: Layer) => {
    Animated.timing(layer.opacity, {toValue: 1, duration: 260, useNativeDriver: true}).start(({finished}) => {
      if (finished) {
        setLayers(ls => {
          const i = ls.indexOf(layer);
          return i > 0 ? ls.slice(i) : ls;
        });
      }
    });
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {layers.map(layer => (
        <Animated.Image
          key={layer.url}
          source={{uri: backdropSrc(layer.url, Math.round(W))}}
          style={[StyleSheet.absoluteFill, {opacity: layer.opacity}]}
          resizeMode="cover"
          onLoad={() => onLoad(layer)}
          onError={() => setLayers(ls => ls.filter(l => l !== layer))}
        />
      ))}
    </View>
  );
});

function MetaChips({item, L}: {item: HeroItem; L: HomeLayout}) {
  const parts: React.ReactNode[] = [];
  if (item.year > 0) {
    parts.push(
      <Text key="y" style={[styles.chip, {fontSize: L.metaFs}]}>
        {item.year}
      </Text>,
    );
  }
  if (item.rating > 0) {
    if (parts.length) {
      parts.push(
        <Text key="d" style={[styles.dot, {fontSize: L.metaFs}]}>
          ·
        </Text>,
      );
    }
    parts.push(
      <Text key="r" style={[styles.chip, {fontSize: L.metaFs}]}>
        <Text style={styles.star}>★ </Text>
        {item.rating.toFixed(1)}
      </Text>,
    );
  }
  return <View style={styles.metaRow}>{parts}</View>;
}

export const Hero = memo(function Hero({item, L}: {item: HeroItem | null; L: HomeLayout}) {
  const left = L.hPad;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <HeroBackground url={item?.background ?? ''} W={L.W} />
      {/* Same three layers as shell.dart / HomeHeroBackground. */}
      <Gradient name="heroFade" direction="toBottom" />
      <Gradient name="heroVignette" direction="toRight" />
      <Gradient name="heroMeta" direction="toRight" style={{width: L.W * 0.55}} />
      {item ? (
        <>
          <View style={[styles.abs, {left, top: L.metaTop, width: L.metaW, height: L.zTitleH}]}>
            {item.logo ? <HeroLogo key={item.logo} item={item} L={L} /> : <HeroTitle item={item} L={L} />}
          </View>
          <View style={[styles.abs, {left, top: L.tMeta, width: L.metaW, height: L.zMetaH}]}>
            <MetaChips item={item} L={L} />
          </View>
          <View style={[styles.abs, styles.genres, {left, top: L.tGenres, width: L.metaW}]}>
            {item.genres.map(g => (
              <View
                key={g}
                style={[
                  styles.genre,
                  {paddingHorizontal: L.H * (9 / 1080), paddingVertical: L.H * (3 / 1080)},
                ]}>
                <Text style={[styles.genreText, {fontSize: L.genreFs}]}>{g}</Text>
              </View>
            ))}
          </View>
          {item.plot ? (
            <Text
              style={[
                styles.abs,
                styles.plot,
                {
                  left,
                  top: L.tPlot,
                  width: L.metaW * 0.8,
                  fontSize: L.plotFs,
                  lineHeight: L.plotFs * 1.5,
                },
              ]}
              numberOfLines={L.plotLines}>
              {item.plot}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
});

const styles = scaledStyles({
  abs: {position: 'absolute', justifyContent: 'center'},
  hidden: {opacity: 0},
  title: {color: colors.textHigh, fontWeight: '900', letterSpacing: -0.5},
  metaRow: {flexDirection: 'row', alignItems: 'center'},
  chip: {color: colors.textHigh, fontWeight: '600'},
  star: {color: '#FFD700'},
  dot: {color: colors.textMid, marginHorizontal: 10},
  // abs centers vertically; in a row that would center the chips across.
  genres: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 6},
  genre: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(242,242,240,0.10)',
  },
  genreText: {color: colors.textMid, letterSpacing: 0.2},
  plot: {color: 'rgba(242,242,240,0.65)'},
});
