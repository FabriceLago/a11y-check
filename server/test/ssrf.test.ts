import { describe, expect, it } from 'vitest';
import { assertPublicHost, isBlockedIp, parsePublicUrl, safeLookup, UnsafeUrlError } from '../src/ssrf.js';

const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof UnsafeUrlError ? e.reason : 'other';
  }
  return 'ok';
};

describe('parsePublicUrl', () => {
  it.each([
    ['http://localhost/', 'private'],
    ['http://LOCALHOST./', 'private'],
    ['http://app.localhost/', 'private'],
    ['http://intranet/', 'private'],
    ['http://127.0.0.1/', 'private'],
    ['http://127.1/', 'private'],
    ['http://2130706433/', 'private'],   // decimal 127.0.0.1
    ['http://0x7f.0.0.1/', 'private'],   // hex
    ['http://0177.0.0.1/', 'private'],   // octal
    ['http://0.0.0.0/', 'private'],
    ['http://10.1.2.3/', 'private'],
    ['http://172.16.0.1/', 'private'],
    ['http://172.31.255.255/', 'private'],
    ['http://192.168.1.1/', 'private'],
    ['http://169.254.169.254/latest/meta-data/', 'private'],
    ['http://100.64.0.1/', 'private'],
    ['http://[::1]/', 'private'],
    ['http://[::]/', 'private'],
    ['http://[::ffff:10.0.0.1]/', 'private'],
    ['http://[::ffff:7f00:1]/', 'private'],
    ['http://[fd00::1]/', 'private'],
    ['http://[fe80::1]/', 'private'],
    ['file:///etc/passwd', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['ftp://example.com/', 'scheme'],
    ['data:text/html,hi', 'scheme'],
    ['https://user:pass@example.com/', 'credentials'],
    ['https://example.com:8080/', 'port'],
    ['https://example.com:22/', 'port'],
    ['http://', 'invalid'],
    ['https://exa mple.com/', 'invalid'],
  ])('%s → %s', (url, expected) => {
    expect(reason(() => parsePublicUrl(url))).toBe(expected);
  });

  it.each([
    'https://www.example.be/',
    'http://example.com/page?x=1',
    'https://example.com:443/',
    'https://93.184.215.14/',
    'https://[2606:4700::1111]/',
  ])('accepts %s', (url) => {
    expect(reason(() => parsePublicUrl(url))).toBe('ok');
  });

  it('adds https:// when the scheme is missing', () => {
    expect(parsePublicUrl('  monentreprise.be ').href).toBe('https://monentreprise.be/');
  });

  it('allowIps only unlocks the exact IP', () => {
    const guard = { allowIps: new Set(['127.0.0.1']) };
    expect(reason(() => parsePublicUrl('http://127.0.0.1:5173/', guard))).toBe('ok');
    expect(reason(() => parsePublicUrl('http://127.0.0.2/', guard))).toBe('private');
  });
});

describe('isBlockedIp', () => {
  it('rejects garbage', () => expect(isBlockedIp('not-an-ip')).toBe(true));
  it('allows public IPv4 and IPv6', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('2001:4860:4860::8888')).toBe(false);
  });
  it('blocks 6to4 / NAT64 wrappers of private IPv4', () => {
    expect(isBlockedIp('2002:0a00:0001::1')).toBe(true);
    expect(isBlockedIp('64:ff9b::a00:1')).toBe(true);
  });
});

describe('DNS checks', () => {
  it('safeLookup refuses a name that resolves to loopback', async () => {
    const err = await new Promise((resolve) => safeLookup()('localhost', {}, (e) => resolve(e)));
    expect(err).toBeInstanceOf(UnsafeUrlError);
    expect((err as UnsafeUrlError).reason).toBe('private');
  });

  it('assertPublicHost refuses loopback names', async () => {
    await expect(assertPublicHost('localhost')).rejects.toMatchObject({ reason: 'private' });
  });

  it('assertPublicHost reports unknown domains', async () => {
    await expect(assertPublicHost('this-does-not-exist.invalid')).rejects.toMatchObject({ reason: 'dns' });
  });
});
