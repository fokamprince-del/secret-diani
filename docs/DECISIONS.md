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

## Phase 2 — Authentification et comptes

### D-022 · @nestjs/jwt 11 plutôt que 12
La version 12 est publiée en ESM pur : Jest (CommonJS) ne peut pas la charger. La 11.0.2 est la dernière version CommonJS, compatible NestJS 11 et sans vulnérabilité connue. À réévaluer avec la montée NestJS 12 (D-001).

### D-023 · Couche dépôt
Le client Prisma typé joue le rôle de dépôt : les services l'appellent avec un `select` explicite (jamais d'entité complète renvoyée, donc ni empreinte ni secret exposé par erreur). Une classe dépôt dédiée ne sera introduite que pour des requêtes partagées entre plusieurs services ou du SQL brut (`FOR UPDATE`, séquences de factures).

### D-024 · Durées de vie
| | Client | Administrateur |
|---|---|---|
| Jeton d'accès (JWT HS256) | 15 min | 10 min |
| Refresh token (inactivité) | 30 jours | 1 h |
| Session (absolue) | 60 jours | 12 h |
| Lien de vérification d'e-mail | 24 h | — |
| Lien de réinitialisation | 30 min | 30 min |
| Lien de changement d'e-mail | 1 h | 1 h |
| Défi 2FA | — | 5 min, 5 essais |

### D-025 · Sessions et rotation stricte
Une session = un appareil = une famille de refresh tokens. Le jeton est opaque (256 bits) et seule son empreinte SHA-256 est stockée. Sa consommation est atomique (`UPDATE … WHERE used_at IS NULL`). **Tout jeton déjà utilisé révoque la famille entière**, sans délai de grâce : c'est l'option la plus sûre.
**Conséquence pour le frontend :** un seul renouvellement à la fois, tous onglets confondus (Web Locks API ou `BroadcastChannel`), sinon deux onglets qui renouvellent en même temps déconnectent la session.
Les JWT n'étant pas révocables par nature, la garde consulte une liste Redis des sessions révoquées (TTL = durée maximale d'un jeton d'accès). La révocation est donc immédiate.

### D-026 · Verrouillage progressif
Trois compteurs Redis, posés sur l'empreinte de l'e-mail saisi, que le compte existe ou non :
- couple e-mail + IP : 5 échecs, puis verrou de 1, 2, 4, 8 et enfin 15 min au plus ;
- e-mail, toutes IP confondues : 20 échecs par heure, même progression ;
- IP, tous comptes confondus : 50 échecs en 15 min, verrou de 15 min.

Aucun verrou n'est définitif, ce qui évite qu'un attaquant puisse bloquer durablement un compte. Les autres IP ne sont pas touchées par le verrou du couple. La même mécanique protège la re-saisie du mot de passe (`user:<id>`) et le second facteur (`mfa:<id>`). En plus : limites de débit par route (connexion 10/min/IP, inscription 5/min, mot de passe oublié 5/min, renvoi d'e-mail 3/min…).

### D-027 · CSRF
Seules `/auth/refresh` et `/auth/logout` s'authentifient par cookie. Toutes les autres routes utilisent l'en-tête `Authorization`, qu'un site tiers ne peut pas faire envoyer par le navigateur. Les routes à cookie cumulent quatre protections :
- `SameSite=Strict` ;
- en-tête `X-CSRF-Token` obligatoire (valeur quelconque), qui impose un pré-vol CORS refusé hors liste blanche ;
- `Origin` (ou `Referer`) vérifiée contre la liste blanche ;
- refus de `Sec-Fetch-Site: cross-site`.

Ce schéma « en-tête personnalisé + vérification d'origine » est recommandé par OWASP. Il évite un jeton synchronisé, que le frontend (sur un autre sous-domaine) ne pourrait pas relire après un rechargement de page.

### D-028 · Liens envoyés par e-mail
Jeton aléatoire de 256 bits stocké haché, plutôt qu'un lien signé (HMAC) : l'usage unique et la révocation sont garantis par la base. Émettre un jeton invalide les précédents du même usage. Les jetons sont consommés de façon atomique.

### D-029 · E-mail non vérifié
La connexion est refusée tant que l'adresse n'est pas confirmée. Les messages « e-mail non confirmé » et « compte suspendu » ne sont donnés qu'après un mot de passe correct, donc à la seule titulaire : aucune énumération. Une réinitialisation de mot de passe réussie vaut confirmation de l'adresse.

### D-030 · Second facteur administrateur
- **TOTP** (RFC 6238 : SHA-1, 6 chiffres, 30 s, tolérance ±1 pas) implémenté localement, une quarantaine de lignes vérifiées par les vecteurs de test officiels des RFC 4226 et 6238. Cela évite une dépendance pour une primitive aussi simple.
- Secret de 160 bits chiffré au repos (AES-256-GCM, clé `FIELD_ENCRYPTION_KEY` hors base, rotation possible).
- **Anti-rejeu** : le dernier pas accepté est mémorisé, et un code n'est valable qu'une fois.
- **10 codes de secours** à usage unique (≈ 49 bits chacun), stockés en HMAC-SHA256 avec une clé dérivée (HKDF) de la clé de chiffrement : une fuite de la base seule ne permet pas de les retrouver par force brute.
- L'enrôlement est imposé à la première connexion. L'URI `otpauth` ne contient pas l'e-mail.
- **Reporté :** les passkeys (WebAuthn), facultatives selon le cahier des charges, arrivent en phase 9 avec le back-office ; la réinitialisation du 2FA d'un administrateur par un autre administrateur aussi.

### D-031 · Anti-énumération
Inscription, mot de passe oublié et renvoi de confirmation renvoient le même message en au moins 400 ms, que l'adresse soit connue ou non. À l'inscription, le mot de passe est haché dans tous les cas, pour un coût identique. Une adresse déjà inscrite reçoit un e-mail d'information (« vous avez déjà un compte »), au plus 3 par heure. À la connexion, une empreinte factice est vérifiée quand le compte n'existe pas.

### D-032 · Changement d'adresse e-mail
Il exige le mot de passe, puis un lien envoyé à la **nouvelle** adresse ; l'ancienne adresse est prévenue. L'unicité est vérifiée à la confirmation (sans rien révéler à la demande). Toutes les sessions sont alors révoquées.

### D-033 · Suppression de compte (RGPD)
La ligne `users` est anonymisée plutôt que supprimée : les futures commandes et factures (conservation légale de 10 ans) y resteront rattachées sans identité. Adresses, jetons, codes et sessions sont supprimés. L'adresse e-mail redevient libre. Un administrateur ne peut pas supprimer son compte depuis l'espace client.

### D-034 · Journal d'audit immuable
Le déclencheur PostgreSQL `audit_logs_immutable` interdit `UPDATE`, `TRUNCATE` et tout `DELETE` de moins d'un an (seule la purge l'utilise). La table n'a pas de clé étrangère vers `users`, pour survivre à l'anonymisation. Elle ne contient aucune donnée personnelle : identifiants UUID et IP tronquée seulement.

### D-035 · E-mails
L'API met les e-mails en file BullMQ, le worker les rend et les envoie, avec 5 tentatives et un délai exponentiel. Une clé d'idempotence (`mail-<idJob>`) évite les doublons chez Resend en cas de relance. En développement, le transport `outbox` écrit les e-mails dans `tmp/mails` ; la production impose Resend. Les gabarits sont du code TypeScript (HTML + texte, données échappées, tests de rendu) : chaque modification passe en revue. Les autres gabarits arrivent en phase 8.

### D-036 · Durées de conservation (purge quotidienne à 3 h 30, heure de Paris)
Refresh tokens et jetons d'e-mail : 7 jours après expiration ou usage. Sessions : 30 jours après expiration ou révocation. Comptes jamais confirmés : 30 jours. Journal d'audit : 1 an. Voir `docs/RGPD.md`.

### D-037 · Mots de passe courants
Liste locale d'environ 46 000 mots de passe de 12 caractères ou plus, issus de la liste publique SecLists « xato-net 1M » (compressée, 320 Ko). Aucun appel sortant à la connexion. La vérification par k-anonymat auprès de « Have I Been Pwned » pourra être ajoutée en phase 10 si elle est jugée utile.

### D-038 · Build non incrémental
`tsconfig.build.json` désactive la compilation incrémentale. Avec `deleteOutDir`, le fichier `.tsbuildinfo` faisait croire que des fichiers déjà supprimés de `dist/` étaient à jour (constaté : `instrument.js` absent d'un second build local). L'image Docker, construite à neuf, n'était pas touchée.

### D-039 · Création d'un administrateur
Uniquement par la commande `make create-admin` (mot de passe saisi sans écho, jamais en argument ni en variable d'environnement). L'adresse est réputée vérifiée et le second facteur est configuré à la première connexion. **Un compte existant n'est jamais promu** par cette commande : la promotion passera par le back-office (phase 9), auditée.

## Audit de conformité (12/10/2026)

### D-040 · Rôle de base de données à privilèges minimaux
**Constat de l'audit :** l'API et le worker se connectaient avec `diani`, superutilisateur de l'image Postgres et propriétaire des tables. Une injection SQL (aucune trouvée) aurait permis de désactiver les déclencheurs du journal d'audit, voire d'exécuter des commandes sur le conteneur (`COPY … TO PROGRAM`).
**Choix :** rôle `diani_app` (SELECT, INSERT, UPDATE, DELETE ; ni DDL, ni TRUNCATE, ni `_prisma_migrations`) pour l'API et le worker ; le rôle propriétaire reste réservé aux migrations, sauvegardes et restaurations.
- Droits versionnés dans une migration (avec `ALTER DEFAULT PRIVILEGES` pour les tables futures), identiques dans tous les environnements, CI comprise.
- Le mot de passe (attribut LOGIN) n'est jamais dans une migration : script d'initialisation `docker/postgres/20-app-role.sh` (variable psql, donc échappée) ou `make db-app-role`.
- Les tests e2e tournent sous `diani_app` : une requête qui aurait besoin de plus de droits échoue en CI, pas en production.
- `restore.sh` réapplique les droits, puisque les sauvegardes sont faites sans eux (`--no-privileges`).
- En développement, `.env` garde le rôle propriétaire : `make migrate` et l'API partagent la même URL. Écart assumé, sans incidence sur la production.

