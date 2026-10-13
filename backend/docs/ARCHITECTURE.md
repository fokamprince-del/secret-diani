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
- **worker** : même image que l'API, point d'entrée `dist/worker.js`. Consomme les files BullMQ (e-mails, images, factures, webhooks de paiement, tâches planifiées).
- **Appels sortants de l'API** : Stripe et PayPal (ouverture des pages de paiement, capture, vérification des webhooks PayPal) et Cloudflare Turnstile, vers des hôtes fixes, jamais vers une URL fournie par l'utilisateur.
- **migrate** : conteneur ponctuel (`prisma migrate deploy`) lancé à chaque déploiement.

## Cycle d'une requête

1. **Express** : helmet (CSP, HSTS…), CORS en liste blanche, analyse JSON (limite de taille, refus des clés `__proto__`/`constructor`/`prototype`).
2. **pino-http** : identifiant de requête (UUID v7, renvoyé dans `X-Request-Id`) et journal d'accès sans donnée personnelle.
3. **Gardes globales**, dans cet ordre : limitation de débit (Redis) → authentification « refus par défaut » (jeton d'accès JWT valide et session non révoquée, sauf routes `@Public()`) → rôles (`@Roles('admin')`, second facteur exigé). Les routes à cookie (`/auth/refresh`, `/auth/logout`) ajoutent la garde CSRF.
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
  audit/                  journal d'audit immuable, consultation admin
  auth/                   inscription, connexion, 2FA, mots de passe, gardes (JWT, rôles, CSRF)
  sessions/               sessions et refresh tokens rotatifs, appareils connectés
  users/                  profil et adresses
  rgpd/                   export et suppression des données du compte
  mail/                   gabarits, file d'envoi (API) et envoi Resend (worker)
  jobs/retention/         purge quotidienne des données expirées (worker)
  cli/                    commandes : création d'un administrateur, rechiffrement des secrets 2FA
  settings/               paramètres du site modifiables sans déploiement : registre typé, administration, lecture publique
  admin/                  back-office : tableau de bord, gestion des comptes (phase 9)
  common/captcha/         vérification anti-robot Cloudflare Turnstile des formulaires publics
  content/ media/         contenus éditoriaux, médiathèque (phase 3)
  catering/               traiteur : catalogue, demandes, acompte, créneaux (phase 4)
  shop/                   boutique : catalogue, panier, stock, livraison, commandes, factures (phase 5)
  payments/               paiements : Stripe Checkout, PayPal, webhooks, remboursements, réconciliation (phase 6)
  courses/                formations : packs, leçons, vidéo signée, quiz, progression, certificats (phase 7)
  documents/              worker : factures, certificats et fiches filigranées en PDF
  contact/                formulaire de contact et suivi des messages (phase 8)
  newsletter/             newsletter en double opt-in, désinscription signée en un clic (phase 8)
  <domaine>/              un module par domaine (catalog-traiteur, shop, …) — phases 3 à 9
prisma/                   schéma, migrations versionnées, seed
test/e2e/                 tests de bout en bout (application réelle, Postgres et Redis éphémères)
docker/                   initialisation Postgres, configuration Traefik
scripts/                  sauvegarde, restauration, export OpenAPI
```

## Correspondance MLD → tables

| MLD (cahier des charges) | Modèle Prisma | Table | Phase |
|---|---|---|---|
| — (paramètres du site) | `AppSetting` | `app_settings` | 1 |
| `utilisateur` | `User` | `users` | 2 |
| `session` | `Session` | `sessions` | 2 |
| `refresh_token` | `RefreshToken` | `refresh_tokens` | 2 |
| — (liens envoyés par e-mail) | `UserToken` | `user_tokens` | 2 |
| — (codes de secours 2FA) | `MfaBackupCode` | `mfa_backup_codes` | 2 |
| `adresse` | `Address` | `addresses` | 2 |
| `audit_log` | `AuditLog` | `audit_logs` | 2 |
| `media` | `Media` | `media` | 3 |
| — (catégories d'articles) | `ArticleCategory` | `article_categories` | 3 |
| `article` | `Article` | `articles` | 3 |
| `page_statique` | `StaticPage` | `static_pages` | 3 |
| `faq` | `Faq` | `faqs` | 3 |
| `avis` | `Review` | `reviews` | 3 |
| `categorie_traiteur` | `CateringCategory` | `catering_categories` | 4 |
| `produit_traiteur` | `CateringProduct` | `catering_products` | 4 |
| `variante_traiteur` | `CateringVariant` | `catering_variants` | 4 |
| `parfum` | `CateringFlavour` | `catering_flavours` | 4 |
| `produit_parfum` | `CateringProductFlavour` | `catering_product_flavours` | 4 |
| — (galerie d'un produit) | `CateringProductImage` | `catering_product_images` | 4 |
| `demande_traiteur` | `CateringRequest` | `catering_requests` | 4 |
| — (sélection figée d'une demande) | `CateringRequestItem` | `catering_request_items` | 4 |
| — (historique d'une demande) | `CateringRequestEvent` | `catering_request_events` | 4 |
| — (créneaux, parcours avancé) | `CateringSlot` | `catering_slots` | 4 |
| `produit_boutique` | `ShopProduct` | `shop_products` | 5 |
| `kit` (variante vendable) | `ShopVariant` | `shop_variants` | 5 |
| `composition_kit` | `ShopKitItem` | `shop_kit_items` | 5 |
| `stock` | `ShopStock` | `shop_stocks` | 5 |
| — (mouvements de stock) | `ShopStockMovement` | `shop_stock_movements` | 5 |
| — (galerie d'un produit) | `ShopProductImage` | `shop_product_images` | 5 |
| `tarif_livraison` | `ShippingRate` | `shipping_rates` | 5 |
| `panier` | `ShopCart` | `shop_carts` | 5 |
| `ligne_panier` | `ShopCartItem` | `shop_cart_items` | 5 |
| `commande` | `Order` | `orders` | 5 |
| `ligne_commande`, `commander_kit`, `commander_pack` | `OrderItem` (`kind`) | `order_items` | 5 |
| — (historique d'une commande) | `OrderEvent` | `order_events` | 5 |
| — (réservation de stock pendant le paiement) | `StockReservation` | `stock_reservations` | 5 |
| — (facture et sa numérotation) | `Invoice`, `InvoiceSequence` | `invoices`, `invoice_sequences` | 5 |
| `paiement` | `Payment` | `payments` | 6 |
| `remboursement` | `Refund` | `refunds` | 6 |
| `webhook_event` | `WebhookEvent` | `webhook_events` | 6 |
| `pack_formation` | `CoursePack` | `course_packs` | 7 |
| `formation` | `Course` | `courses` | 7 |
| `module` | `CourseModule` | `course_modules` | 7 |
| `lecon` | `Lesson` | `lessons` | 7 |
| `ressource` | `LessonResource` | `lesson_resources` | 7 |
| `quiz` | `Quiz` | `quizzes` | 7 |
| `question_quiz` | `QuizQuestion` | `quiz_questions` | 7 |
| `reponse_quiz` | `QuizChoice` | `quiz_choices` | 7 |
| `donner_acces` | `CourseAccess` | `course_accesses` | 7 |
| `progresser` | `LessonProgress` | `lesson_progress` | 7 |
| — (tentatives de quiz) | `QuizAttempt` | `quiz_attempts` | 7 |
| `certificat` | `Certificate` | `certificates` | 7 |
| `contact_message` | `ContactMessage` | `contact_messages` | 8 |
| `abonne_newsletter` | `NewsletterSubscriber` | `newsletter_subscribers` | 8 |
| — (appels personnalisés) | `CallRequest` | `call_requests` | 7 |

_Complété au fil des phases._
