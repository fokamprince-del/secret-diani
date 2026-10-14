# Les Secrets de Diani — frontend

Application Next.js (App Router) du site « Les Secrets de Diani » : traiteur, formations en ligne, boutique de kits et conseils. Elle consomme l'API NestJS du dépôt voisin `backend/` (`/api/v1`).

- Cahier des charges : [docs/CAHIER_DES_CHARGES.md](docs/CAHIER_DES_CHARGES.md)
- Décisions techniques : [docs/DECISIONS.md](docs/DECISIONS.md)
- Contribuer : [CONTRIBUTING.md](CONTRIBUTING.md)

## Démarrer

Prérequis : Node 24 (`.nvmrc`), npm 11. L'API doit tourner pour afficher les contenus ; sans elle, les pages s'affichent avec leurs états vides ou d'erreur.

```bash
npm ci
cp .env.example .env.local   # puis compléter
npm run dev                  # http://localhost:5173
```

## Commandes

| Commande                                      | Rôle                                                                |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                                 | Serveur de développement (port 5173)                                |
| `npm run build`                               | Build de production (serveur autonome dans `.next/standalone`)      |
| `npm run start`                               | Lance le build de production                                        |
| `npm run lint` · `typecheck` · `format:check` | Qualité du code                                                     |
| `npm test`                                    | Tests de composants (Vitest, Testing Library, axe)                  |
| `npm run build:e2e`                           | Build de test, pages générées avec l'API factice (`tests/mock-api`) |
| `npm run test:e2e`                            | Parcours Playwright sur le build de test (mobile et desktop)        |
| `npm run mock-api`                            | API factice seule (port 3999), données de `tests/mock-api`          |
| `npm run lhci`                                | Lighthouse CI mobile sur le build de production                     |
| `npm run api:sync`                            | Copie `../backend/docs/openapi.json` et régénère le client typé     |
| `npm run api:check`                           | Vérifie que le client typé correspond à la spécification            |

## Variables d'environnement

Voir [.env.example](.env.example). Les variables `NEXT_PUBLIC_*` sont figées dans le JavaScript **au build** : en Docker, elles sont passées en arguments de build.

| Variable                         | Où      | Rôle                                                                         |
| -------------------------------- | ------- | ---------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`           | public  | URL du site (canoniques, Open Graph, sitemap)                                |
| `NEXT_PUBLIC_API_URL`            | public  | Origine de l'API                                                             |
| `NEXT_PUBLIC_MEDIA_URL`          | public  | Origine des médias (S3 / CDN)                                                |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`   | public  | Mesure d'audience (après consentement) ; vide = désactivée                   |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public  | Clé publique Turnstile (contact, newsletter) ; vide = pas de captcha         |
| `API_INTERNAL_URL`               | serveur | URL de l'API depuis le serveur Next (réseau Docker)                          |
| `REVALIDATE_SECRET`              | serveur | Secret partagé avec l'API (`FRONTEND_REVALIDATE_SECRET`), 32 caractères min. |

Les clés publiques Stripe/PayPal arrivent avec les phases qui les utilisent. Le numéro WhatsApp, l'e-mail de contact et les réseaux sociaux ne sont pas des variables : ils se règlent dans l'administration (`GET /site/settings`).

## Tests e2e et API factice

Les pages publiques sont générées au build : pour les tests, elles le sont avec une API factice (`tests/mock-api`, port 3999, données typées par l'OpenAPI). `npm run build:e2e` la démarre le temps du build, Playwright la relance pour les tests. Ce build sert aux tests uniquement ; l'image Docker se construit avec les vraies variables.

## Organisation

```
app/            routes (App Router), sitemap, robots, pages d'erreur, webhook de revalidation
components/     ui · layout · home · catering · courses · shop · forms · providers
lib/            client d'API typé, environnement, SEO, formatage, consentement
styles/         jetons de design (variables CSS)
openapi/        copie versionnée de la spécification de l'API
tests/          unit (Vitest) · e2e (Playwright)
```

## Docker

```bash
docker build -t diani-frontend \
  --build-arg NEXT_PUBLIC_SITE_URL=https://site.exemple \
  --build-arg NEXT_PUBLIC_API_URL=https://api.site.exemple .
docker run -p 5173:5173 -e REVALIDATE_SECRET=… -e API_INTERNAL_URL=http://api:3000 diani-frontend
```
