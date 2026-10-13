import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { serverEnv } from '@/lib/server-env';

/**
 * Webhook appelé par le worker de l'API après une modification dans l'administration :
 * les pages étiquetées sont régénérées sans redéploiement (ISR).
 * Authentification par secret partagé (`Authorization: Bearer …`), comparé en temps constant.
 */
const bodySchema = z.object({
  tags: z
    .array(
      z
        .string()
        .max(256)
        .regex(/^[a-z][a-z-]*(:[a-z0-9][a-z0-9-]*)?$/),
    )
    .min(1)
    .max(50),
});

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  // Les empreintes ont la même longueur : pas de fuite par la durée de comparaison.
  return timingSafeEqual(digest(token), digest(secret));
}

export async function POST(request: Request): Promise<Response> {
  const secret = serverEnv.revalidateSecret;
  if (!secret) {
    return Response.json({ message: 'Revalidation non configurée.' }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return Response.json({ message: 'Accès refusé.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ message: 'Corps JSON invalide.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ message: 'Étiquettes invalides.' }, { status: 400 });
  }

  const tags = [...new Set(parsed.data.tags)];
  for (const tag of tags) revalidateTag(tag, 'max');
  return Response.json({ revalidated: tags });
}
