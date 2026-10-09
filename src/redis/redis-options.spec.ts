import { redisOptionsFromUrl } from './redis-options';

describe('redisOptionsFromUrl', () => {
  it('lit hôte, port et base par défaut', () => {
    expect(redisOptionsFromUrl('redis://localhost')).toEqual({
      host: 'localhost',
      port: 6379,
      db: 0,
    });
  });

  it('décode les identifiants et la base, active TLS pour rediss://', () => {
    expect(redisOptionsFromUrl('rediss://user:p%40ss@cache.internal:6380/2')).toEqual({
      host: 'cache.internal',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
      tls: {},
    });
  });

  it('retombe sur la base 0 si le chemin n’est pas un entier', () => {
    expect(redisOptionsFromUrl('redis://localhost:6379/abc').db).toBe(0);
  });
});
