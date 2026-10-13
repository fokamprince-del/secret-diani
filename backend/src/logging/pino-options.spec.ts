import { Writable } from 'node:stream';
import pino from 'pino';
import { REDACTED_PATHS, createPinoHttpOptions } from './pino-options';

/** Journalise dans un tampon mémoire avec la configuration réelle (masquage + sérialiseurs). */
function captureLogs(write: (logger: pino.Logger) => void): string {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const options = createPinoHttpOptions({ level: 'info', pretty: false });
  const logger = pino(
    {
      level: 'info',
      redact: { paths: REDACTED_PATHS, censor: '[masqué]' },
      serializers: options.serializers,
    },
    stream,
  );
  write(logger);
  return chunks.join('');
}

describe('journalisation sans données personnelles', () => {
  it('masque mots de passe, jetons et données personnelles même logués par erreur', () => {
    const output = captureLogs((logger) =>
      logger.info(
        {
          user: {
            email: 'cliente@example.com',
            password: 'motdepasse-tres-secret',
            phone: '0600000000',
          },
          refreshToken: 'rt_abcdef',
          token: 'tok_123',
        },
        'test',
      ),
    );
    expect(output).not.toContain('cliente@example.com');
    expect(output).not.toContain('motdepasse-tres-secret');
    expect(output).not.toContain('0600000000');
    expect(output).not.toContain('tok_123');
    expect(output).not.toContain('rt_abcdef');
    expect(output).toContain('[masqué]');
  });

  it('ne journalise de la requête que la méthode et le chemin (ni IP, ni en-têtes, ni query)', () => {
    const output = captureLogs((logger) =>
      logger.info({
        req: {
          id: 'abc',
          method: 'GET',
          url: '/api/v1/auth/verify-email?token=jeton-secret',
          headers: { authorization: 'Bearer xyz', cookie: 'rt=1' },
          remoteAddress: '203.0.113.42',
        },
        res: { statusCode: 200, headers: { 'set-cookie': 'rt=2' } },
      }),
    );
    const line = JSON.parse(output) as { req: unknown; res: unknown };
    expect(line.req).toEqual({ id: 'abc', method: 'GET', path: '/api/v1/auth/verify-email' });
    expect(line.res).toEqual({ statusCode: 200 });
    expect(output).not.toContain('jeton-secret');
    expect(output).not.toContain('203.0.113.42');
    expect(output).not.toContain('Bearer');
  });
});
