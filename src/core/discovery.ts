// Finds Mycelium servers on the home network, like the discovery screen of
// pileus-player. Vega gives a script no UDP socket and no mDNS, so the
// broadcast the Android TV build uses can't be ported: instead every
// address of the TV's own /24 is asked for GET /pileus/info (the same probe
// the connect step does), plus the /24 of the last server used. Without
// the TV's address (the network service unavailable) a few common home
// subnets are tried instead.

import {ServerPorts} from './serverAddress';

export interface FoundServer {
  host: string;
  /** mycelium's own version string, when it says. */
  version: string;
}

/** Common home subnets, tried only when the TV's own address is unknown. */
const FALLBACK_PREFIXES = ['192.168.1', '192.168.0', '10.0.0', '192.168.178', '192.168.100'];
const PROBE_TIMEOUT_MS = 900;
const CONCURRENCY = 48;

/** "a.b.c" of an IPv4 address, or null. */
export function prefix24(ip: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m || m.slice(1).some(n => Number(n) > 255)) {
    return null;
  }
  return `${m[1]}.${m[2]}.${m[3]}`;
}

/** The /24s to sweep, most likely first, without duplicates. */
export function candidatePrefixes(localIp: string | null, lastHost: string | null): string[] {
  const out: string[] = [];
  const add = (p: string | null) => {
    if (p && !out.includes(p)) {
      out.push(p);
    }
  };
  add(localIp ? prefix24(localIp) : null);
  add(lastHost ? prefix24(lastHost) : null);
  if (!localIp) {
    FALLBACK_PREFIXES.forEach(add);
  }
  return out;
}

/** Hosts of the sweep: the last server first, then each /24 in order. */
export function sweepHosts(prefixes: string[], first: string | null, self: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>(self ? [self] : []);
  const add = (h: string) => {
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  };
  if (first && prefix24(first)) {
    add(first);
  }
  for (const p of prefixes) {
    for (let i = 1; i < 255; i++) {
      add(`${p}.${i}`);
    }
  }
  return out;
}

/** The TV's IPv4 address on the default interface, or null. */
export function localIPv4(): string | null {
  try {
    // Loaded here so a build or test without the native module still runs.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const lib = require('@amazon-devices/keplerscript-netmgr-lib');
    const nm = new lib.NetworkManager();
    const cfg: {type: number; provision: number; ipAddresses?: string[]} = {
      type: lib.IpType.IPV4,
      provision: 0,
    };
    // 0: the default (active) interface.
    if (nm.getIpConfig(0, lib.IpType.IPV4, cfg) !== lib.Status.SUCCESS) {
      return null;
    }
    return (cfg.ipAddresses ?? []).find(a => prefix24(a) !== null) ?? null;
  } catch {
    return null;
  }
}

async function probe(host: string): Promise<FoundServer | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(`http://${host}:${ServerPorts.http}/pileus/info`, {signal: ctl.signal});
    if (!r.ok) {
      return null;
    }
    const info = await r.json();
    return info?.name === 'Mycelium' ? {host, version: String(info.version ?? '')} : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Sweeps the network, reporting each server as soon as it answers. Resolves
 * when the sweep is over or [isCancelled] says so.
 */
export async function discoverServers(opts: {
  lastHost: string | null;
  onFound: (s: FoundServer) => void;
  isCancelled: () => boolean;
}): Promise<void> {
  const self = localIPv4();
  const hosts = sweepHosts(candidatePrefixes(self, opts.lastHost), opts.lastHost, self);
  let next = 0;
  const worker = async () => {
    while (next < hosts.length && !opts.isCancelled()) {
      const found = await probe(hosts[next++]);
      if (found && !opts.isCancelled()) {
        opts.onFound(found);
      }
    }
  };
  await Promise.all(Array.from({length: CONCURRENCY}, worker));
}
