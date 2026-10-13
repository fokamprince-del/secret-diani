# Audit de conformité — Les Secrets de Diani

**Phase 1 : résultats d'exécution, synthèse et plan de correction (livrables du §6)**
Date : 12/10/2026 · Ce document complète `01-matrice-et-inventaire.md` et **remplace ses statuts provisoires**.
Aucun fichier de `backend/` ni de `frontend/` n'a été modifié.

---

## 0. Mises à jour depuis l'étape 1

| Sujet | Décision ou constat |
|---|---|
| **C1 — Stack** | **Réglée** : NestJS + Next.js est la stack retenue, la recommandation WordPress/WooCommerce du dossier technique est écartée (décision du 12/10/2026). → B-ARC-13 passe en ➖, mais il reste à l'écrire dans `DECISIONS.md` (lot 2). |
| **Source CB** | Le prompt backend complet a été fourni. `backend/docs/CAHIER_DES_CHARGES.md` en est une **version condensée** qui a perdu des exigences : EXPLAIN des index, `enableShutdownHooks`, contenu attendu du RUNBOOK (déploiement, rollback), liste d'IP autorisées pour les webhooks, « tests de requêtes » contre le N+1, réordonnancement par glisser-déposer. L'audit utilise la version complète. |
| **C2 — « 24 tables »** | Le prompt complet dit « 24 tables, dont les tables de jonction », mais en énumère **43**. La contradiction est interne au prompt. L'audit suit la liste énumérée. |
| **C5 — Débit des webhooks** | Le prompt complet précise « liste d'IP autorisées si possible » : filtrer par IP plutôt que renvoyer des 429. Réglée. |
| **C3 — Acompte à 50 € pile** | **Toujours ouverte** (bloquera la phase 4 du backend). |
| **Prototype `.zip`** | Toujours absent. Il ne sera utile que lorsque le frontend existera. |

---

## 1. Résultats d'exécution (annexe A)

Infrastructure : Postgres, Redis et S3 de test jetables (`docker-compose.test.yml`). Instance auditée : `node --env-file=.env.test dist/main.js` sur le port 3100, plus l'image de production `diani-audit:runtime`.

### 1.1 Commandes

| Commande | Résultat |
|---|---|
| `npm run typecheck` · `lint` · `format:check` · `prisma validate` | ✅ 0 erreur |
| `npm run build` | ✅ |
| `npm run test:cov` | ✅ 175/175, **lignes 82,97 %**, branches 83,65 % |
| `npm run test:e2e` | ✅ 107/107 (7 suites) |
| `npm audit --omit=dev` | ✅ **0 vulnérabilité** en production |
| `npm audit` (outillage) | ⚠️ 20 modérées (chaîne Jest), 0 haute ou critique. `DECISIONS.md` (D-017) n'en mentionne qu'une. |
| Export OpenAPI frais vs `docs/openapi.json` | ❌ **45 opérations sur 74 absentes du fichier** (tout `admin/*` des contenus et médias, `content/*`, `seo/*`, `/robots.txt`) |
| `docker build --target runtime` | ✅ image de 650 Mo, utilisateur `node` (uid 1000), `tini`, sans npm/npx/corepack/yarn |
| Démarrage en production avec une config invalide | ✅ refus, 6 erreurs listées en français, **aucune valeur divulguée** (valeur témoin introuvable dans la sortie) |
| Image en `--read-only --cap-drop ALL --security-opt no-new-privileges` | ✅ démarre, `/ready` = 200 |
| Arrêt (`docker stop`) | ✅ arrêt en 1,1 s via le hook d'arrêt de Nest (code 143 : Nest relance le signal après le nettoyage) ; ⚠️ rien n'est journalisé pendant l'arrêt |
| Lighthouse, axe, Playwright, k6 | ➖ impossibles : aucun frontend, aucun script k6 |

### 1.2 Sondes de sécurité (33/33 réussies)

Script : `probes.cjs` (scratchpad de l'audit). Toutes les requêtes ont été faites contre l'instance locale de test.

| ID | Sonde | Attendu | Obtenu |
|---|---|---|---|
| B-SEC-12 | En-têtes | HSTS, nosniff, Referrer-Policy, CSP, pas de X-Powered-By | ✅ `max-age=63072000; includeSubDomains; preload`, `nosniff`, `no-referrer`, `default-src 'none'…`, X-Powered-By absent |
| B-SEC-12b | CORS depuis `https://evil.example` | aucun en-tête CORS | ✅ ACAO absent ; site autorisé : ACAO exact + `credentials: true` |
| B-SEC-08a | Inscription avec `role: "admin"`, `emailVerified: true` | refus | ✅ 400 `VALIDATION_ERROR` |
| B-SEC-08b | Corps avec `__proto__` | refus | ✅ 400 |
| B-SEC-08c | Corps de 300 ko | refus | ✅ 413 |
| B-SEC-08d | Mot de passe de 5 000 caractères | refus avant hachage | ✅ 400 en 8 ms |
| B-SEC-05a/b | Mot de passe de 11 caractères / mot de passe courant | refus | ✅ 400 / 400 « trop courant ou trop facile à deviner » |
| B-SEC-03 | Cookie refresh | `HttpOnly; Secure; SameSite=Strict` | ✅ et limité à `Path=/api/v1/auth` |
| B-SEC-03b | Durée du jeton d'accès | ≤ 15 min | ✅ 15 min, HS256 |
| B-SEC-03c | JWT `alg: none` / charge utile modifiée (`role: admin`) | 401 | ✅ 401 / 401 |
| B-SEC-02 | Anonyme sur `/me` ; client sur `admin/audit-logs`, `admin/media`, `POST admin/articles` | 401 ; 403 | ✅ 401 ; 403, 403, 403 |
| B-SEC-01 | IDOR : B lit, modifie ou supprime l'adresse de A ; B révoque la session de A | 404 | ✅ absente de la liste de B ; PATCH 404, DELETE 404, révocation 404 ; A reste connecté |
| B-AUTH-06a | Export RGPD de B | ne contient rien de A | ✅ |
| B-SEC-04 | Rotation du refresh, puis rejeu de l'ancien jeton | famille révoquée | ✅ refresh 200 (nouveau cookie) → rejeu 401 → nouveau jeton 401 → jeton d'accès de la famille 401 |
| B-SEC-13 | `/auth/refresh` sans `X-CSRF-Token` / depuis une origine tierce | refus | ✅ 403 / 403 |
| B-AUTH-04 | Changement de mot de passe | autres sessions invalidées | ✅ autre session : `/me` 401, refresh 401 ; session courante 200 ; e-mail « mot de passe modifié » mis en file |
| B-AUTH-02b | Déconnexion de tous les appareils | autres appareils déconnectés | ✅ 204 → autre appareil 401 |
| B-SEC-06a | Connexion : compte connu vs inconnu (6 essais chacun) | même réponse, même délai | ✅ réponse identique, médianes 55 ms / 58 ms |
| B-SEC-06b | Mot de passe oublié : connu vs inconnu | idem | ✅ corps identiques, 406 ms / 405 ms |
| B-SEC-06c | Inscription : adresse déjà inscrite vs nouvelle | idem | ✅ 202 / 202, 405 ms / 405 ms |
| B-SEC-07 | 14 mauvais mots de passe depuis une même IP | blocage | ✅ `401×5` puis `429×9` ; **une autre IP se connecte normalement (200)** : pas de déni de service sur la victime |
| B-SEC-07b/c | 8 inscriptions / 8 « mot de passe oublié » depuis une même IP | 429 | ✅ 429 dès la 6ᵉ requête dans les deux cas |
| B-ARC-12 | Erreurs | en français, sans fuite | ✅ « Ressource introuvable. », aucune trace de pile ni de SQL |
| B-CON | `content/pages`, `faq`, `articles`, `reviews`, `seo/sitemap.xml`, `seo/organization` | 200 + cache | ✅ `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600` + `ETag` |

### 1.3 Contrôles complémentaires

| ID | Contrôle | Résultat |
|---|---|---|
| B-SEC-14 | Journaux de l'instance après les 33 sondes (230 lignes) : recherche des e-mails, mots de passe, cookie, `Bearer`, `eyJ`, IP, `token=`, adresse postale | ✅ **0 occurrence**. Les seules clés présentes sont `level`, `time`, `service`, `context`, `msg`, `req.id`, `req.method`, `req.path`, `res.statusCode`, `responseTime` |
| B-SEC-15 | `audit_logs` après les sondes | ✅ 10 types d'action écrits : connexions réussies et échouées, verrouillage, inscription, vérification, mot de passe oublié et modifié, déconnexion globale, export, **réutilisation de refresh détectée** |
| B-BDD-09 | `UPDATE`, `DELETE`, `TRUNCATE` sur `audit_logs` | ✅ tous refusés par les triggers `audit_logs_immutable` et `audit_logs_no_truncate` · ⚠️ voir N1 |
| B-BDD-02/03 | UUID v7 · clés étrangères sans index | ✅ 14 modèles sur 14 en `uuid(7)` · ✅ **0 clé étrangère sans index** (requête sur `pg_constraint`) · 18 `CHECK` |
| B-SEC-11 | Fichiers envoyés | ✅ couverts par l'e2e vert `media.e2e-spec.ts` : HTML déguisé en `.jpg`, SVG, HEIC, > 15/30 Mo, EXIF retiré, renommage, contenu revérifié après envoi pré-signé. Nom d'origine nettoyé (`storage.service.ts:178`), clé de stockage aléatoire |
| B-CON-06 | Cache et revalidation | ✅ e2e « modification admin visible immédiatement (cache invalidé) et revalide le frontend », « réponse 304 sur ETag » |
| B-SEC-19 | SSRF | ✅ seul appel sortant : `FRONTEND_REVALIDATE_URL`, défini par l'environnement et jamais par un utilisateur |
| B-PERF-01 | N+1 et pagination | ✅ aucune requête Prisma dans une boucle sur les chemins de lecture · curseur sur articles, médias et audit · ⚠️ FAQ, pages, catégories et adresses non paginées (petits ensembles) |
| B-RGPD-02 | Consentements | ✅ `terms_accepted_at`, `terms_version`, `marketing_consent_at` |
| B-OPS-01 | Restauration | ✅ procédure et journal d'essai dans `RUNBOOK.md` (« Essai de restauration — journal ») ; non rejoué pendant l'audit |

---

## 2. Nouveaux constats (défauts)

| # | Gravité | Constat | Preuve | Correctif proposé | Effort |
|---|---|---|---|---|---|
| **N1** | 🟠 | **L'API se connecte à Postgres en superutilisateur, propriétaire des tables.** L'immuabilité de l'audit repose sur des triggers que ce rôle peut supprimer. Un superutilisateur peut aussi exécuter des commandes sur le conteneur (`COPY … TO PROGRAM`). Aucune injection SQL n'a été trouvée : c'est une faille de défense en profondeur. | `docker-compose.prod.yml:17,142` (`DATABASE_URL` = `POSTGRES_USER` = `diani`) ; `rolsuper = t`, `tableowner = diani` | Rôle `diani_app` (DML seulement, sans `TRIGGER`/`TRUNCATE`/DDL) pour l'API et le worker ; rôle propriétaire réservé à `migrate` ; test e2e « l'API ne peut pas `ALTER TABLE audit_logs DISABLE TRIGGER` ». | M |
| N2 | 🟡 | **Avec `NODE_ENV=test` hors Jest, l'API utilise la base de dev.** Le client Prisma charge `.env` au démarrage, avant que `ConfigModule` ne lise `.env.test`. Les valeurs de `.env` gagnent. Constaté pendant l'audit (l'instance de sondes a écrit dans la base de dev). La production n'est pas concernée : `.env` est exclu de l'image. | `config.module.ts:16`, `.dockerignore:6` | Charger le fichier d'environnement avec `process.loadEnvFile` en tout premier dans `main.ts`/`worker.ts` (comme le fait `test/e2e/load-env.ts`), ou désactiver le chargement automatique de Prisma. Test : `NODE_ENV=test` → `/ready` sur la base de test. | S |
| N3 | 🟡 | `SWAGGER_ENABLED=true` est accepté en production (D-018 le dit désactivé par défaut, sans l'interdire) | refus de démarrer testé : Swagger absent de la liste d'erreurs | Le refuser en production, comme `S3_AUTO_CREATE_BUCKETS` | S |
| N4 | 🟡 | `SECURITY.md` s'arrête à la phase 2 : rien sur les fichiers envoyés, le Markdown (XSS), le cache CDN ni les URL pré-signées | `SECURITY.md:3` | Ajouter le STRIDE et l'ASVS (V5, V12, V13) de la phase 3 avec les renvois aux tests existants | S |
| N5 | 🟡 | La politique d'audit des dépendances (D-017) n'est plus à jour : 20 vulnérabilités modérées dans l'outillage, contre une seule documentée | `npm audit` | Mettre à jour D-017 (liste et justification), ou ajouter des surcharges | S |
| N6 | 🟡 | Le cahier du dépôt est une version condensée du prompt original : des exigences s'y perdent | §0 ci-dessus | Remplacer `backend/docs/CAHIER_DES_CHARGES.md` par la version complète | S |
| N7 | ⚪ | Arrêt : rien n'est journalisé et `/ready` ne passe pas à 503 pendant la fermeture, ce qui laisse Traefik router vers l'instance qui s'arrête | `main.ts`, test `docker stop` | Hook `beforeApplicationShutdown` : journal + `/ready` 503 + courte attente | S |
| N8 | ⚪ | Image de 650 Mo (`node_modules` : 310 Mo, dont `@prisma` 74 Mo et `@sentry` 47 Mo) | `docker images`, `du` | Élaguer les moteurs Prisma inutiles et les fichiers inutiles des paquets ; viser < 400 Mo | M |
| N9 | ⚪ | FAQ, pages, catégories et adresses non paginées (CB §7 : « toutes les listes ») | `faq.service.ts:54`, `pages.service.ts:78`, `addresses.service.ts:38` | Plafond (`take`) + curseur, ou décision consignée « ensemble borné » | S |

**Rappel des défauts de l'étape 1 :**

| # | Gravité | Constat | Effort |
|---|---|---|---|
| D1 | 🟠 | `docs/openapi.json` périmé (45 opérations manquantes) ; il bloquera le client typé du front | S |
| D2 | 🟠 | `docs/INCIDENT.md` absent (notification de violation sous 72 h) | S |
| D3 | 🟡 | Décisions de la phase 3 absentes de `DECISIONS.md` ; décision de stack (C1) à consigner | S |
| D4 | 🟡 | Phase 3 non commitée (≈ 30 fichiers : risque de perte) | S |

---

## 3. Matrice de conformité — statuts définitifs (backend)

Seuls les statuts qui changent par rapport à `01-matrice-et-inventaire.md` sont listés ; les autres lignes (y compris tout le frontend, ❌) sont inchangées.

| ID | Statut | Preuve |
|---|---|---|
| B-ARC-01 / 02 / 03 / 04 / 08 / 09 / 12 | ✅ | §1.1, §1.2 |
| B-ARC-06 | ⚠️ | Écart assumé (D-023 : Prisma fait office de dépôt) ; contrôleurs non relus ligne à ligne |
| B-ARC-07 | ❌ | D1 |
| B-ARC-10 / 11 | ⚠️ / ❌ | D3, D4 |
| B-ARC-13 | ➖ | Stack confirmée (à consigner, D3) |
| B-BDD-02 / 03 | ✅ | §1.3 |
| B-BDD-09 | ⚠️ | Triggers OK, mais contournables par le rôle de l'API (N1) |
| B-AUTH-01 à 07 | ✅ | §1.2 + e2e `auth`, `account`, `admin-mfa` |
| B-CON-01 à 06 | ✅ | §1.2, §1.3, e2e `content`, `media` |
| B-MAIL-01 | ✅ | 9 gabarits ; e-mails mis en file pendant les sondes |
| B-SEC-01 à 09, 11 à 15, 18, 19 | ✅ | §1.2, §1.3 (pour les ressources qui existent) |
| B-SEC-16 | ⚠️ | Image et compose conformes ; rôle de base de données (N1) |
| B-SEC-17 | ⚠️ | `npm audit` OK ; Trivy absent ; D-017 à jour (N5) |
| B-RGPD-01 / 02 | ✅ | `RGPD.md`, purge, consentements horodatés |
| B-RGPD-03 | ❌ | D2 |
| B-RGPD-04 | ⚠️ | N4 |
| B-PERF-01 | ⚠️ | N9 (sinon ✅) |
| B-PERF-02 / 03 | ✅ | En-têtes mesurés ; worker et relances |
| B-OPS-01 | ✅ | Journal d'essai de restauration dans le RUNBOOK |
| B-OPS-04 | ⚠️ | RUNBOOK sans déploiement ni rollback (prévus en phase 10) |
| B-TST-03 | ✅ | e2e `account` « B ne peut ni lire, ni modifier, ni supprimer l'adresse de A » + sonde B-SEC-01 |

---

## 4. Synthèse

### 4.1 Conformité par domaine

| Domaine | ✅ | ⚠️ | ❌ | Conformité | Lecture |
|---|---|---|---|---|---|
| **Backend, périmètre livré (phases 1–3)** | 47 | 11 | 3 | **77 %** | Ce qui est construit est solide ; les ❌ sont documentaires (D1, D2, D3) |
| Backend, cahier complet | 47 | 16 | 36 | 47 % | 7 phases sur 10 restent à construire |
| Sécurité backend | 18 | 3 | 2 | 78 % | 33 sondes sur 33 réussies ; N1 est le seul point technique |
| Performance backend | 3 | 4 | 1 | 38 % | Pas de test de charge (phase 10) |
| **Frontend** | 0 | 0 | 32 | **0 %** | Dépôt vide |
| Animations | 0 | 0 | 5 | 0 % | — |
| Accessibilité | 0 | 0 | 2 | 0 % | — |
| SEO | côté API ✅ (sitemap, robots, JSON-LD Organization/FAQPage/Article) | | front ❌ | — | — |

### 4.2 Top 10 des risques

| # | Risque | Gravité | Bloque la mise en production ? |
|---|---|---|---|
| 1 | Frontend inexistant : aucun parcours utilisateur | 🟠 | **Oui** |
| 2 | Traiteur, boutique, paiements, formations, contact, newsletter et back-office non construits ; c'est là que se trouvent les zones critiques (argent, stock, droits d'accès) | 🟠 | **Oui** |
| 3 | API en superutilisateur Postgres (N1) | 🟠 | Oui (à corriger avant toute mise en ligne) |
| 4 | OpenAPI périmé : le client typé du front serait généré faux (D1) | 🟠 | Oui (dès que le front démarre) |
| 5 | Pas de procédure de violation de données (D2, obligation RGPD) | 🟠 | Oui |
| 6 | Phase 3 non commitée (D4) | 🟡 | Non, mais un risque de perte immédiat |
| 7 | Instance de test qui se branche sur la base de dev (N2) | 🟡 | Non |
| 8 | CI/CD sans déploiement, test de fumée, rollback ni Trivy | 🟡 | Oui (prévu en phase 10) |
| 9 | Aucun test de charge pour le pic de 10 000 visiteurs | 🟡 | Oui (prévu en phase 10) |
| 10 | Documentation en retard sur le code (D3, N4, N5, N6) | 🟡 | Non |

**En résumé : rien n'est prêt pour la production, et c'est attendu.** Le projet en est au tiers du backend et le frontend n'a pas commencé. Ce qui existe est sûr et bien testé.

---

## 5. Plan de correction (phase 2 de l'audit, après validation)

Une branche et une demande de fusion par lot. Chaque faille corrigée reçoit un test qui échoue avant la correction et passe après.

| Lot | Contenu | Gravité | Effort |
|---|---|---|---|
| **Lot 1 — à faire maintenant** | D4 : commiter la phase 3 (sur sa branche) · D1 : régénérer `openapi.json` **et** ajouter en CI une vérification qui échoue si le fichier diffère du code · D2 : `docs/INCIDENT.md` | 🟠/🟡 | S |
| **Lot 2 — base de données** | N1 : rôles `diani_owner` (migrations) et `diani_app` (API/worker), droits minimaux, script d'initialisation, RUNBOOK, test « l'API ne peut pas désactiver le trigger d'audit » | 🟠 | M |
| **Lot 3 — configuration** | N2 (ordre de chargement de l'environnement, avec test) · N3 (Swagger interdit en production, avec test) | 🟡 | S |
| **Lot 4 — documentation** | D3 (décisions de la phase 3 + décision de stack) · N4 (SECURITY phase 3) · N5 (D-017) · N6 (cahier complet) | 🟡 | S |
| Lot 5 — améliorations | N7 (arrêt : journal + `/ready` 503) · N9 (pagination) · N8 (taille de l'image) | ⚪ | S–M |

Hors correction (construction, selon le plan déjà prévu) : backend, phases 4 à 10 ; frontend, phases 1 à 8. **Avant la phase 4, il faut trancher C3 (acompte pour 50 € pile).**

---

## Annexe B — Effets de bord de l'audit

Avant que N2 soit identifié, la première instance de sondes s'est branchée sur la **base de dev**. Elle y a créé :
- 1 utilisateur `audit-a-27307a@example.com` (non vérifié) ;
- 1 ligne `auth.registered` dans `audit_logs`, qui ne peut pas être supprimée avant un an (immuabilité) ;
- 1 e-mail en file dans le Redis de dev.

La base de test contient aussi les comptes `audit-*` des sondes ; elle est jetable (`make test-infra-down`).
