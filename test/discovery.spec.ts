import {candidatePrefixes, prefix24, sweepHosts} from '../src/core/discovery';

describe('discovery', () => {
  test('prefix24 takes the /24 of an IPv4 address only', () => {
    expect(prefix24('10.0.0.177')).toBe('10.0.0');
    expect(prefix24(' 192.168.1.20 ')).toBe('192.168.1');
    expect(prefix24('media.example.it')).toBeNull();
    expect(prefix24('300.1.1.1')).toBeNull();
  });

  test('own subnet first, then the last server; fallbacks only without an address', () => {
    expect(candidatePrefixes('10.0.0.177', '192.168.1.20')).toEqual(['10.0.0', '192.168.1']);
    expect(candidatePrefixes('10.0.0.177', '10.0.0.204')).toEqual(['10.0.0']);
    const blind = candidatePrefixes(null, null);
    expect(blind).toContain('192.168.1');
    expect(blind).toContain('10.0.0');
  });

  test('the last server is probed first and the TV itself never', () => {
    const hosts = sweepHosts(['10.0.0'], '10.0.0.204', '10.0.0.177');
    expect(hosts[0]).toBe('10.0.0.204');
    expect(hosts).not.toContain('10.0.0.177');
    expect(hosts.filter(h => h === '10.0.0.204')).toHaveLength(1);
    expect(hosts).toHaveLength(253);
  });

  test('a hostname as last server adds no host of its own', () => {
    expect(sweepHosts(['10.0.0'], 'media.example.it', null)).toHaveLength(254);
  });
});
