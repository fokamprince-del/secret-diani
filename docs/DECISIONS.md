# Journal des décisions

Décisions prises quand le cahier des charges ne tranchait pas : option la plus sûre et la plus simple (règle 4). Chaque entrée indique la phase où la décision a été prise.

## Phase 1 — Socle

### D-001 · Versions des frameworks
**Choix :** Node 24 LTS, NestJS 11.2, TypeScript 5.9, Prisma 6.19, ESLint 10, Jest 30.
**Pourquoi :** au moment du démarrage (oct. 2026), NestJS 12, TypeScript 7 (compilateur natif) et Prisma 8 (RC) sont récents ; leur compatibilité avec l'outillage (ts-jest, plugins) reste à éprouver. Les versions retenues sont les dernières des majeures stables, maintenues et sans vulnérabilité connue en production.
**Suite :** montée vers NestJS 12 / Prisma 7 planifiée après la phase 10, sur une branche dédiée, une fois la suite de tests complète (elle servira de filet).

### D-002 · Prisma plutôt que TypeORM
Migrations SQL versionnées et relisibles, requêtes paramétrées par construction, typage de bout en bout. Les cas impossibles en Prisma (`SELECT … FOR UPDATE`, séquences de factures) passeront par `$queryRaw` paramétré (gabarits balisés, jamais de concaténation).

### D-003 · Nommage des tables
Le MLD du cahier des charges est en français (`utilisateur`, `demande_traiteur`…). La règle 6 impose des identifiants en anglais : les modèles Prisma sont en anglais (PascalCase) et les tables/colonnes en anglais `snake_case` (`users`, `catering_requests`). La correspondance MLD → table est tenue dans `docs/ARCHITECTURE.md` au fil des phases.

### D-004 · Clés primaires UUID v7
Générées par le client Prisma (`@default(uuid(7))`) : ordonnées dans le temps (index B-tree efficaces), non devinables, sans extension Postgres. Les identifiants de requête HTTP sont aussi des UUID v7 (implémentation locale `src/common/utils/uuid.ts` : le paquet `uuid` v13 est ESM pur et incompatible avec Jest en CommonJS).

### D-005 · Sondes hors préfixe
`/health` (vie du processus) et `/ready` (base + Redis, délai 2 s chacun) sont servies à la racine, hors `/api/v1`, pour les sondes d'infrastructure (Traefik, Docker, UptimeRobot). Exclues de la limitation de débit et des journaux d'accès.

### D-006 · Démarrage : configuration stricte, dépendances paresseuses
- Configuration invalide ou incomplète → **refus de démarrer**, avec la liste des variables fautives, jamais leurs valeurs.
- Base ou Redis indisponible au démarrage → l'API démarre quand même et `/ready` répond 503. L'orchestrateur ne lui envoie pas de trafic, et elle se rétablit seule sans boucle de redémarrage.

### D-007 · Format d'erreur unique
`{ statusCode, code, message, errors?, requestId }`. Le `code` est stable (le frontend s'appuie dessus) et le `message` est en français.
Seules les `AppException` (exceptions métier) exposent leur message ; toute autre erreur reçoit le message générique de son statut. Ni pile, ni SQL, ni valeur soumise, ni route demandée n'apparaissent dans la réponse. Les erreurs Prisma P2002 et P2025 deviennent des 409 et 404 génériques. Les 5xx sont journalisées et envoyées à Sentry.

### D-008 · Validation
`whitelist` + `forbidNonWhitelisted` + `forbidUnknownValues`, sans conversion implicite. Les messages de class-validator sont traduits en français ; un message personnalisé s'écrit `fr: …` dans le DTO.
**Anti-pollution de prototype :** tout corps JSON contenant `__proto__`, `constructor` ou `prototype` est refusé en 400 dès l'analyse. Un test e2e a montré que, sans cette barrière, un tel corps traversait la validation.

### D-009 · Journalisation sans données personnelles
Pino en JSON. Une requête n'est journalisée que par son identifiant, sa méthode, son **chemin sans chaîne de requête** (qui peut porter des jetons) et son statut : ni IP, ni en-têtes, ni corps. Une liste de clés sensibles (mot de passe, jetons, e-mail, téléphone, nom, adresse…) est masquée par défense en profondeur. `LOG_PRETTY=true` n'est utilisé qu'en local.

### D-010 · Limitation de débit
Stockage Redis partagé entre instances, fenêtre fixe + blocage via un script Lua atomique (testé sous 50 appels concurrents). Limite globale par défaut : 120 requêtes/min/IP, avec des limites plus strictes par route dans les phases suivantes.
L'IP réelle repose sur `TRUST_PROXY_HOPS=2` en production (Cloudflare → Traefik → API). Traefik n'accepte `X-Forwarded-For` que depuis les plages IP Cloudflare.

### D-011 · Délais
30 s maximum de traitement par requête (intercepteur → 503 français), `headersTimeout` de 15 s côté Node (slowloris). Côté Postgres, au niveau de la base : `statement_timeout` 15 s, `lock_timeout` 10 s, `idle_in_transaction_session_timeout` 30 s (`docker/postgres/10-timeouts.sql`, appliqué à l'initialisation du volume ; à réappliquer après une restauration dans une nouvelle base).

### D-012 · Image Docker
`node:24-alpine` plutôt que distroless : le moteur Prisma a besoin d'OpenSSL et une base Alpine se scanne et s'audite facilement. L'image d'exécution :
- ne contient ni npm, ni corepack, ni yarn ;
- ne contient que les dépendances de production, sans les dépendances facultatives (CLI Prisma, TypeScript) ;
- a son code en propriété root et s'exécute sous l'utilisateur `node` ;
- démarre via `tini` (signaux) et tourne en lecture seule (`/tmp` en tmpfs), sans capacité Linux, avec `no-new-privileges`.

Les migrations utilisent une image séparée (`target: migrate`) qui contient la CLI Prisma. API et worker partagent la même image.

### D-013 · Traefik sans socket Docker
Traefik utilise le fournisseur « file » (routes déclarées dans `docker/traefik/dynamic.yml`) au lieu du fournisseur Docker : monter le socket Docker équivaut à donner un accès root à l'hôte. TLS 1.2 minimum avec suites modernes, HSTS avec preload, journal d'accès sans IP ni en-têtes.
Les réseaux sont séparés : Postgres et Redis sont sur un réseau `internal` sans accès extérieur et ne publient aucun port.

### D-014 · Sauvegardes
`pg_dump` au format personnalisé, **chiffré avec age (clé publique seulement sur le serveur)**, copié hors serveur via rclone en mode `--immutable`. La rétention de 30 jours est gérée par le cycle de vie du bucket. La restauration se fait dans une base séparée (`diani_restore`), la bascule restant une décision manuelle. L'aller-retour a été testé en phase 1 (voir RUNBOOK).

### D-015 · Tests e2e sur infrastructure jetable
Postgres et Redis tournent en mémoire (`docker-compose.test.yml` ou services GitHub Actions). Le schéma est créé par `prisma migrate deploy`, exactement comme en production. **Aucune commande destructrice** (`migrate reset`) n'est utilisée : l'isolation vient du conteneur jetable.

### D-016 · Couverture
Tests unitaires : logique pure, seuil global de 80 % des lignes. Le code d'assemblage (bootstrap, contrôleurs, stockage Redis, Prisma) est couvert par les tests e2e sur l'application réelle. Le seuil de 80 % par module (auth, paiements, droits d'accès) s'ajoutera dans leurs phases.

### D-017 · Politique d'audit des dépendances
La CI bloque sur **toute** vulnérabilité des dépendances de production et sur toute vulnérabilité haute ou critique de l'outillage. Deux surcharges npm corrigent des dépendances transitives vulnérables (`js-yaml` via @nestjs/swagger, `deepmerge-ts` via la CLI Prisma).
Accepté : `sprintf-js` (modérée, aucun correctif publié), présent uniquement dans l'outillage de couverture de Jest, sans entrée non fiable.

### D-018 · Swagger
Désactivé par défaut (`SWAGGER_ENABLED=false`), donc absent en production. La spécification est exportée dans `docs/openapi.json` (`npm run openapi:export`). La CSP n'est assouplie que sur `/api/docs`.

### D-019 · CORS
Liste blanche d'origines en correspondance exacte (`CORS_ORIGINS`, par défaut `PUBLIC_SITE_URL`, https obligatoire en production), avec `credentials: true`. Une origine inconnue ne reçoit aucun en-tête CORS.

### D-020 · Files de jobs
BullMQ avec 5 tentatives et un délai exponentiel à partir de 5 s. Les jobs terminés sont conservés 24 h ; les jobs en échec définitif sont conservés 30 jours (ensemble `failed` = file des échecs, rejouable).
Le worker publie un battement de cœur dans Redis toutes les 15 s, que lit sa sonde de santé Docker.

### D-021 · Sentry
Activé uniquement si `SENTRY_DSN` est défini, avec `sendDefaultPii: false`. Cookies, en-têtes, corps, chaîne de requête et utilisateur sont retirés de chaque événement avant envoi.
