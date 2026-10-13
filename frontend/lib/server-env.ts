import 'server-only';
import { z } from 'zod';
import { publicEnv } from './env';

const schema = z.object({
  apiInternalUrl: z.url().optional(),
  revalidateSecret: z.string().min(32).optional(),
});

const parsed = schema.parse({
  apiInternalUrl: process.env.API_INTERNAL_URL || undefined,
  revalidateSecret: process.env.REVALIDATE_SECRET || undefined,
});

export const serverEnv = {
  ...parsed,
  /** URL de l'API depuis le serveur Next (réseau interne si fourni). */
  apiBaseUrl: parsed.apiInternalUrl ?? publicEnv.apiUrl,
};
