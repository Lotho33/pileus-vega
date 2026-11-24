// An episode's meta line with Filler/Riassunto in its colour
// (episode_kind.dart's episodeMetaSpan): nested in the caller's <Text>, so it
// takes that size and colour. Empty parts are skipped; `kind` goes at `at`
// (clamped; default after the first part: "24 min · Filler · trama…").

import React from 'react';
import {StyleSheet} from 'react-native';
import {Text} from './Text';
import {EPISODE_KIND_COLOR} from '../core/episodeKind';

export function MetaWithKind({
  parts,
  kind = '',
  at = 1,
  sep = '  ·  ',
}: {
  parts: string[];
  kind?: string;
  at?: number;
  sep?: string;
}) {
  const words: [string, boolean][] = parts.filter(Boolean).map(p => [p, false]);
  if (kind) {
    words.splice(Math.max(0, Math.min(at, words.length)), 0, [kind, true]);
  }
  return (
    <>
      {words.map(([w, isKind], i) => (
        <React.Fragment key={i}>
          {i ? sep : ''}
          {isKind ? <Text style={styles.kind}>{w}</Text> : w}
        </React.Fragment>
      ))}
    </>
  );
}

const styles = StyleSheet.create({kind: {color: EPISODE_KIND_COLOR, fontWeight: '600'}});
