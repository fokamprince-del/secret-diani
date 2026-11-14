/* eslint-disable @typescript-eslint/require-await -- même interface asynchrone que ioredis, sans E/S réelle. */
/**
 * Remplaçant en mémoire de Redis, utilisé quand REDIS_URL n'est pas défini (une seule instance
 * de l'API, par exemple sur Render sans Redis). Implémente seulement les commandes dont le
 * code a besoin, avec la même sémantique que Redis (TTL en ms, NX, KEEPTTL, multi/pipeline).
 *
 * Limites assumées : les données (limitation des tentatives, codes de réinitialisation, cache)
 * sont perdues au redémarrage et ne sont pas partagées entre plusieurs instances. Pour passer à
 * plusieurs instances, définir REDIS_URL : le vrai client est alors utilisé, sans autre changement.
 */
interface Entry {
  value: string;
  /** Échéance en ms depuis l'époque ; absente : pas d'expiration. */
  expiresAt?: number;
}

type Reply = [Error | null, unknown];

const SWEEP_INTERVAL_MS = 60_000;

export class MemoryRedis {
  readonly status = 'ready';
  private readonly store = new Map<string, Entry>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    // Les clés expirées ne sont pas relues, mais doivent aussi libérer la mémoire.
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  private live(key: string): Entry | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) this.store.delete(key);
    }
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async getdel(key: string): Promise<string | null> {
    const value = this.live(key)?.value ?? null;
    this.store.delete(key);
    return value;
  }

  /** SET clé valeur [EX s | PX ms | KEEPTTL] [NX | XX] */
  async set(
    key: string,
    value: string | number,
    ...args: (string | number)[]
  ): Promise<'OK' | null> {
    const current = this.live(key);
    let expiresAt: number | undefined;
    let keepTtl = false;
    let nx = false;
    let xx = false;
    for (let i = 0; i < args.length; i++) {
      const option = String(args[i]).toUpperCase();
      if (option === 'EX') expiresAt = Date.now() + Number(args[++i]) * 1000;
      else if (option === 'PX') expiresAt = Date.now() + Number(args[++i]);
      else if (option === 'KEEPTTL') keepTtl = true;
      else if (option === 'NX') nx = true;
      else if (option === 'XX') xx = true;
    }
    if ((nx && current) || (xx && !current)) return null;
    this.store.set(key, {
      value: String(value),
      expiresAt: keepTtl ? current?.expiresAt : expiresAt,
    });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys.flat()) {
      if (this.live(key)) removed++;
      this.store.delete(key);
    }
    return removed;
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.flat().filter((key) => this.live(key)).length;
  }

  async incr(key: string): Promise<number> {
    const current = this.live(key);
    const next = Number(current?.value ?? 0) + 1;
    if (!Number.isInteger(next)) throw new Error('ERR value is not an integer or out of range');
    this.store.set(key, { value: String(next), expiresAt: current?.expiresAt });
    return next;
  }

  async pexpire(key: string, ms: number, mode?: 'NX' | 'XX' | 'GT' | 'LT'): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    if (mode === 'NX' && entry.expiresAt !== undefined) return 0;
    if (mode === 'XX' && entry.expiresAt === undefined) return 0;
    entry.expiresAt = Date.now() + Number(ms);
    return 1;
  }

  async expire(key: string, seconds: number, mode?: 'NX' | 'XX' | 'GT' | 'LT'): Promise<number> {
    return this.pexpire(key, Number(seconds) * 1000, mode);
  }

  /** -2 : clé absente ; -1 : sans expiration ; sinon ms restantes. */
  async pttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === undefined) return -1;
    return Math.max(entry.expiresAt - Date.now(), 0);
  }

  /** MULTI / pipeline : les commandes s'exécutent dans l'ordre, sans entrelacement (un seul fil). */
  multi(): MemoryBatch {
    return new MemoryBatch(this);
  }

  pipeline(): MemoryBatch {
    return new MemoryBatch(this);
  }

  async quit(): Promise<'OK'> {
    this.disconnect();
    return 'OK';
  }

  disconnect(): void {
    clearInterval(this.sweeper);
  }

  on(): this {
    return this;
  }
}

class MemoryBatch {
  private readonly commands: (() => Promise<unknown>)[] = [];

  constructor(private readonly redis: MemoryRedis) {}

  private push(command: () => Promise<unknown>): this {
    this.commands.push(command);
    return this;
  }

  incr(key: string): this {
    return this.push(() => this.redis.incr(key));
  }

  pexpire(key: string, ms: number, mode?: 'NX' | 'XX' | 'GT' | 'LT'): this {
    return this.push(() => this.redis.pexpire(key, ms, mode));
  }

  expire(key: string, seconds: number, mode?: 'NX' | 'XX' | 'GT' | 'LT'): this {
    return this.push(() => this.redis.expire(key, seconds, mode));
  }

  set(key: string, value: string | number, ...args: (string | number)[]): this {
    return this.push(() => this.redis.set(key, value, ...args));
  }

  del(...keys: string[]): this {
    return this.push(() => this.redis.del(...keys));
  }

  async exec(): Promise<Reply[]> {
    const replies: Reply[] = [];
    for (const command of this.commands) {
      try {
        replies.push([null, await command()]);
      } catch (error) {
        replies.push([error as Error, null]);
      }
    }
    return replies;
  }
}
