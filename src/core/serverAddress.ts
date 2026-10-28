// Port of pileus-player lib/core/grpc/server_address.dart + ServerPorts.
//
// A bare private IP (no scheme) is LAN mode: plain HTTP on mycelium's HTTP
// port, gRPC-Web through its /grpc bridge. Anything else (a hostname, a
// public IP, an explicit scheme) is remote mode: https by default, port 443
// unless one is given.

export const ServerPorts = {
  grpc: 50051,
  http: 8000,
  discoveryUdp: 51900,
  remoteHttps: 443,
} as const;

export interface ParsedServerAddress {
  remote: boolean;
  host: string;
  scheme: 'http' | 'https';
  port?: number;
}

function looksLikeIPv4(s: string): boolean {
  const parts = s.split('.');
  return (
    parts.length === 4 &&
    parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

function isPrivateOrLocalIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return false;
  }
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p) || (p.length > 1 && p.startsWith('0'))) {
      return false;
    }
    const n = Number(p);
    if (n > 255) {
      return false;
    }
    nums.push(n);
  }
  const [a, b] = nums;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254)
  );
}

function isPrivateOrLocalIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  );
}

export function parseServerAddressInput(rawInput: string): ParsedServerAddress {
  const input = rawInput.trim();
  let scheme: 'http' | 'https' = 'https';
  let rest = input;
  const m = /^(https?):\/\//i.exec(input);
  const hasExplicitScheme = m !== null;
  if (m) {
    scheme = m[1].toLowerCase() as 'http' | 'https';
    rest = input.slice(m[0].length);
  }
  const cut = rest.search(/[/?#]/);
  if (cut >= 0) {
    rest = rest.slice(0, cut);
  }

  let host: string;
  let port: number | undefined;
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']');
    if (end > 0) {
      host = rest.slice(1, end);
      const tail = rest.slice(end + 1);
      if (tail.startsWith(':') && /^\d+$/.test(tail.slice(1))) {
        port = Number(tail.slice(1));
      }
    } else {
      host = rest;
    }
  } else {
    const colon = rest.lastIndexOf(':');
    const maybePort = colon >= 0 ? rest.slice(colon + 1) : '';
    if (colon > 0 && /^\d+$/.test(maybePort)) {
      host = rest.slice(0, colon);
      port = Number(maybePort);
    } else {
      host = rest;
    }
  }

  const isIPv4 = looksLikeIPv4(host);
  const isIPv6 = !isIPv4 && host.includes(':');
  const isPrivateIp = isIPv4
    ? isPrivateOrLocalIPv4(host)
    : isIPv6
    ? isPrivateOrLocalIPv6(host)
    : false;
  const isLan = !hasExplicitScheme && (isIPv4 || isIPv6) && isPrivateIp;

  return {remote: !isLan, host, scheme, port};
}

function hostPart(host: string): string {
  return host.includes(':') ? `[${host}]` : host;
}

/** HTTP origin serving /pileus/info and the /grpc bridge for [addr]. */
export function originFor(addr: ParsedServerAddress): string {
  if (!addr.remote) {
    return `http://${hostPart(addr.host)}:${addr.port ?? ServerPorts.http}`;
  }
  const defaultPort = addr.scheme === 'https' ? 443 : 80;
  const suffix =
    addr.port !== undefined && addr.port !== defaultPort ? `:${addr.port}` : '';
  return `${addr.scheme}://${hostPart(addr.host)}${suffix}`;
}
