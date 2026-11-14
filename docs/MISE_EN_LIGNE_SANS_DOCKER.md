# Mise en ligne sans Docker

Pour démarrer vite, sans serveur à administrer. Docker (`backend/docker-compose.prod.yml`)
reste possible plus tard : les mêmes variables servent.

## Ce qu'il faut

| Pièce | Service conseillé | Remarque |
|---|---|---|
| Base PostgreSQL | **Neon** | Fait : migrations et données de référence appliquées. |
| Redis | **Upstash** (offre gratuite) | Obligatoire : sessions, limitation de débit, files d'e-mails. Politique d'éviction **noeviction**, URL en `rediss://`. |
| API + worker | Render, Railway ou un VPS (Node 22+) | Deux processus : `npm start` (API) et `npm run start:worker` (e-mails, PDF, médias). |
| Site | Vercel ou le même hébergeur Node | `npm run build` puis `npm start`. |
| Fichiers (photos, PDF) | OVH Object Storage, Cloudflare R2 ou Backblaze B2 | Deux buckets : un privé, un public. |
| E-mails | Resend | Domaine vérifié (SPF, DKIM). |
| Anti-robot | Cloudflare Turnstile | Clé de site (front) + clé secrète (API). |
| Paiement | Stripe et/ou PayPal | Au moins un, sinon l'API refuse de démarrer en production. |

## 1. Base Neon : deux URL

Dans `backend/.env` (et dans les variables de l'hébergeur) :

- `DATABASE_URL` : URL **poolée** (hôte `…-pooler…`), rôle `diani_app` (droits limités : il ne
  peut ni modifier les tables ni désactiver les déclencheurs du journal d'audit). Paramètres :
  `&connection_limit=5&pool_timeout=15&connect_timeout=15`.
- `DIRECT_URL` : URL **directe** (sans `-pooler`), rôle `neondb_owner`. Seulement pour les
  migrations et le seed ; inutile sur l'hébergeur de l'API si vous migrez depuis votre poste.

Commandes (depuis `backend/`) :

```bash
npm run db:status   # migrations en attente
npm run db:deploy   # applique les migrations (à chaque mise à jour du code)
npm run db:seed     # données de référence, relançable sans doublon
```

Le mot de passe de `diani_app` se change avec
`ALTER ROLE diani_app WITH LOGIN PASSWORD '…'` (console SQL Neon), puis dans `DATABASE_URL`.

## 2. API et worker

```bash
cd backend
npm ci
npm run build
npm start              # API, port $PORT
npm run start:worker   # second processus, même code, mêmes variables
```

Variables de production indispensables (l'API refuse de démarrer sinon, sans jamais afficher
les valeurs) :

```
NODE_ENV=production
PUBLIC_SITE_URL=https://lessecretsdediani.fr
PUBLIC_API_URL=https://api.lessecretsdediani.fr
DATABASE_URL=…            # Neon poolée, diani_app
REDIS_URL=rediss://…      # Upstash
JWT_ACCESS_SECRET=…       # openssl rand -base64 48
FIELD_ENCRYPTION_KEY=…    # openssl rand -base64 32 — à garder aussi hors de l'hébergeur
MAIL_TRANSPORT=resend
RESEND_API_KEY=…
TURNSTILE_SECRET_KEY=…
STRIPE_SECRET_KEY=… et STRIPE_WEBHOOK_SECRET=…   (ou les trois variables PayPal)
S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
S3_BUCKET_PRIVATE, S3_BUCKET_PUBLIC, MEDIA_PUBLIC_BASE_URL
S3_AUTO_CREATE_BUCKETS=false
SWAGGER_ENABLED=false
LOG_PRETTY=false
TRUST_PROXY_HOPS=1        # nombre de proxys devant l'API (1 sur Render/Railway)
FRONTEND_REVALIDATE_URL=https://lessecretsdediani.fr/api/revalidate
FRONTEND_REVALIDATE_SECRET=…  # le même que REVALIDATE_SECRET du site
```

Premier administrateur (une fois, depuis le serveur de l'API ou votre poste avec la même base) :

```bash
npx ts-node --transpile-only src/cli/create-admin.ts   # ou : node dist/cli/create-admin.js
```

Contrôle : `GET https://api…/health` puis `https://api…/ready` (base et Redis joignables).

## 3. Site (frontend)

```
NEXT_PUBLIC_SITE_URL=https://lessecretsdediani.fr
NEXT_PUBLIC_API_URL=https://api.lessecretsdediani.fr
NEXT_PUBLIC_MEDIA_URL=…          # = MEDIA_PUBLIC_BASE_URL de l'API
NEXT_PUBLIC_TURNSTILE_SITE_KEY=…
REVALIDATE_SECRET=…              # = FRONTEND_REVALIDATE_SECRET de l'API
```

Les variables `NEXT_PUBLIC_*` sont figées au moment du `npm run build` : les définir **avant** de
construire, et reconstruire après tout changement.

## 4. Après la mise en ligne

1. Déclarer les webhooks Stripe/PayPal vers `https://api…/api/v1/payments/webhooks/stripe` et `…/paypal` (voir RUNBOOK).
2. Connexion Google : URI de redirection `https://api…/api/v1/auth/google/callback`.
3. Sauvegardes : Neon garde un historique (restauration à un instant donné) ; vérifier la durée
   de rétention de votre offre.
4. Faire une commande test complète (boutique, formation, demande traiteur) en mode test Stripe.
