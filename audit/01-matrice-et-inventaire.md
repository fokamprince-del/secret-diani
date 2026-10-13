# Audit de conformité — Les Secrets de Diani

**Étape 1 de la phase 1 : matrice d'exigences (§1) et inventaire (§2)**
Date : 12/10/2026 · Auditeur : agent de code · Mode : lecture seule (aucun fichier de `backend/` ni de `frontend/` modifié par cette étape).

> Les statuts ci-dessous sont **provisoires** : ils reposent sur la lecture du code et sur les commandes déjà exécutées (lint, types, tests unitaires et e2e, démarrage). Les sondes de sécurité, les essais de concurrence et les mesures front restent à lancer après ta validation.

---

## 0. Ce qu'il faut retenir avant tout

1. **Le frontend n'existe pas.** `frontend/` est un dépôt Git sans aucun commit. Il ne contient que `docs/CAHIER_DES_CHARGES.md`. Les sections §4 (front), §4.2 (animations), §4.3 (performance), §4.4 (accessibilité), §4.6 (SEO front), §4.7 (parcours Playwright) et §5 (croisement front ↔ back) **ne peuvent pas être auditées** : tout y est ❌ « non commencé ».
2. **Le backend en est à la phase 3 sur 10** (socle, authentification, contenus et médias). Les phases 4 à 10 (traiteur, boutique, paiements, formations, e-mails/contact/newsletter, admin, durcissement et charge) ne sont pas commencées. La phase 3 n'est **pas commitée**.
3. Ce qui existe est de bonne qualité et vérifié à l'exécution : lint et types sans erreur, 175 tests unitaires et 107 tests e2e verts, couverture de 83 % des lignes, API et worker qui démarrent, `/ready` OK.
4. L'audit va donc surtout produire **une liste de choses non construites**, plus que de défauts. La matrice sépare les deux : la colonne **Phase** indique quand l'exigence est censée arriver.

---

## 1. Sources de vérité

| Réf. | Document | Trouvé ? | Emplacement |
|---|---|---|---|
| **DT** | Dossier technique (cahier des charges client), v1.0 sept. 2026 | ✅ | `C:\Users\PRINCE\Downloads\Telegram Desktop\Dossier_technique_Site_Les_Secrets_de_Diani.docx` (hors dépôt) |
| **CB** | Prompt de construction du backend | ✅ | `backend/docs/CAHIER_DES_CHARGES.md` |
| **CF** | Prompt de construction du frontend | ✅ | `frontend/docs/CAHIER_DES_CHARGES.md` |
| **DEC** | Décisions du projet | ✅ partiel | `backend/docs/DECISIONS.md` (D-001 à D-039, **phases 1 et 2 seulement**) |
| **MLD** | MCD/MLD « 24 tables », cas d'utilisation | ❌ | Introuvable sur le disque |
| **PROTO** | Prototype statique `Site_Les_Secrets_de_Diani.zip` | ❌ | Introuvable : aucune référence visuelle disponible |
| **AU** | Prompt d'audit (ce que tu m'as collé) | ✅ | — |

**Il me manque deux documents :** le MLD (24 tables) et le prototype. Sans le prototype, les contrôles visuels (§4.1) ne pourront se faire que par rapport aux jetons écrits dans CF.

### 1.1 Contradictions entre les sources (à trancher par toi)

| # | Sujet | Sources en conflit | Constat | Proposition |
|---|---|---|---|---|
| C1 | **Stack technique** | DT §11 ↔ CB §2, CF §3 | DT recommande **WordPress + WooCommerce + LMS** (« l'architecture la plus cohérente »). CB et CF imposent NestJS + Next.js. Le prompt d'audit place DT en premier dans l'ordre des sources. | Le projet a choisi NestJS + Next.js, mais ce choix n'est consigné ni dans `DECISIONS.md` ni validé par écrit par le client. → Ajouter une décision D-000 avec l'accord du client. |
| C2 | **Nombre de tables** | AU (« 24 tables du MLD ») ↔ CB §4 | CB §4 liste **43 entités**. Le MLD à 24 tables n'est pas fourni. | Me fournir le MLD, sinon j'audite contre la liste de CB §4. |
| C3 | **Acompte à exactement 50 €** | DT, CB §1, CB §5.2 | « 10 € si < 50 € ; 20 € si > 50 € » : le cas 50 € pile n'est pas défini (CB §5.2 dit « au-delà »). | Décider : 50 € → 20 € (lecture de « au-delà » au sens de ≥) ? |
| C4 | **Liens dans les e-mails** | AU §3.3 (« liens signés ») ↔ DEC D-028 | Le projet utilise des jetons aléatoires de 256 bits stockés hachés, à usage unique, plutôt que des liens HMAC. | Équivalent ou plus sûr (révocable). Je propose de considérer ✅ si l'usage unique et l'expiration sont prouvés. |
| C5 | **Limitation de débit des webhooks** | AU §3.4 (« webhooks → 429 ») | Un 429 renvoyé à Stripe ou PayPal provoque des relances et peut retarder des paiements légitimes. | Limiter le débit avant la vérification de signature seulement, avec un seuil large. À confirmer. |
| C6 | **Nombre de gabarits d'e-mail** | AU (« 11 gabarits ») ↔ CB §5.8 | CB §5.8 en liste 11 ou 12 selon qu'on compte « demande traiteur client + admin » pour un ou deux. | Auditer contre la liste de CB §5.8. |
| C7 | **CTA du hero Traiteur** | DT §05 (« Commander maintenant ») ↔ CB/CF (pas de paiement en ligne) | Le libellé suggère un achat alors que le parcours est un contact. | Garder le libellé, mais il doit mener au contact ou à la demande personnalisée. |
| C8 | **Prix des kits** | DT §07 ↔ seeds | DT : prix « de maquette, à valider après calcul de rentabilité ». | Les charger en seed (modifiables en admin) et le signaler comme risque métier, pas technique. |
| C9 | **« Next.js dernière LTS »** | CF §3 | Next.js n'a pas de version LTS officielle. | Retenir la dernière version stable. |

---

## 2. Inventaire

### 2.1 Vue d'ensemble

| Élément | Backend | Frontend |
|---|---|---|
| Dépôt Git | `backend/.git` : 2 commits (phase 1, phase 2) + phase 3 non commitée (≈ 30 fichiers modifiés ou nouveaux) | `frontend/.git` : **0 commit** |
| Code | ≈ 9 700 lignes TS (hors tests) | **aucun** |
| Tests | 23 fichiers de tests unitaires (≈ 1 500 lignes) + 7 suites e2e | aucun |
| Avancement | Phases 1–3 sur 10 | Phase 0 sur 8 |

### 2.2 Backend — détail

**Stack (exécutée)** : Node 24.21, NestJS 11.2.7, TypeScript 5.9.3, Prisma 6.19.3, PostgreSQL 16, Redis, BullMQ 5.81, Jest 30, SeaweedFS (S3 de développement), ClamAV en option.
Versions figées sans `^`. Deux surcharges npm pour des dépendances vulnérables (DEC D-017).

**Modules présents** (`src/`) : `auth`, `users`, `sessions`, `content`, `media`, `storage`, `mail`, `audit`, `rgpd`, `jobs`, `health`, `config`, `logging`, `prisma`, `redis`, `cli`, `common`.

**Modules prévus mais absents** : `catalog-traiteur`, `catering-requests`, `courses`, `enrollments`, `progress`, `shop`, `payments`, `contact`, `newsletter`, `video`, `admin` (des routes admin existent dans `content` et `audit`, mais il n'y a pas de module back-office).

**Modèle de données** : 14 modèles Prisma sur les 43 entités de CB §4.
- Présents : `User`, `Session`, `RefreshToken`, `UserToken`, `MfaBackupCode`, `Address`, `AuditLog`, `AppSetting`, `Media`, `ArticleCategory`, `Article`, `StaticPage`, `Faq`, `Review`.
- 3 migrations : `init`, `auth_accounts`, `content_media`. 18 contraintes `CHECK` au total.

**Routes** : 74 décorateurs de route dans les contrôleurs. ⚠️ `docs/openapi.json` n'en documente que **25 chemins** (auth, me, audit) : **les routes de la phase 3 (contenus, médias, SEO) n'y sont pas**. L'export est périmé.

**Variables d'environnement** : schéma Zod de 34 clés (`src/config/env.schema.ts`), refus de démarrer si une clé est invalide (DEC D-006). `.env.example` est commenté. Les variables des phases 6 à 8 (Stripe, PayPal, Bunny, Turnstile) sont annoncées en commentaire, pas encore validées.

**Scripts** : `build`, `start`, `start:worker`, `lint`, `format:check`, `typecheck`, `test`, `test:cov`, `test:e2e`, `prisma:*`, `openapi:export`.
Cibles Make : `dev`, `test`, `migrate`, `backup`, `restore`, `create-admin`, `create-admin-prod`, etc.

**CI** (`.github/workflows/ci.yml`) : qualité (format, lint, types), tests unitaires avec couverture, e2e sur services éphémères, `npm audit` (prod : tout niveau ; outillage : high et plus), build de l'image.
**Absent de la CI** : push vers ghcr.io, déploiement SSH, migration, test de fumée, rollback automatique, Trivy (prévus en phase 10).

**Docker** : image multi-étapes `node:24-alpine`, utilisateur `node`, lecture seule, `tini`.
`docker-compose.prod.yml` : Traefik sans socket Docker, réseau `internal` pour Postgres et Redis (aucun port publié), healthchecks et limites CPU/mémoire sur chaque service.

**Documentation** :
- Présente : `README`, `ARCHITECTURE`, `DECISIONS` (s'arrête à la phase 2), `SECURITY` (STRIDE et ASVS mentionnés), `RGPD` (registre), `RUNBOOK`, `openapi.json` (périmé).
- **Absente** : `docs/INCIDENT.md` (procédure de violation sous 72 h, exigée par CB §6.11 et §8), mini-guide d'administration, décisions de la phase 3.

**Secrets** :
- `.env` est ignoré par Git et n'a jamais été commité.
- `.env.test` est commité avec des valeurs manifestement factices (`test-only-…`, clé composée d'octets séquentiels), différentes de celles du `.env`. Aucun secret réel trouvé dans l'historique (recherche par motifs : clés Stripe, Resend, AWS, clés privées, JWT, clé de chiffrement).

**Résultats d'exécution déjà obtenus** (12/10/2026) :

| Commande | Résultat |
|---|---|
| `prisma validate` / `prisma format --check` | ✅ |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 avertissement |
| `npm run format:check` | ✅ (après correction de `jest.config.ts`, faite avant cet audit) |
| `npm run build` | ✅ |
| `npm run test:cov` | ✅ 175/175, lignes 82,97 %, branches 83,65 % (seuil global de 80 % respecté) |
| `npm run test:e2e` | ✅ 107/107 sur Postgres, Redis et S3 éphémères |
| Démarrage API + worker | ✅ `/health` 200, `/ready` 200 (base + Redis), Swagger servi, worker démarré |
| `prisma migrate deploy` (base de dev) | ✅ 3 migrations (la 3ᵉ était en attente avant l'audit) |
| `npm audit`, export OpenAPI, Lighthouse, axe, k6 | ⏳ pas encore lancés |

### 2.3 Frontend — détail

Rien à inventorier : aucun `package.json`, aucun code, aucun test, aucune CI. Seul le cahier des charges (CF) est présent.

---

## 3. Matrice d'exigences

Légende du statut provisoire : ✅ conforme (preuve) · ⚠️ partiel · ❌ absent · ⏳ à vérifier à l'exécution · ➖ non applicable.
**Phase** : phase du plan où l'exigence est due (B = backend, CB §9 ; F = frontend, CF §14). « B1–3 » = déjà livrée, donc un ❌ y est un **défaut** ; une phase future signifie **pas encore construit**.

### 3.1 Backend — architecture et socle

| ID | Source | Exigence | Phase | Statut | Preuve / écart |
|---|---|---|---|---|---|
| B-ARC-01 | CB §0.1 | TS strict, ESLint + Prettier, aucun `any` injustifié | B1 | ✅ | typecheck + lint 0 erreur ; `any` à rechercher ⏳ |
| B-ARC-02 | CB §0.3 | Config validée au démarrage (Zod), refus si variable manquante | B1 | ✅ | `src/config/env.schema.ts`, DEC D-006 ; refus de démarrer à tester ⏳ |
| B-ARC-03 | CB §8 | `.env.example` complet et commenté | B1 | ✅ | 34 clés du schéma présentes et commentées |
| B-ARC-04 | AU §3.1 | Aucun secret commité (y compris dans l'historique) | — | ✅ | voir §2.2 Secrets |
| B-ARC-05 | CB §3 | Un module par domaine (20 modules prévus) | B1–10 | ⚠️ | 9 modules métier sur 20 (11 absents : phases 4 à 10) |
| B-ARC-06 | CB §3 | Contrôleur → service → dépôt, aucune logique métier dans les contrôleurs | B1 | ⏳ | DEC D-023 : Prisma fait office de dépôt (écart assumé) ; lecture des contrôleurs à faire |
| B-ARC-07 | CB §2 | Préfixe `/api/v1`, OpenAPI | B1 | ⚠️ | préfixe ✅ (`bootstrap.ts:10`) ; **`docs/openapi.json` périmé (25 chemins sur 74 routes)** |
| B-ARC-08 | CB §2 | `/health` et `/ready` (DB + Redis) | B1 | ✅ | exécuté : 200 / 200 |
| B-ARC-09 | CB §7 | Arrêt gracieux, timeouts, pool dimensionné | B1 | ⏳ | DEC D-011 ; arrêt sur SIGTERM à tester |
| B-ARC-10 | CB §0.2 | Chaque phase : migrations, tests verts, OpenAPI à jour, résumé | B3 | ⚠️ | phase 3 : tests ✅, **OpenAPI ❌, DECISIONS ❌, non commitée** |
| B-ARC-11 | CB §0.4 | Décisions consignées dans DECISIONS.md | B3 | ❌ | aucune décision de la phase 3 (médias, Markdown, cache, revalidation) |
| B-ARC-12 | CB §0.5 | Erreurs en français, sans fuite interne | B1 | ✅ | DEC D-007, filtre global ; sondes ⏳ |
| B-ARC-13 | C1 | Choix de stack consigné et validé par le client | — | ❌ | contradiction C1 |

### 3.2 Backend — base de données

| ID | Source | Exigence | Phase | Statut | Preuve / écart |
|---|---|---|---|---|---|
| B-BDD-01 | CB §4 / AU | Toutes les tables du MLD | B1–10 | ⚠️ | 14 modèles sur 43 entités (24 selon AU, cf. C2) |
| B-BDD-02 | CB §4 | UUID v7, `created_at`, `updated_at`, `deleted_at` là où c'est utile | B1 | ⏳ | DEC D-004 ; lecture du schéma |
| B-BDD-03 | CB §4 | `CHECK` (prix ≥ 0, quantités ≥ 0, notes 1–5), index sur les FK | B1–3 | ⏳ | 18 `CHECK` trouvés ; FK sans index à rechercher |
| B-BDD-04 | CB §1 | Prix en centimes entiers | B4–6 | ➖ | aucun prix encore modélisé |
| B-BDD-05 | CB §4 | Prix figé dans `ligne_commande` | B5 | ❌ | non construit |
| B-BDD-06 | CB §4 | Migrations versionnées, rejouables à vide | B1 | ✅ | appliquées à vide en e2e (D-015) |
| B-BDD-07 | CB §1, §4 | Seeds : plateaux, à la carte, layer cakes, parfums, packs, kits, formation pilote | B4–7 | ❌ | le seed ne contient que des paramètres, catégories, pages légales et FAQ (phase 3) |
| B-BDD-08 | CB §4 | Aucun admin avec mot de passe connu en seed ; création par CLI | B2 | ✅ | `prisma/seed.ts:8`, `make create-admin` (D-039) |
| B-BDD-09 | CB §6.7 | `audit_log` immuable | B2 | ✅ | trigger `audit_logs_immutable` (D-034) ; tentative d'UPDATE à faire ⏳ |
| B-BDD-10 | CB §4 | `webhook_event` (idempotence) | B6 | ❌ | non construit |

### 3.3 Backend — fonctionnalités métier

| ID | Source | Exigence | Phase | Statut | Preuve / écart |
|---|---|---|---|---|---|
| B-AUTH-01 | CB §5.1 | Inscription + vérification d'e-mail (lien à usage unique, renvoi limité) | B2 | ✅ ⏳ | routes `/auth/register`, `/auth/email/*` ; e2e `auth.e2e-spec.ts` |
| B-AUTH-02 | CB §5.1 | Connexion, déconnexion, déconnexion de tous les appareils | B2 | ✅ ⏳ | `/auth/login`, `/auth/logout`, `/auth/logout-all` |
| B-AUTH-03 | CB §5.1 | Mot de passe oublié / réinitialisation (30 min, usage unique) | B2 | ✅ ⏳ | D-024, D-028 |
| B-AUTH-04 | CB §5.1 | Changement de mot de passe → autres sessions invalidées | B2 | ⏳ | `/auth/password/change` |
| B-AUTH-05 | CB §5.1 | Profil, adresses | B2 | ✅ ⏳ | `/me`, `/me/addresses` |
| B-AUTH-06 | CB §5.1 | Export RGPD, suppression/anonymisation (factures conservées) | B2 | ✅ ⏳ | `/me/export`, `DELETE /me`, D-033 |
| B-AUTH-07 | CB §5.1 | 2FA admin TOTP + codes de secours | B2 | ✅ ⏳ | `/auth/2fa/*`, D-030, e2e `admin-mfa` |
| B-AUTH-08 | CB §5.1 | Passkey (WebAuthn), optionnel | B9 | ❌ | reporté (D-030) |
| B-TRA-01 | CB §5.2 | Catalogue traiteur public | B4 | ❌ | non construit |
| B-TRA-02 | CB §5.2 | `POST /catering-requests` + e-mails client et admin + message WhatsApp | B4 | ❌ | non construit |
| B-TRA-03 | CB §5.2 | Statuts de demande, acompte 10 / 20 € automatique | B4 | ❌ | non construit (+ C3) |
| B-TRA-04 | CB §5.2 | Drapeau `CATERING_ONLINE_ORDERING=false` | B4 | ⚠️ | variable présente et validée ; aucun code derrière |
| B-FOR-01 | CB §5.3 | Droits d'accès par pack (Premium ⊇ Intermédiaire ⊇ Essentiel) | B7 | ❌ | non construit |
| B-FOR-02 | CB §5.3 | Accès accordé uniquement après webhook signé | B6–7 | ❌ | non construit |
| B-FOR-03 | CB §5.3 | URL vidéo signée à courte durée (Bunny) | B7 | ❌ | non construit |
| B-FOR-04 | CB §5.3 | Reprise de lecture (position toutes les ~15 s, débit limité) | B7 | ❌ | non construit |
| B-FOR-05 | CB §5.3 | PDF par URL signée, filigrane optionnel | B7 | ❌ | stockage S3 présent, aucune ressource de formation |
| B-FOR-06 | CB §5.3 | Quiz corrigé côté serveur, bonnes réponses jamais envoyées avant | B7 | ❌ | non construit |
| B-FOR-07 | CB §5.3 | Progression, certificat PDF numéroté avec page de vérification | B7 | ❌ | non construit |
| B-FOR-08 | CB §5.3 | Suivi des appels personnalisés restants | B7 | ❌ | non construit |
| B-BOU-01 | CB §5.4 | Produits, kits, composition, comparatif | B5 | ❌ | non construit |
| B-BOU-02 | CB §5.4 | Panier invité (cookie signé) et connecté, fusion, prix recalculés | B5 | ❌ | non construit |
| B-BOU-03 | CB §5.4 | Stock sans survente (20 achats simultanés pour 5 en stock → 5 réussites), réservation de 15 min | B5 | ❌ | non construit |
| B-BOU-04 | CB §5.4 | Livraison par zone/poids, retrait | B5 | ❌ | non construit |
| B-BOU-05 | CB §5.4 | Statuts de commande, historique, suivi invité par lien signé | B5 | ❌ | non construit |
| B-BOU-06 | CB §5.4 | Factures numérotées sans trou, conservées 10 ans | B5 | ❌ | non construit |
| B-PAY-01 | CB §5.5 | Stripe Checkout + PayPal, session créée côté serveur | B6 | ❌ | non construit |
| B-PAY-02 | CB §5.5 | Webhooks : signature, corps brut, idempotence, file | B6 | ❌ | non construit |
| B-PAY-03 | CB §5.5 | États échoué / abandonné / remboursé / litige | B6 | ❌ | non construit |
| B-PAY-04 | CB §5.5 | Réconciliation quotidienne | B6 | ❌ | non construit |
| B-CON-01 | CB §5.6 | Articles brouillon / publié / programmé, slug, SEO, Markdown assaini | B3 | ✅ ⏳ | `src/content`, `sanitize-html`, e2e `content` |
| B-CON-02 | CB §5.6 | Pages statiques, FAQ ordonnable | B3 | ✅ ⏳ | `admin/pages`, `admin/faq` |
| B-CON-03 | CB §5.6 | Avis traiteur modérés, aucun avis inventé | B3 | ✅ ⏳ | `ReviewStatus`, `admin/reviews` ; aucun avis en seed |
| B-CON-04 | CB §5.6 | Médias : type réel (signature), renommage aléatoire, EXIF retiré, WebP/AVIF, ClamAV | B3 | ✅ ⏳ | `media/file-signature.ts`, `image-pipeline.ts:41`, `clamav.client.ts` ; sondes de fichiers piégés ⏳ |
| B-CON-05 | CB §5.6 | `sitemap.xml`, `robots.txt`, JSON-LD | B3 | ⚠️ | `robots.txt` ✅ (exécuté) ; contrôleur `seo` ; JSON-LD à vérifier ⏳ |
| B-CON-06 | CB §7 | Cache Redis des contenus + invalidation à la modification + revalidation du front | B3 | ⏳ | `CONTENT_CACHE_TTL_SECONDS`, `FRONTEND_REVALIDATE_URL` |
| B-CTC-01 | CB §5.7 | Contact : honeypot, débit, Turnstile, e-mails | B8 | ❌ | non construit |
| B-CTC-02 | CB §5.7 | Newsletter : double opt-in, désinscription en un clic, preuve de consentement | B8 | ❌ | non construit |
| B-MAIL-01 | CB §5.8 | Gabarits : vérification, bienvenue, réinitialisation, alerte connexion admin | B2 | ✅ | 9 gabarits présents (`verify-email`, `welcome`, `password-reset`, `admin-login-alert`…) |
| B-MAIL-02 | CB §5.8 | Gabarits : paiement/accès, commande, expédition, traiteur ×2, acompte, certificat, stock bas | B4–8 | ❌ | non construits |
| B-MAIL-03 | CB §5.8 | Envoi par file, idempotence, `List-Unsubscribe`, SPF/DKIM/DMARC documentés | B2/B8 | ⚠️ | file BullMQ + idempotence ✅ (D-035) ; `List-Unsubscribe` et DNS ⏳ |
| B-ADM-01 | CB §5.9 | Tableau de bord, gestion des utilisateurs, paramètres du site, exports | B9 | ❌ | seul le journal d'audit et les contenus ont des routes admin |
| B-ADM-02 | CB §5.9 / DT §13 | Texte, prix et image modifiables sans redéploiement | B3–9 | ⚠️ | textes et images ✅ (contenus, médias) ; prix : aucun catalogue |
| B-ADM-03 | CB §8 / DT §13 | Mini-guide d'utilisation pour l'admin | B9 | ❌ | absent |

### 3.4 Backend — sécurité (sondes à lancer ⏳)

| ID | Source | Exigence | Phase | Statut | Preuve / écart |
|---|---|---|---|---|---|
| B-SEC-01 | CB §6.2 | Anti-IDOR (A → données de B = 403/404) | B2+ | ⏳ | adresses et sessions testables maintenant ; commandes, progression, factures : non construites |
| B-SEC-02 | CB §5.1 | Refus par défaut, `@Public()` explicite, routes admin interdites aux clients | B2 | ✅ ⏳ | `app.module.ts:66-68` (Throttler → AccessToken → Roles) ; liste `@Public()` à justifier |
| B-SEC-03 | CB §5.1 | Jeton d'accès ≤ 15 min, refresh opaque `HttpOnly; Secure; SameSite=Strict` | B2 | ✅ ⏳ | `auth.controller.ts:54-56`, D-024 |
| B-SEC-04 | CB §5.1 | Rotation + détection de réutilisation (famille révoquée) | B2 | ✅ ⏳ | D-025 ; rejeu à tester |
| B-SEC-05 | CB §5.1 | Argon2id (paramètres OWASP), ≥ 12 caractères, mots de passe courants refusés | B2 | ✅ | `password.service.ts:10-12` (19 Mio, t=2), D-037 |
| B-SEC-06 | CB §5.1 | Anti-énumération (même réponse, délai comparable) | B2 | ⏳ | D-031 (≥ 400 ms) ; mesure à faire |
| B-SEC-07 | CB §6.4 | Débit et verrouillage progressif (connexion, inscription, réinitialisation…) | B2 | ⏳ | D-010, D-026 ; contact, quiz, webhooks non construits |
| B-SEC-08 | CB §6.1 | `whitelist` + `forbidNonWhitelisted`, taille des corps, pollution de prototype, mass assignment | B1 | ✅ ⏳ | `validation.pipe.ts:14-15`, `BODY_LIMIT`, D-008 ; `role: "admin"` à l'inscription à tester |
| B-SEC-09 | CB §6.1 | SQL uniquement paramétré | B1 | ✅ | seul SQL brut : `$queryRaw\`SELECT 1\`` (`prisma.service.ts:36`) |
| B-SEC-10 | CB §6.10 | Webhooks : signature, horodatage, idempotence | B6 | ❌ | non construit |
| B-SEC-11 | CB §5.6 | Upload : faux JPG, fichier trop gros, nom piégé → refusés | B3 | ⏳ | sondes à lancer |
| B-SEC-12 | CB §6.3 | helmet, CORS restreint, HSTS, nosniff, Referrer-Policy, CSP | B1 | ✅ ⏳ | `bootstrap.ts:37-48`, D-019 ; en-têtes à capturer |
| B-SEC-13 | CB §6.3 | CSRF (SameSite + protection sur les routes à cookie) | B2 | ✅ ⏳ | D-027 |
| B-SEC-14 | CB §6.7 | Logs sans données personnelles ni secrets | B1 | ⏳ | D-009 ; relecture des logs après le parcours complet |
| B-SEC-15 | CB §6.7 | `audit_log` écrit : connexion, mot de passe, e-mail (+ remboursement, accès : futurs) | B2 | ⏳ | `audit-actions.ts` |
| B-SEC-16 | CB §2, §6.6 | Docker : non-root, réseau privé, image minimale, healthchecks, limites | B1 | ✅ | `docker-compose.prod.yml:8,19,77-186`, D-012/D-013 ; build et scan d'image ⏳ |
| B-SEC-17 | CB §6.9 | `npm audit` sans faille haute/critique ; Trivy en CI | B1/B10 | ⚠️ | `npm audit` en CI ✅ ; Trivy ❌ ; exécution ⏳ |
| B-SEC-18 | CB §6.5 | Champs sensibles chiffrés, clé hors base, rotation documentée | B2 | ✅ | AES-256-GCM, `FIELD_ENCRYPTION_KEY(_PREVIOUS)`, RUNBOOK |
| B-SEC-19 | CB §6.8 | SSRF, ReDoS, race conditions | B3+ | ⏳ | revalidation sortante (SSRF), regex du Markdown (ReDoS) à relire |
| B-RGPD-01 | CB §6.11 | Registre des traitements, durées de conservation + purge | B2 | ✅ ⏳ | `docs/RGPD.md`, D-036, `jobs/retention` |
| B-RGPD-02 | CB §6.11 | Consentements horodatés | B2 | ⏳ | `TERMS_VERSION` à l'inscription |
| B-RGPD-03 | CB §6.11, §8 | `docs/INCIDENT.md` (notification sous 72 h) | B1 | ❌ | **absent** (défaut : document exigé dès le socle) |
| B-RGPD-04 | CB §6.12 | `docs/SECURITY.md` : STRIDE + ASVS niveau 2 reliée aux tests | B1+ | ⏳ | sections présentes ; liens vers les tests à vérifier |

### 3.5 Backend — performance et exploitation

| ID | Source | Exigence | Phase | Statut | Preuve / écart |
|---|---|---|---|---|---|
| B-PERF-01 | CB §7 | Pagination par curseur, `select` explicite, pas de N+1 | B3 | ⏳ | D-023 ; comptage des requêtes sur 3 routes |
| B-PERF-02 | CB §7 | `Cache-Control` / `ETag` | B3 | ⏳ | — |
| B-PERF-03 | CB §7 | Worker séparé, relances exponentielles, file des échecs | B1 | ✅ | `worker.ts`, D-020 ; worker démarré ✅ |
| B-PERF-04 | CB §7 | k6 : 300 req/s en lecture (p95 < 300 ms), 50 req/s paiement/inscription | B10 | ❌ | aucun script k6 |
| B-OPS-01 | CB §6.6, §7 | Sauvegarde chiffrée hors serveur + restauration testée et documentée | B1 | ✅ ⏳ | `scripts/backup.sh`, `restore.sh`, D-014, RUNBOOK |
| B-OPS-02 | CB §2, §8 | CI/CD : … build → ghcr → SSH → migration → fumée → rollback | B10 | ⚠️ | qualité, tests, audit, image ✅ ; push, déploiement, fumée, rollback ❌ |
| B-OPS-03 | CB §8 | Monitoring (UptimeRobot, Sentry) | B1 | ⚠️ | Sentry câblé (D-021) ; UptimeRobot hors code |
| B-OPS-04 | CB §8 | `RUNBOOK.md` | B1 | ✅ | présent |

### 3.6 Backend — tests

| ID | Source | Exigence | Phase | Statut | Preuve / écart |
|---|---|---|---|---|---|
| B-TST-01 | CB §2 | Couverture ≥ 80 % sur auth, paiements, droits d'accès | B2+ | ⚠️ | global 83 % ✅ ; seuil par module non configuré (D-016) ; paiements et droits inexistants |
| B-TST-02 | AU §3.6 | e2e : achat pack → déblocage, kit invité, demande traiteur, rejeu webhook, survente | B4–7 | ❌ | non construits |
| B-TST-03 | CB §6.2 | e2e IDOR | B2 | ⏳ | à rechercher dans `account.e2e-spec.ts` |

### 3.7 Frontend (dépôt vide → tout est « non commencé »)

| ID | Source | Exigence | Phase | Statut |
|---|---|---|---|---|
| F-SOC-01 | CF §3, §4 | Next.js App Router, TS strict, ESLint/Prettier, arborescence des routes | F1 | ❌ |
| F-SOC-02 | CF §2 | Jetons de couleur (8 couleurs + or décoratif), `color-scheme: light` | F1 | ❌ |
| F-SOC-03 | CF §2 | Playfair Display, DM Sans, Allura rare, via `next/font` | F1 | ❌ |
| F-SOC-04 | CF §4 | Client d'API typé généré depuis l'OpenAPI (⚠️ OpenAPI backend périmé) | F1 | ❌ |
| F-NAV-01 | CF §5, DT §03 | Header sticky, panier et compte visibles seulement si utiles, menu mobile (Échap, piège de focus) | F1 | ❌ |
| F-NAV-02 | CF §5 | Footer : réseaux, newsletter, liens légaux, « Gérer mes cookies » | F1 | ❌ |
| F-HOME-01 | DT §04, CF §6 | Ordre header → hero → univers 01/02/03 → avis → mot de Diani → réassurance → footer | F2 | ❌ |
| F-HOME-02 | DT §04 | Hero sans visage de Diani, titre, sous-texte, CTA uniques imposés | F2 | ❌ |
| F-HOME-03 | DT §15 | Aucune grille de produits ni prix sur l'accueil ; 3 univers identifiables en < 5 s | F2 | ❌ |
| F-DA-01 | DT §02, CF §1 | Pas de noir dominant, or jamais en aplat ni sur du texte, rien d'« effet template IA » | F1–7 | ❌ |
| F-DA-02 | DT §09 | Coins ~14 px, ombres très douces, icônes au trait fin d'une même famille | F1 | ❌ |
| F-PAG-01 | CF §4 | Toutes les pages (≈ 25 routes, 404, erreur) | F2–6 | ❌ |
| F-TRA-01 | CF §6 | « Contacter » (WhatsApp pré-rempli) sur chaque carte, « Demande personnalisée », conditions d'acompte | F3 | ❌ |
| F-FOR-01 | CF §6 | Packs, compte obligatoire, leçon 9:16 mobile, PDF, quiz tactile, progression, certificat | F6 | ❌ |
| F-BOU-01 | CF §6 | Kits, comparatif défilable, panier, achat invité, montants venant du serveur | F5 | ❌ |
| F-MEM-01 | CF §6 | Espace membre : formations, commandes, profil, RGPD, sessions | F4 | ❌ |
| F-CNT-01 | CF §0.5 | Aucun contenu métier en dur ; aucun avis inventé | F2+ | ❌ |
| F-ANI-01 | CF §7 | Hero : entrée échelonnée (150–400 ms) | F7 | ❌ |
| F-ANI-02 | CF §7 | Soulignement des liens, zoom au survol, « Ajouté au panier », barres de progression, accordéons | F7 | ❌ |
| F-ANI-03 | CF §7 | `prefers-reduced-motion` (animations coupées, image à la place de la vidéo) et `saveData` | F7 | ❌ |
| F-ANI-04 | CF §7 | Tout visible au repos ; pas de parallaxe, de curseur personnalisé ni de carrousel automatique | F7 | ❌ |
| F-ANI-05 | AU §4.2 | Animations limitées à `transform` et `opacity`, 60 i/s, CLS < 0,1 | F7 | ❌ |
| F-PERF-01 | CF §10 | LCP < 2,5 s, INP < 200 ms, CLS < 0,1, Lighthouse mobile ≥ 90 (4 pages) | F8 | ❌ |
| F-PERF-02 | CF §10 | Vidéo hero < 8 Mo, muette, différée ; `next/image` avec `sizes` et lazy loading | F2 | ❌ |
| F-A11Y-01 | CF §11 | axe : 0 violation critique ; clavier ; focus visibles ; cibles ≥ 44 px | F7–8 | ❌ |
| F-A11Y-02 | CF §11–12 | Labels, `aria-live`, contrastes ≥ 4,5:1, texte ≥ 16 px, lien d'évitement, `lang="fr"`, pas de défilement horizontal à 360 px | F1–8 | ❌ |
| F-SEC-01 | CF §8 | Jeton en mémoire, aucun `localStorage`, middleware sur les routes membres, renouvellement unique entre onglets (D-025) | F4 | ❌ |
| F-SEC-02 | CF §8 | CSP stricte, HSTS, Referrer-Policy, Permissions-Policy ; aucun secret dans le bundle | F1 | ❌ |
| F-RGPD-01 | CF §12, DT §10 | Bandeau cookies (refuser aussi simple qu'accepter), analytics après accord, pages légales | F2 | ❌ |
| F-SEO-01 | CF §9 | Un `h1`, Hn, titres/meta uniques, OG, canonique, sitemap, robots, JSON-LD, `noindex` membres | F2–7 | ❌ |
| F-E2E-01 | CF §13 | Playwright : traiteur/WhatsApp, pack → certificat, kit invité, clavier mobile | F8 | ❌ |
| F-CI-01 | CF §13 | CI : lint → types → tests → axe → build → Lighthouse CI → image | F1 | ❌ |

### 3.8 Croisement front ↔ back

| ID | Source | Exigence | Statut |
|---|---|---|---|
| X-01 | AU §5 | Chaque appel du front correspond à une route existante | ➖ rien à croiser (pas de front) |
| X-02 | CF §4 | Types générés depuis une OpenAPI à jour | ❌ OpenAPI backend périmé (B-ARC-07) |
| X-03 | CB §0.5 / CF §0.4 | Statuts et messages d'erreur cohérents, en français | ➖ |

---

## 4. Premiers défauts réels (sur ce qui est censé exister)

Ce sont des écarts sur les phases déjà livrées, et non des fonctionnalités à venir :

| Gravité | ID | Défaut | Effort |
|---|---|---|---|
| 🟠 | B-ARC-07 / X-02 | `docs/openapi.json` périmé : les routes contenus/médias/SEO manquent, ce qui bloque la génération du client typé du front | S |
| 🟠 | B-RGPD-03 | `docs/INCIDENT.md` absent (procédure de violation sous 72 h exigée par CB) | S |
| 🟡 | B-ARC-11 | Décisions de la phase 3 non consignées dans `DECISIONS.md` | S |
| 🟡 | B-ARC-10 | Phase 3 non commitée | S |
| 🟡 | B-ARC-13 | Choix NestJS/Next.js contre la recommandation WordPress du dossier technique, non acté par écrit | S |

---

## 5. Suite proposée (après ta validation)

1. **Questions à trancher** : C1 (stack), C2 (fournir le MLD), C3 (acompte à 50 € pile), C5 (débit des webhooks), et si tu peux, joindre le prototype `.zip`.
2. **Exécution backend** : `npm audit`, export OpenAPI (comparaison), sondes de sécurité contre l'instance locale (B-SEC-01 à 19 marqués ⏳), refus de démarrer sans variable, arrêt gracieux, comptage des requêtes (N+1), essai d'immuabilité de l'audit, build et inspection de l'image Docker.
3. **Frontend** : rien à exécuter. Le rapport final le marquera « non commencé » en bloc, avec la liste ci-dessus comme critères d'acceptation pour sa construction.
4. Puis : livrables du §6 (matrice complétée avec preuves d'exécution, synthèse par domaine, top 10 des risques, plan de correction en lots).
