// Impostazioni › Plugin (settings_plugins_screen.dart + plugin_settings_
// screen.dart). Order and visibility of plugins and of their home sections
// live in the profile's preferences blob, so every device of the profile
// follows them; the plugin's own fields are its server-side settings.

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, View} from 'react-native';
import {mycelium} from '../core/api';
import {parsePluginPrefs, PluginPrefs, writePluginPrefs} from '../core/prefs';
import type {PluginInfo, PluginSettingField} from '../gen/media';
import {errorText, useAuth} from '../state/auth';
import {colors, px} from '../theme';
import {ReorderDialog} from './ReorderDialog';
import {TextDialog} from './TextDialog';
import {Note, Page, Row, SectionHeader} from './ui';

/** Saves `next` into the active profile's blob, keeping its other blocks. */
function usePluginPrefs() {
  const {profile, updateProfile} = useAuth();
  const prefs = parsePluginPrefs(profile?.preferencesJson ?? '');
  const save = useCallback(
    async (next: PluginPrefs) => {
      if (!profile) {
        return;
      }
      const r = await mycelium.setProfilePreferences(
        profile.profileId,
        writePluginPrefs(profile.preferencesJson, next),
      );
      updateProfile(r);
    },
    [profile, updateProfile],
  );
  return {prefs, save};
}

/** Every plugin, the profile's order first (hidden ones included). */
export function orderedPlugins(list: PluginInfo[], order: string[]): PluginInfo[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return list
    .map((p, i) => ({p, r: rank.get(p.pluginId) ?? order.length + i}))
    .sort((a, b) => a.r - b.r)
    .map(x => x.p);
}

function statusText(p: PluginInfo): string {
  if (p.needsConfig) {
    return 'Da configurare';
  }
  if (p.statusLabel === 'syncing') {
    return 'Sincronizzazione in corso';
  }
  if (p.statusLabel === 'error') {
    return `Errore${p.statusDetail ? `: ${p.statusDetail}` : ''}`;
  }
  return `${p.catalogs.length} ${p.catalogs.length === 1 ? 'sezione' : 'sezioni'}`;
}

export function PluginsPage({onOpen}: {onOpen: (p: PluginInfo) => void}) {
  const first = useRef<View>(null);
  const {prefs, save} = usePluginPrefs();
  const [list, setList] = useState<PluginInfo[] | null>(null);
  const [error, setError] = useState('');
  const [reorder, setReorder] = useState(false);
  const [focusToken, setFocusToken] = useState(0);

  useEffect(() => {
    mycelium
      .listPlugins()
      .then(setList)
      .catch(e => setError(errorText(e)));
  }, []);

  const plugins = list ? orderedPlugins(list, prefs.order) : [];
  const shown = plugins.filter(p => !prefs.hidden.has(p.pluginId));
  const hidden = plugins.filter(p => prefs.hidden.has(p.pluginId));
  return (
    <>
    <Page title="Impostazioni plugin" first={first} focusToken={(list ? 1 : 0) + focusToken}>
      {!list && !error ? <ActivityIndicator color={colors.primary} style={{marginTop: px(40)}} /> : null}
      {error ? <Note text={`Impossibile raggiungere il server: ${error}`} /> : null}
      {list && list.length > 1 ? (
        <Row
          ref={first}
          icon="arrowDown"
          label="Riordina plugin"
          subtitle="L'ordine della barra laterale, su tutti i dispositivi del profilo"
          nav
          onPress={() => setReorder(true)}
        />
      ) : null}
      {shown.length ? <SectionHeader title="Plugin" /> : null}
      {shown.map((p, i) => (
        <Row
          key={p.pluginId}
          ref={i === 0 && list && list.length <= 1 ? first : undefined}
          icon="extension"
          label={p.name || p.pluginId}
          subtitle={statusText(p)}
          nav
          onPress={() => onOpen(p)}
        />
      ))}
      {hidden.length ? <SectionHeader title="Plugin nascosti" /> : null}
      {hidden.map(p => (
        <Row
          key={p.pluginId}
          icon="extension"
          label={p.name || p.pluginId}
          subtitle="Nascosto dalla home"
          nav
          onPress={() => onOpen(p)}
        />
      ))}
      {list && !list.length ? <Note text="Nessun plugin disponibile" /> : null}
    </Page>
    {reorder ? (
      <ReorderDialog
        plugins={plugins}
        onClose={() => {
          setReorder(false);
          setFocusToken(t => t + 1);
        }}
        onSave={order => {
          save({...prefs, order}).catch(e => setError(errorText(e)));
        }}
      />
    ) : null}
    </>
  );
}

function fieldValue(f: PluginSettingField): string {
  if (f.type === 'password') {
    return f.isSet ? '••••••' : 'Non impostato';
  }
  if (f.type === 'bool') {
    return f.currentValue === 'true' ? 'Sì' : 'No';
  }
  return f.currentValue || 'Non impostato';
}

export function PluginPage({plugin}: {plugin: PluginInfo}) {
  const first = useRef<View>(null);
  const {prefs, save} = usePluginPrefs();
  const [fields, setFields] = useState<PluginSettingField[] | null>(null);
  const [editing, setEditing] = useState<PluginSettingField | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [focusToken, setFocusToken] = useState(0);
  const id = plugin.pluginId;

  const loadFields = useCallback(() => {
    mycelium
      .getPluginSettings(id)
      .then(setFields)
      .catch(() => setFields([]));
  }, [id]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setNote('');
    try {
      await fn();
      if (done) {
        setNote(done);
      }
    } catch (e) {
      setNote(errorText(e));
    }
  };

  const hidden = prefs.hidden.has(id);
  const cat = prefs.catalogs[id] ?? {order: [], hidden: new Set<string>()};
  const toggleCatalog = (catalogId: string) => {
    const h = new Set(cat.hidden);
    if (h.has(catalogId)) {
      h.delete(catalogId);
    } else {
      h.add(catalogId);
    }
    act(() => save({...prefs, catalogs: {...prefs.catalogs, [id]: {order: cat.order, hidden: h}}}));
  };

  const saveField = async (f: PluginSettingField, value: string) => {
    setBusy(true);
    setError('');
    try {
      await mycelium.savePluginSetting(id, f.id, value);
      setEditing(null);
      setFocusToken(t => t + 1);
      loadFields();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Page title={plugin.name || id} first={first} focusToken={focusToken}>
        <SectionHeader title="Home" />
        <Row
          ref={first}
          icon="visibility"
          label="Mostra nella home"
          value={hidden ? 'No' : 'Sì'}
          onPress={() => {
            const h = new Set(prefs.hidden);
            if (hidden) {
              h.delete(id);
            } else {
              h.add(id);
            }
            act(() => save({...prefs, hidden: h}));
          }}
        />
        {plugin.catalogs.length ? <SectionHeader title="Sezioni in home" /> : null}
        {plugin.catalogs.map(c => (
          <Row
            key={c.id}
            label={c.name || c.id}
            value={cat.hidden.has(c.id) ? 'Nascosta' : 'Visibile'}
            onPress={() => toggleCatalog(c.id)}
          />
        ))}
        <SectionHeader title="Configurazione" />
        {fields === null ? <ActivityIndicator color={colors.primary} /> : null}
        {fields && !fields.length ? <Note text="Questo plugin non ha impostazioni per il profilo." /> : null}
        {fields?.map(f => (
          <Row
            key={f.id}
            label={`${f.label || f.id}${f.required ? ' *' : ''}`}
            value={fieldValue(f)}
            nav={f.type !== 'bool'}
            onPress={() =>
              f.type === 'bool'
                ? act(async () => {
                    await mycelium.savePluginSetting(id, f.id, f.currentValue === 'true' ? 'false' : 'true');
                    loadFields();
                  })
                : setEditing(f)
            }
          />
        ))}
        <SectionHeader title="Dati" />
        <Row
          icon="refresh"
          label="Aggiorna ora"
          subtitle="Avvia subito la sincronizzazione del plugin"
          onPress={() =>
            act(async () => {
              const r = await mycelium.triggerRefresh(id);
              setNote(r.ok ? r.message || 'Aggiornamento avviato.' : r.message || 'Aggiornamento già in corso.');
            })
          }
        />
        {note ? <Note text={note} /> : null}
      </Page>
      {editing ? (
        <TextDialog
          title={editing.label || editing.id}
          message={editing.type === 'password' && editing.isSet ? 'Lascia vuoto per cancellare il valore salvato.' : undefined}
          initial={editing.type === 'password' ? '' : editing.currentValue}
          layout={editing.type === 'number' ? 'digits' : 'text'}
          secure={editing.type === 'password'}
          maxLength={256}
          allowEmpty
          busy={busy}
          error={error}
          onCancel={() => {
            setEditing(null);
            setError('');
            setFocusToken(t => t + 1);
          }}
          onSubmit={v => saveField(editing, v)}
        />
      ) : null}
    </>
  );
}
