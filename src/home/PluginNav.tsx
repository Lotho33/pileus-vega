// Side panel listing the plugins (pileus-player widgets/plugin_nav.dart):
// opened with ← from a row's first card, closed with →/Back or by picking.
// Focus is trapped inside while it's open: ← at its edge does nothing.

import React, {forwardRef, memo, useEffect, useRef, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import AsyncStorage from '@amazon-devices/react-native-async-storage__async-storage';
import {SvgXml} from '@amazon-devices/react-native-svg';
import {ICON_ASPECT, ICON_SVG, WORDMARK_ASPECT, WORDMARK_SVG} from '../assets/branding';
import {Gradient} from '../components/Gradient';
import {Icon, IconName} from '../components/Icon';
import {mycelium} from '../core/api';
import {focusSoon} from '../core/focus';
import type {PluginInfo} from '../gen/media';
import {monochromeSvg} from '../core/svgMono';
import {colors, scaledStyles} from '../theme';
import type {HomeLayout} from './layout';

// /plugin-icon/{id} bodies, already monochrome; '' = server has none. Kept
// on disk too: fetched on every launch, the icons popped in a moment after
// the nav. The disk copy is read as soon as this module loads (the app's
// start), shown first, and checked against the server once per session.
const ICON_KEY = 'pileus.pluginIcons.v1';
const iconCache = new Map<string, string>();
const diskReady: Promise<void> = AsyncStorage.getItem(ICON_KEY)
  .then(raw => {
    const saved = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    for (const [id, xml] of Object.entries(saved)) {
      if (!iconCache.has(id) && typeof xml === 'string') {
        iconCache.set(id, xml);
      }
    }
  })
  .catch(() => {});
const checked = new Set<string>();

function saveIcons() {
  AsyncStorage.setItem(ICON_KEY, JSON.stringify(Object.fromEntries(iconCache))).catch(() => {});
}

/** The server's icon: its body, '' when it has none, null when unreachable. */
async function fetchIcon(pluginId: string): Promise<string | null> {
  try {
    const r = await fetch(`${mycelium.origin}/plugin-icon/${encodeURIComponent(pluginId)}`);
    if (r.status === 404) {
      return '';
    }
    if (!r.ok) {
      return null;
    }
    const body = await r.text();
    return body.includes('<svg') ? monochromeSvg(body) : '';
  } catch {
    return null;
  }
}

const PluginIcon = memo(function PluginIcon({pluginId, size, color}: {pluginId: string; size: number; color: string}) {
  const [xml, setXml] = useState(iconCache.get(pluginId));
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!iconCache.has(pluginId)) {
        await diskReady;
        if (alive && iconCache.has(pluginId)) {
          setXml(iconCache.get(pluginId));
        }
      }
      if (checked.has(pluginId)) {
        return;
      }
      checked.add(pluginId);
      const fresh = await fetchIcon(pluginId);
      if (fresh === null) {
        // Unreachable: keep what we have, try again next time.
        checked.delete(pluginId);
        return;
      }
      if (iconCache.get(pluginId) !== fresh) {
        iconCache.set(pluginId, fresh);
        saveIcons();
      }
      if (alive) {
        setXml(fresh);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pluginId]);

  if (xml) {
    return <SvgXml xml={xml} width={size} height={size} color={color} />;
  }
  return <View style={[styles.iconFallback, {width: size, height: size, borderColor: color}]} />;
});

interface NavItemProps {
  label: string;
  pluginId?: string;
  icon?: IconName;
  selected: boolean;
  preferred: boolean;
  L: HomeLayout;
  onPress: () => void;
}

const NavItem = forwardRef<View, NavItemProps>(function NavItem(
  {label, pluginId, icon, selected, preferred, L, onPress},
  ref,
) {
  const [focused, setFocused] = useState(false);
  const color = focused ? colors.textHigh : selected ? colors.primary : colors.textMid;
  return (
    <Pressable
      ref={ref}
      hasTVPreferredFocus={preferred}
      accessibilityLabel={label}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={onPress}
      style={[
        styles.item,
        {height: L.H * (80 / 1080), marginHorizontal: L.H * (20 / 1080), paddingHorizontal: L.H * (20 / 1080)},
        selected && styles.itemSelected,
        focused && styles.itemFocused,
      ]}>
      {pluginId ? <PluginIcon pluginId={pluginId} size={L.H * 0.032} color={color} /> : null}
      {icon ? <Icon name={icon} size={L.H * 0.032} color={color} /> : null}
      <Text style={[styles.itemText, {color, fontSize: L.H * 0.026}]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

export function PluginNav({
  plugins,
  selected,
  L,
  focusAction,
  onSelect,
  actions,
}: {
  plugins: PluginInfo[];
  selected: number;
  L: HomeLayout;
  /** Land on the first action instead of the selected plugin (back from settings). */
  focusAction?: boolean;
  onSelect: (index: number) => void;
  actions: {label: string; icon: IconName; onPress: () => void}[];
}) {
  const logoH = L.H * 0.075;
  const pluginRef = useRef<View>(null);
  const actionRef = useRef<View>(null);
  const toAction = useRef(!!focusAction).current;
  useEffect(() => focusSoon(() => (toAction ? actionRef.current : pluginRef.current)), [toAction]);
  return (
    <TVFocusGuideView style={[styles.root, {width: L.navW}]} trapFocusLeft trapFocusRight trapFocusUp trapFocusDown>
      <Gradient name="navPanel" direction="toRight" />
      <View style={[styles.brand, {marginTop: L.H * (48 / 1080), marginBottom: L.H * (16 / 1080)}]}>
        <SvgXml xml={ICON_SVG} height={logoH} width={logoH * ICON_ASPECT} color={colors.textHigh} />
        <SvgXml
          xml={WORDMARK_SVG}
          height={logoH}
          width={logoH * WORDMARK_ASPECT}
          color={colors.textHigh}
          style={{marginLeft: L.H * (10 / 1080)}}
        />
      </View>
      <View style={styles.list}>
        {plugins.map((p, i) => (
          <NavItem
            key={p.pluginId}
            label={p.name || p.pluginId}
            pluginId={p.pluginId}
            ref={i === selected ? pluginRef : undefined}
            selected={i === selected}
            preferred={i === selected && !toAction}
            L={L}
            onPress={() => onSelect(i)}
          />
        ))}
      </View>
      <View style={styles.divider} />
      <View style={{paddingTop: L.H * (16 / 1080), paddingBottom: L.H * (24 / 1080)}}>
        {actions.map((a, i) => (
          <NavItem
            ref={i === 0 ? actionRef : undefined}
            key={a.label}
            label={a.label}
            icon={a.icon}
            selected={false}
            preferred={i === 0 && toAction}
            L={L}
            onPress={a.onPress}
          />
        ))}
      </View>
    </TVFocusGuideView>
  );
}

const styles = scaledStyles({
  root: {position: 'absolute', left: 0, top: 0, bottom: 0},
  brand: {flexDirection: 'row', justifyContent: 'center', alignItems: 'center'},
  list: {flex: 1},
  item: {flexDirection: 'row', alignItems: 'center', gap: 16, borderRadius: 12},
  itemSelected: {backgroundColor: 'rgba(124,106,247,0.14)'},
  itemFocused: {backgroundColor: colors.primary},
  itemText: {fontWeight: '600', flexShrink: 1},
  iconFallback: {borderRadius: 6, borderWidth: 2},
  divider: {height: 1, backgroundColor: colors.border},
});
