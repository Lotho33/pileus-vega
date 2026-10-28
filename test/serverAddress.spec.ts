import {originFor, parseServerAddressInput} from '../src/core/serverAddress';

describe('parseServerAddressInput', () => {
  it('bare private IPv4 is LAN on the HTTP port', () => {
    const a = parseServerAddressInput(' 192.168.1.20 ');
    expect(a).toEqual({remote: false, host: '192.168.1.20', scheme: 'https', port: undefined});
    expect(originFor(a)).toBe('http://192.168.1.20:8000');
  });

  it('keeps an explicit LAN port', () => {
    expect(originFor(parseServerAddressInput('10.0.0.5:9000'))).toBe('http://10.0.0.5:9000');
  });

  it('hostname is remote https on 443', () => {
    const a = parseServerAddressInput('demo.example.com/some/path');
    expect(a.remote).toBe(true);
    expect(originFor(a)).toBe('https://demo.example.com');
  });

  it('explicit scheme forces remote, even on a private IP', () => {
    const a = parseServerAddressInput('http://192.168.1.20:8000');
    expect(a.remote).toBe(true);
    expect(originFor(a)).toBe('http://192.168.1.20:8000');
  });

  it('public IP is remote', () => {
    expect(parseServerAddressInput('8.8.8.8').remote).toBe(true);
  });

  it('bracketed IPv6 with port', () => {
    const a = parseServerAddressInput('[fd00::1]:8000');
    expect(a).toMatchObject({remote: false, host: 'fd00::1', port: 8000});
    expect(originFor(a)).toBe('http://[fd00::1]:8000');
  });

  it('leading-zero octets are not private', () => {
    expect(parseServerAddressInput('010.0.0.1').remote).toBe(true);
  });
});
