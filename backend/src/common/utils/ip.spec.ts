import { truncateIp } from './ip';
import { withMinDuration } from './timing';

describe('truncateIp', () => {
  it.each([
    ['203.0.113.42', '203.0.113.0/24'],
    ['::ffff:198.51.100.7', '198.51.100.0/24'],
    ['2001:db8:85a3:8d3:1319:8a2e:370:7348', '2001:db8:85a3::/48'],
    ['2001:0db8::1', '2001:db8:0::/48'],
    ['::1', '0:0:0::/48'],
  ])('%s → %s', (ip, expected) => {
    expect(truncateIp(ip)).toBe(expected);
  });

  it.each([undefined, '', 'pas-une-ip'])('renvoie null pour %p', (ip) => {
    expect(truncateIp(ip)).toBeNull();
  });
});

describe('withMinDuration', () => {
  it('attend au moins la durée demandée, y compris en cas d’erreur', async () => {
    const start = Date.now();
    await expect(withMinDuration(60, () => Promise.resolve('ok'))).resolves.toBe('ok');
    expect(Date.now() - start).toBeGreaterThanOrEqual(55);

    const errorStart = Date.now();
    await expect(withMinDuration(60, () => Promise.reject(new Error('échec')))).rejects.toThrow(
      'échec',
    );
    expect(Date.now() - errorStart).toBeGreaterThanOrEqual(55);
  });
});
