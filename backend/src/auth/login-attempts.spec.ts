import { LOCKOUT_RULES, lockDurationMs } from './login-attempts.service';

const MINUTE = 60_000;

describe('lockDurationMs (verrouillage progressif)', () => {
  it('aucun verrou sous le seuil', () => {
    expect(lockDurationMs(LOCKOUT_RULES.pair, 4)).toBe(0);
  });

  it('double à chaque échec, plafonné à 15 minutes', () => {
    const durations = [5, 6, 7, 8, 9, 50].map((n) => lockDurationMs(LOCKOUT_RULES.pair, n));
    expect(durations).toEqual([
      MINUTE,
      2 * MINUTE,
      4 * MINUTE,
      8 * MINUTE,
      15 * MINUTE,
      15 * MINUTE,
    ]);
  });

  it('seuil plus haut pour un compte attaqué depuis plusieurs IP (pas de déni de service facile)', () => {
    expect(lockDurationMs(LOCKOUT_RULES.subject, 19)).toBe(0);
    expect(lockDurationMs(LOCKOUT_RULES.subject, 20)).toBe(MINUTE);
  });
});
