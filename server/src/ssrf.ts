import dns from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';

// Anything that is not the public internet. Two lists on purpose: a single
// BlockList also matches IPv4 against IPv6 rules, so ::ffff:0:0/96 would block all IPv4.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked4.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 96],          // unspecified, ::1, IPv4-compatible
  ['::ffff:0:0', 96],  // IPv4-mapped (::ffff:10.0.0.1)
  ['64:ff9b::', 96],   // NAT64 can embed a private IPv4
  ['100::', 64], ['2001:db8::', 32],
  ['2002::', 16],      // 6to4 can embed a private IPv4
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked6.addSubnet(net, prefix, 'ipv6');

/** Test-only escape hatch, passed explicitly — never read from env. */
export type Guard = { allowIps?: ReadonlySet<string> };

export type UnsafeReason = 'invalid' | 'scheme' | 'credentials' | 'port' | 'private' | 'dns';

const MESSAGES: Record<UnsafeReason, string> = {
  invalid: "Cette adresse n'est pas valide. Exemple : https://www.monentreprise.be",
  scheme: 'Seules les adresses web (http ou https) peuvent être analysées.',
  credentials: "L'adresse ne doit pas contenir d'identifiant ni de mot de passe.",
  port: 'Seuls les sites sur les ports web standards (80 et 443) peuvent être analysés.',
  private: 'Cette adresse pointe vers un réseau privé et ne peut pas être analysée.',
  dns: 'Ce site est introuvable. Vérifiez l’orthographe de l’adresse.',
};

export class UnsafeUrlError extends Error {
  constructor(public readonly reason: UnsafeReason) {
    super(MESSAGES[reason]);
  }
}

export function isBlockedIp(ip: string, guard: Guard = {}): boolean {
  if (guard.allowIps?.has(ip)) return false;
  const family = isIP(ip);
  if (family === 0) return true;
  return family === 4 ? blocked4.check(ip, 'ipv4') : blocked6.check(ip, 'ipv6');
}

/** Syntactic checks. DNS names are checked at connect time by safeLookup. */
export function parsePublicUrl(input: string, guard: Guard = {}): URL {
  let raw = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`; // "monsite.be" is fine
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrlError('scheme');
  if (url.username || url.password) throw new UnsafeUrlError('credentials');
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase(); // "localhost." = localhost
  if (!host) throw new UnsafeUrlError('invalid');
  // IP literals skip DNS entirely (net.connect never calls lookup), so check them here.
  if (isIP(host)) {
    if (isBlockedIp(host, guard)) throw new UnsafeUrlError('private');
    if (guard.allowIps?.has(host)) return url; // test servers run on random ports
  } else if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.')) {
    throw new UnsafeUrlError('private');
  }
  if (url.port && url.port !== '80' && url.port !== '443') throw new UnsafeUrlError('port');
  return url;
}

function checkAddresses(addresses: dns.LookupAddress[], guard: Guard) {
  if (addresses.length === 0) throw new UnsafeUrlError('dns');
  // Reject if *any* record is private: otherwise the connection may pick it.
  if (addresses.some((a) => isBlockedIp(a.address, guard))) throw new UnsafeUrlError('private');
}

/** Pre-flight check so the user gets an immediate, clear error. */
export async function assertPublicHost(hostname: string, guard: Guard = {}): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return; // already checked by parsePublicUrl
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError('dns');
  }
  checkAddresses(addresses, guard);
}

/**
 * `lookup` for http(s).request: validates the IP actually used for the
 * connection, which closes the DNS-rebinding window between check and use.
 */
export function safeLookup(guard: Guard = {}): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      try {
        checkAddresses(addresses, guard);
      } catch (e) {
        return callback(e as NodeJS.ErrnoException, '', 0);
      }
      if (options.all) (callback as any)(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}
