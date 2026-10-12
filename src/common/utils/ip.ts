import { isIPv4, isIPv6 } from 'node:net';

/**
 * Tronque une adresse IP (minimisation RGPD) : /24 en IPv4, /48 en IPv6.
 * Suffisant pour repérer une connexion inhabituelle, sans identifier un foyer précis.
 */
export function truncateIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const address = ip.startsWith('::ffff:') && isIPv4(ip.slice(7)) ? ip.slice(7) : ip;
  if (isIPv4(address)) {
    const [a, b, c] = address.split('.');
    return `${a}.${b}.${c}.0/24`;
  }
  if (isIPv6(address)) {
    const groups = expandIpv6(address).slice(0, 3);
    return `${groups.join(':')}::/48`;
  }
  return null;
}

function expandIpv6(address: string): string[] {
  const [head = '', tail = ''] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  return [...headGroups, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tailGroups].map(
    (group) => group.toLowerCase().replace(/^0+(?=.)/, ''),
  );
}
