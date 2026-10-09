# Architecture

## Vue d'ensemble

```
                 Internet
                    │  HTTPS (TLS ≥ 1.2)
             ┌──────▼──────┐
             │ Cloudflare  │  CDN, cache des catalogues publics, protection DDoS
             └──────┬──────┘
                    │
┌───────────────────┼────────────────────────── VPS (Docker) ─┐
│            ┌──────▼──────┐                                  │
│   réseau   │   Traefik   │  certificats Let's Encrypt,      │
│   edge     └──────┬──────┘  en-têtes de sécurité            │
│            ┌──────▼──────┐          ┌──────────────┐        │
│            │     api     │          │    worker    │ egress │──► Resend, Stripe,
│            │  NestJS     │          │   BullMQ     │        │    Bunny, OVH S3
│            └──┬───────┬──┘          └──┬────────┬──┘        │
│   réseau      │       │   files de jobs │        │          │
│   internal ┌──▼───┐ ┌─▼────────────────▼─┐      │          │
│ (sans accès│Postgr│ │       Redis        │◄─────┘          │
│  extérieur)│ 16   │ │ cache, débit, files│                  │
│            └──────┘ └────────────────────┘                  │
└──────────────────────────────────────────────────────────────┘
```

- **api** : sert l'API REST (`/api/v1/...`) et les sondes (`/health`, `/ready`). Aucun traitement lourd : les e-mails, PDF, images et webhooks partent en file d'attente.
- **worker** : même image que l'API, point d'entrée `dist/worker.js`. Consomme les files BullMQ.
- **migrate** : conteneur ponctuel (`prisma migrate deploy`) lancé à chaque déploiement.

## Cycle d'une requête

1. **Express** : helmet (CSP, HSTS…), CORS en liste blanche, analyse JSON (limite de taille, refus des clés `__proto__`/`constructor`/`prototype`).
2. **pino-http** : identifiant de requête (UUID v7, renvoyé dans `X-Request-Id`) et journal d'accès sans donnée personnelle.
3. **Gardes globales** : limitation de débit (Redis). L'authentification et les rôles, avec refus par défaut, arrivent en phase 2.
4. **ValidationPipe global** : DTO stricts, messages en français.
5. **Intercepteur de délai** (30 s), puis **contrôleur → service → dépôt (Prisma)**.
6. **Filtre d'exceptions global** : toute erreur est convertie au format unique `ErrorResponseDto`.

## Arborescence

```
src/
  main.ts                 point d'entrée API (écoute HTTP, délais serveur)
  worker.ts               point d'entrée worker (contexte Nest sans HTTP)
  worker-healthcheck.ts   sonde de santé du conteneur worker
  instrument.ts           Sentry (chargé en premier, sans donnée personnelle)
  bootstrap.ts            configuration HTTP partagée par main.ts et les tests e2e
  swagger.ts              document OpenAPI
  app.module.ts           module racine (pipes, filtres, gardes, intercepteurs globaux)
  worker.module.ts        module racine du worker
  config/                 schéma Zod des variables d'environnement, service typé
  common/                 erreurs, filtres, pipes, intercepteurs, limitation de débit, utilitaires
  logging/                configuration Pino (masquage, sérialiseurs)
  prisma/                 client Prisma partagé
  redis/                  client Redis partagé
  jobs/                   configuration BullMQ, battement de cœur du worker
  health/                 sondes /health et /ready
  <domaine>/              un module par domaine (auth, catalog-traiteur, shop, …) — phases 2 à 9
prisma/                   schéma, migrations versionnées, seed
test/e2e/                 tests de bout en bout (application réelle, Postgres et Redis éphémères)
docker/                   initialisation Postgres, configuration Traefik
scripts/                  sauvegarde, restauration, export OpenAPI
```

## Correspondance MLD → tables

| MLD (cahier des charges) | Modèle Prisma | Table | Phase |
|---|---|---|---|
| — (paramètres du site) | `AppSetting` | `app_settings` | 1 |

_Complété au fil des phases._
