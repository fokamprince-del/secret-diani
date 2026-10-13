import { connect } from 'node:net';

export type ScanVerdict = { clean: true } | { clean: false; signature: string };

const CHUNK_SIZE = 64 * 1024;

/**
 * Client minimal du démon ClamAV (protocole clamd `zINSTREAM`, TCP).
 * Le fichier est envoyé par blocs préfixés de leur taille, terminé par un bloc vide.
 * Réponse : « stream: OK » ou « stream: <signature> FOUND ».
 */
export class ClamavClient {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 60_000,
  ) {}

  scan(buffer: Buffer): Promise<ScanVerdict> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () => {
        socket.destroy(new Error('Délai dépassé pendant l’analyse antivirus'));
      });
      socket.on('error', reject);
      socket.on('data', (data) => chunks.push(data));
      socket.on('end', () => {
        const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
        if (/^stream: OK$/.test(reply)) return resolve({ clean: true });
        const found = /^stream: (.+) FOUND$/.exec(reply);
        if (found) return resolve({ clean: false, signature: found[1]! });
        reject(new Error(`Réponse antivirus inattendue : ${reply.slice(0, 100)}`));
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
          const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}
