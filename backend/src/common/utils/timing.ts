import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Exécute `task` en garantissant une durée minimale de réponse : les chemins
 * « le compte existe » et « le compte n'existe pas » deviennent indiscernables (anti-énumération).
 * Les erreurs sont propagées après le même délai.
 */
export async function withMinDuration<T>(minMs: number, task: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await task();
  } finally {
    const remaining = minMs - (Date.now() - startedAt);
    if (remaining > 0) await sleep(remaining);
  }
}
