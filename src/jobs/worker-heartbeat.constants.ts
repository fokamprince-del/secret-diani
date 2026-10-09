/** Clé Redis (hors préfixe `diani:`) rafraîchie par le worker ; lue par la sonde de santé Docker. */
export const WORKER_HEARTBEAT_KEY = 'worker:heartbeat';
export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;
export const WORKER_HEARTBEAT_TTL_SECONDS = 60;
