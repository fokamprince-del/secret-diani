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

Désactivé par défaut (`SWAGGER_ENABLED=false`) et **refusé en production** : l'API ne démarre pas si la variable y vaut `true` (ajout de l'audit, constat N3). La spécification est exportée dans `docs/openapi.json` (`npm run openapi:export`). La CSP n'est assouplie que sur `/api/docs`.

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

### D-048 · Migration `app_role` compatible avec `prisma migrate dev`

La révocation sur `_prisma_migrations` faisait échouer la base « shadow » de `prisma migrate dev` (table absente) : plus aucune migration ne pouvait être générée (`make migrate-new`). Elle est désormais conditionnelle (`to_regclass`). Aucun environnement de production n'avait encore appliqué la migration ; en développement, l'empreinte enregistrée a été recalculée.

## Phase 4 — Traiteur

### D-041 · Acompte d'une commande à 50 € pile (question C3 de l'audit)

Le cahier dit « 10 € si total < 50 €, 20 € au-delà » et ailleurs « 20 € si > 50 € » : 50 € pile n'est couvert par aucune des deux formulations. **Choix : 50 € pile → 20 €** (la seule condition stricte énoncée est « moins de 50 € » ; la FAQ du seed le formulait déjà ainsi).

- Seuil et montants sont des **paramètres du site** (`catering.deposit_threshold_cents`, `catering.deposit_below_cents`, `catering.deposit_from_cents`) : Diani peut les changer sans déploiement.
- La phrase des conditions sur l'acompte est **générée** à partir de ces montants, jamais saisie à la main : elle ne peut pas les contredire.
- L'acompte ne dépasse jamais le total (commande de 8 € → 8 €).

### D-042 · Modèle du catalogue

- Catégorie typée (`platter`, `a_la_carte`, `layer_cake`) qui pilote l'affichage ; Diani peut en créer plusieurs du même type.
- Un produit a au moins une **variante** (taille ou conditionnement, prix en centimes) : un plateau a une seule variante, un layer cake une par taille, avec un nombre de parts indicatif.
- Parfums : liste globale, rattachée aux produits qui les proposent, avec un nombre maximal au choix par produit.
- Galerie d'images issues de la médiathèque (phase 3), la première sert de vignette.
- Les lignes d'une demande **figent** libellés, prix et parfums : modifier ou supprimer un produit ne réécrit jamais l'historique. La suppression d'un produit est logique et libère son slug.

### D-043 · Cycle d'une demande et acompte manuel

`nouvelle → contactée → acompte reçu → confirmée → livrée`, annulation possible jusqu'à la livraison (motif obligatoire). Transitions vérifiées par une machine à états, appliquées par mise à jour conditionnelle (deux clics simultanés n'en font qu'un) et doublées d'une contrainte CHECK : une commande confirmée ou livrée a toujours un acompte et un total convenu.

- L'acompte s'enregistre par une action dédiée : montant **calculé** sur le total convenu, moyen de paiement noté. Le total est ensuite figé.
- La confirmation envoie l'e-mail « commande confirmée » (acompte, solde, conditions).
- Chaque étape est historisée (`catering_request_events`) et journalisée (`audit_logs`).
- Une demande livrée ou annulée n'accepte plus que des notes internes.

### D-044 · Anti-spam du formulaire « Demande personnalisée »

- Limitation de débit : 3 envois par 10 minutes et par IP (commande en ligne comprise).
- **Piège à robots** : champ caché `website` ; s'il est rempli, la réponse est identique à un succès, rien n'est enregistré ni envoyé.
- **Cloudflare Turnstile** : clé `TURNSTILE_SECRET_KEY` obligatoire en production (refus de démarrer sinon). Vérification à URL fixe (aucun SSRF). Si Cloudflare est injoignable, le formulaire est refusé (503) plutôt qu'ouvert sans contrôle.
- **Anti-bombardement d'e-mails** : un tiers pourrait saisir l'adresse d'une victime. L'accusé de réception est envoyé au plus 3 fois par jour à une même adresse (compteur Redis sur l'empreinte SHA-256 de l'adresse) ; il ne reprend pas le message libre. Les demandes suivantes sont enregistrées quand même.
- Notification envoyée à **toutes les administratrices actives** (aucune adresse à configurer).
- Le client n'envoie jamais de prix : la sélection ne contient que des identifiants de variantes, le total estimé est calculé par le serveur ; un champ de prix dans le corps est refusé (400).

### D-045 · Parcours avancé (`CATERING_ONLINE_ORDERING`)

Le code existe et est testé, mais désactivé par défaut : `GET /catering/slots` et `POST /catering/orders` répondent 403 `FEATURE_DISABLED` avec un message qui renvoie vers la demande personnalisée. L'administration peut préparer les créneaux à tout moment.

- **Aucun surbooking** : la commande verrouille la ligne du créneau (`SELECT … FOR UPDATE`) avant de compter les commandes existantes ; testé avec quatre commandes simultanées sur un créneau d'une place (une acceptée, trois refusées).
- Total et acompte sont calculés par le serveur à la commande. Le **paiement de l'acompte en ligne** arrive avec la phase Paiements (6).
- Un créneau qui porte des commandes ne se supprime pas (il se désactive) ; sa capacité ne peut pas descendre sous le nombre de commandes.

### D-046 · Paramètres du site

`SettingsService` lit la table `app_settings` avec un schéma Zod et une valeur par défaut sûre par paramètre : une valeur absente ou mal saisie retombe sur la valeur par défaut, la page publique ne casse jamais. L'écran d'administration des paramètres arrive en phase 9 ; il devra invalider le cache concerné (étiquette `catering` pour l'acompte, les conditions et le numéro WhatsApp).

### D-047 · Données personnelles des demandes

- Base légale : mesures précontractuelles à la demande de la personne (pas de case de consentement).
- Conservation : **anonymisation** 3 ans après la dernière activité (recommandation CNIL pour la prospection), par la purge quotidienne. Montants et lignes sont conservés pour l'historique d'activité.
- Droit d'accès : l'export `/me/export` inclut les demandes envoyées avec l'adresse du compte, **notes internes comprises** (elles font partie des données de la personne).

### D-049 · Données de référence du traiteur

Le seed crée les catégories, produits, variantes et parfums du cahier des charges, **visibles** (prix communiqués par Diani) mais sans photo, ainsi que les paramètres d'acompte. Il est idempotent et ne modifie jamais un élément existant.

## Phase 5 — Boutique

### D-050 · Stock, réservations et survente
- Un stock par variante : **en stock** et **réservé** (paiements en cours) ; disponible = en stock − réservé.
- Réserver, vendre, libérer et remettre en stock sont des mises à jour **conditionnelles atomiques** (`UPDATE … WHERE on_hand - reserved >= n`) plutôt qu'un `SELECT … FOR UPDATE` suivi d'une écriture : une seule requête, aucun verrou applicatif. Les variantes sont toujours traitées dans le même ordre (pas d'interblocage entre deux commandes).
- Contraintes CHECK en dernier rempart : `on_hand >= 0`, `0 <= reserved <= on_hand`. Testé : cinq paniers se disputent la dernière pièce, une seule commande passe.
- Réservation de **15 minutes** à la validation du panier (paramètre `shop.reservation_minutes`) ; le worker annule chaque minute les commandes non payées et libère leur stock.
- Un paiement confirmé après expiration revend le stock s'il est encore disponible ; sinon la commande reste annulée et la confirmation renvoie `stock_unavailable` : le paiement doit être remboursé (phase 6).
- Une nouvelle validation du même panier annule la commande encore en attente et libère son stock avant le recalcul : jamais deux réservations pour un panier, ni de blocage par sa propre réservation (bogue trouvé par les tests e2e).
- Plafond de 10 exemplaires d'un même article par commande (`shop.max_quantity_per_item`), et 5 validations de panier par 10 minutes et par IP : un robot ne peut pas immobiliser tout le stock.

### D-051 · Panier invité et connecté
- Invité : jeton aléatoire de 256 bits en cookie `diani_cart` (`HttpOnly; Secure; SameSite=Strict`, chemin `/api/v1/shop`), seule son empreinte SHA-256 est en base ; durée 30 jours glissants. Connectée : panier lié au compte (1 an).
- Routes `@OptionalAuth()` : sans en-tête `Authorization`, panier invité ; avec un jeton, celui-ci est vérifié (un jeton invalide donne 401, jamais un panier invité).
- Les routes qui modifient le panier ou valident la commande exigent la garde CSRF existante (en-tête `X-CSRF-Token` + origine), puisque le panier invité est authentifié par cookie.
- Fusion à la connexion par une route explicite (`POST /shop/cart/merge`) : quantités additionnées et plafonnées, panier invité supprimé, cookie effacé.
- Aucun prix stocké dans le panier : tout est recalculé à chaque lecture ; un champ de prix envoyé est refusé (400).

### D-052 · Lien de suivi signé
Le suivi d'une commande sans compte se fait par un **lien signé** : identifiant de commande + HMAC-SHA256 tronqué à 128 bits, clé dérivée (HKDF) de `FIELD_ENCRYPTION_KEY` (l'ancienne clé reste acceptée pendant une rotation). Rien n'est stocké, le lien peut figurer dans chaque e-mail (un jeton aléatoire haché n'aurait pas pu être renvoyé au moment du paiement). Il donne un accès en lecture à la commande et à sa facture ; les notes internes de l'historique n'y figurent pas.

### D-053 · Factures
- Émises dans la transaction qui enregistre le paiement ; numéro `F-AAAA-NNNNN` tiré d'une séquence par année (`invoice_sequences`, `INSERT … ON CONFLICT DO UPDATE … RETURNING`) : en cas d'échec, l'incrément est annulé avec la transaction, la **numérotation est continue**.
- Contenu figé à l'émission (vendeur, acheteur, lignes, montants, mention TVA) ; table **inaltérable** par déclencheur : seule la pose du PDF est permise, une fois ; aucune suppression avant 10 ans.
- PDF produit par le worker (`pdfkit`, polices PDF standard : accents et symbole euro inclus) et stocké dans le bucket privé ; téléchargement par URL signée de 5 minutes.
- Vendeur et mention TVA : paramètre `legal.seller`. Hypothèse par défaut : franchise en base de TVA (« TVA non applicable, art. 293 B du CGI »), **à confirmer par Diani**, ainsi que forme juridique, adresse et SIRET, obligatoires sur une facture.

### D-054 · Statuts de commande
`en attente de paiement → payée → en préparation → expédiée → livrée`. « Payée » n'est posé que par la confirmation du paiement, « remboursée » que par un remboursement (phase 6) : l'administration ne choisit que les étapes logistiques. Une commande non payée s'annule (motif obligatoire, stock libéré) ; une commande payée se rembourse. L'expédition envoie l'e-mail de suivi (transporteur et numéro facultatifs).

### D-055 · Catalogue et disponibilité
- Textes, prix et images sont mis en cache (invalidés à chaque modification) ; la **disponibilité est lue en direct**, et les réponses publiques ne sont cachées que 30 s (CDN compris) : un « plus que 2 » ne reste jamais périmé pendant un pic de ventes.
- Le tableau comparatif des kits est **déduit de leur composition** (éléments rapprochés sans tenir compte de la casse, des accents ni des espaces) : aucune double saisie.
- Une variante déjà vendue, réservée ou mise en panier n'est jamais effacée : elle est désactivée (historique des mouvements et des commandes intact). Suppression de produit logique, slug libéré.

### D-056 · Export CSV
Séparateur « ; », UTF-8 avec BOM (Excel français), et **neutralisation des formules** : une cellule qui commence par `=`, `+`, `-`, `@`, tabulation ou retour chariot est préfixée d'une apostrophe (injection CSV, OWASP), sauf un nombre.

### D-057 · Données de référence de la boutique
Le seed crée les trois kits du cahier des charges (prix indicatifs) **masqués et sans stock** : composition, poids, photos et stock sont à compléter. Aucun tarif de livraison n'est inventé ; tant qu'il n'en existe pas, aucune commande ne peut être validée.

## Phase 6 — Paiements

### D-058 · Pages de paiement hébergées
Stripe Checkout et PayPal (commande en « capture ») : la cliente paie sur la page du prestataire, aucune donnée de carte ne transite par nos serveurs (PCI DSS, questionnaire SAQ A). Les montants envoyés au prestataire sont ceux de la commande figée en base, ligne par ligne (frais de port compris) ; la session est refusée si le total calculé par le prestataire diffère. L'accès au paiement passe par le lien signé de la commande (D-052), avec ou sans compte.

### D-059 · Une commande n'est validée qu'après un événement confirmé
Preuves acceptées : webhook Stripe signé (`checkout.session.completed` payé), capture PayPal faite par le serveur lui-même (retour de la cliente, webhook `CHECKOUT.ORDER.APPROVED` ou réconciliation), webhook PayPal vérifié. Le montant et la devise reçus sont comparés au paiement attendu : un écart ne valide rien et alerte l'administration. La confirmation est idempotente (paiement réclamé par mise à jour conditionnelle, commande verrouillée).

### D-060 · Webhooks
- Corps **brut** (analyseur dédié au chemin des webhooks, avant le JSON global) : la signature porte sur les octets exacts.
- Stripe : signature HMAC et horodatage (5 min) vérifiés par le SDK officiel. PayPal : vérification par l'API PayPal (`verify-webhook-signature`, identifiant du webhook) et horodatage de 5 min vérifié localement ; PayPal injoignable → 503 (PayPal renvoie plus tard).
- Idempotence : table `webhook_events`, unicité (prestataire, identifiant d'événement) ; un rejeu reçoit 200 sans nouveau traitement.
- Traitement **asynchrone** par le worker (file `payments`, 5 tentatives exponentielles, file des échecs) ; réponse immédiate au prestataire. Un événement en échec renvoyé par le prestataire est retraité.
- Liste d'adresses autorisées facultative (`WEBHOOK_ALLOWED_IPS`, IP ou CIDR) en plus des signatures, comme le demande le cahier (« si possible »).
- Contenu conservé 90 jours (rejeu, enquête), puis purgé.

### D-061 · Réservation du stock pendant le paiement
Stripe impose au moins 30 minutes de validité à une page de paiement, quand la réservation du stock dure 15 minutes (D-050). À l'ouverture d'une page, la réservation est **prolongée jusqu'à l'expiration de la page + 5 minutes** : un paiement abouti trouve toujours son stock. Une page encore valide est réutilisée (double clic, retour arrière).

### D-062 · Remboursements automatiques
- Paiement confirmé alors que la commande a expiré et que le stock manque : remboursement intégral automatique, e-mail à la cliente.
- **Double paiement** (Stripe et PayPal pour la même commande) : le second est remboursé automatiquement ; il ne compte pas dans les remboursements de la commande, qui reste payée une fois (bogue trouvé par les tests e2e).
- Un remboursement automatique en échec alerte l'administration (`payment-alert`).

### D-063 · Remboursements par l'administration
Total ou partiel, sur le premier paiement réussi de la commande. Le montant est contrôlé sous verrou (payé − remboursé − en cours). L'appel au prestataire porte une clé d'idempotence ; la finalisation est idempotente (réponse directe ou webhook `refund.updated`). Remboursement intégral : commande « remboursée », remise en stock sur demande. Un remboursement fait depuis le tableau de bord du prestataire est enregistré (webhook) pour que la commande et l'export restent justes. Remise en stock d'un remboursement partiel : par l'écran Stock (inventaire).

### D-064 · Réconciliation quotidienne
Chaque jour à 4 h 15 : les sessions Stripe payées des 48 dernières heures et les commandes PayPal en attente des 3 derniers jours sont confrontées à la base (un webhook perdu ne laisse jamais une commande payée en attente ; une validation PayPal non capturée est capturée). Les pages expirées passent en « abandonnées ». Les écarts sont envoyés à l'administration.

### D-065 · Litiges
Webhook de litige (Stripe `charge.dispute.created`, PayPal `CUSTOMER.DISPUTE.CREATED`) : paiement « en litige », journal d'audit, alerte e-mail. La réponse au litige se fait dans le tableau de bord du prestataire.

### D-066 · Versions et dépendances
SDK `stripe` 22.6.2 (et non la 23.0.0, publiée il y a moins de deux semaines, majeure), avec transport `fetch` injectable. PayPal par l'API REST v2 directement (`fetch`, hôtes fixes sandbox / production) : pas de SDK supplémentaire. Le parcours avancé du traiteur (acompte en ligne) réutilisera ces paiements lorsqu'il sera ouvert (D-045).

## Phase 7 — Formations

### D-067 · Packs inclusifs par niveau
Chaque pack a un **niveau** unique (Essentiel 1, Intermédiaire 2, Premium 3) ; une formation est rattachée au pack minimal qui l'ouvre, et un pack donne accès à toutes les formations de niveau inférieur ou égal (Premium ⊇ Intermédiaire ⊇ Essentiel). Ajouter un pack ou déplacer une formation ne demande aucun développement. Un seul accès actif par cliente et par pack (index unique partiel) ; l'historique des accès retirés est conservé.

### D-068 · Achat d'un pack
Compte obligatoire. L'achat crée une commande « numérique » (méthode `digital`, sans adresse de livraison ni ligne de livraison sur la facture) payée par les paiements existants (phase 6). L'accès n'est créé que **dans la transaction qui confirme le paiement** (`OrdersService.markPaid`), jamais avant ; testé : commande créée et page de paiement ouverte → toujours 403. Achat refusé si la cliente possède déjà ce pack ou un pack supérieur ; une commande en attente pour le même pack est réutilisée. Remboursement intégral → accès retiré.

### D-069 · Vidéo Bunny Stream
URL HLS signée par **jeton de répertoire** Bunny CDN (SHA-256, algorithme de la documentation Bunny) : le jeton couvre la playlist et tous ses segments, pour la durée de la vidéo + 30 minutes (4 h au plus). Jamais d'URL permanente ; liaison facultative à l'IP de la cliente (`BUNNY_STREAM_BIND_IP`, désactivée par défaut : elle coupe la lecture quand l'IP change, fréquent sur mobile). Sans configuration Bunny, la leçon n'a pas de vidéo (pas d'erreur).

### D-070 · Leçons, progression et quiz
- Accès vérifié **à chaque requête** (leçon, progression, quiz, fiche) ; la leçon d'exemple (`freePreview`) est ouverte sans compte ; un refus indique le pack à proposer (`COURSE_ACCESS_REQUIRED`).
- Reprise de lecture : position envoyée toutes les ~15 s (12 par minute au plus), ramenée à la durée de la vidéo.
- Leçon terminée = vidéo vue (si elle en a une) **et** quiz réussi (s'il y en a un).
- Quiz : correction côté serveur ; une question est juste si l'ensemble coché est exactement l'ensemble des bonnes réponses. Les bonnes réponses ne quittent jamais le serveur avant correction ; avec un nombre de tentatives limité, elles ne sont révélées qu'une fois le quiz réussi ou les tentatives épuisées (sinon la première correction donnerait la réponse de l'essai suivant). Meilleur score conservé.

### D-071 · Fiches PDF et filigrane
Fiches issues de la médiathèque (PDF vérifiés, bucket privé), téléchargées par URL signée de 5 minutes. Filigrane facultatif par fiche (nom et e-mail de la cliente, en diagonale et en pied de page) : produit **une fois** par le worker (`@cantoo/pdf-lib`, fork maintenu de pdf-lib), stocké par cliente et par version du fichier ; tant qu'il n'est pas prêt, la cliente reçoit 409 « en préparation ». Les dépendances du fork sont déclarées en « >= » : le lockfile les fige.

### D-072 · Certificats
Émis automatiquement quand toutes les leçons publiées sont terminées, si le nom et le prénom sont renseignés (figés à l'émission) ; sinon l'e-mail de fin de formation invite à compléter le profil, puis à demander le certificat. Numéro `DIANI-AAAA-XXXXXXXX` aléatoire (40 bits, alphabet sans caractères ambigus) : impossible d'énumérer les titulaires sur la page publique de vérification. PDF produit par le worker. Suppression du compte : certificat révoqué, nom retiré de la vérification publique. Une formation ayant délivré des certificats ne se supprime pas (elle se dépublie).

### D-073 · Avantages des packs
Appels personnalisés inclus = somme des appels des packs détenus (chaque achat apporte les siens) ; une demande d'appel décompte un appel (sauf annulée), sous verrou du compte (deux demandes simultanées ne dépassent pas le quota), et prévient l'administration. Les autres avantages (fournisseurs offerts…) sont la liste des contenus des packs détenus.

### D-074 · Documents produits par le worker
Factures, certificats et fiches filigranées passent par une même file `documents` et un module worker dédié (`DocumentsWorkerModule`), au lieu du worker de la boutique.

### D-075 · Données de référence des formations
Le seed crée les trois packs du cahier des charges (prix, contenus, appels inclus) et une **formation pilote** complète (vidéo factice, fiche PDF générée et déposée dans le stockage, conseils, quiz de 3 questions, leçon d'exemple) en **brouillon** : la vidéo factice ne doit pas être vue des clientes avant d'être remplacée.

### D-076 · Réponses de l'administration des formations
Les écrans d'édition reçoivent la formation complète (modules, leçons, fiches, quiz avec les bonnes réponses) ; ces réponses ne sont pas encore décrites en détail dans l'OpenAPI (schéma générique). À préciser avec le back-office (phase 9).

## Phase 8 — E-mails, contact et newsletter

### D-077 · Formulaire de contact
Message **enregistré** (suivi dans l'administration : nouveau, lu, répondu, archivé, note interne) puis envoyé par e-mail aux administrateurs avec un `Reply-To` sur l'adresse de la personne : Diani répond directement depuis sa messagerie. Accusé de réception à la personne, **3 par jour au plus** pour une même adresse (le formulaire ne doit pas servir à bombarder un tiers). Si la mise en file des e-mails échoue, le message reste enregistré et visible. Sujets fermés (général, traiteur, formations, boutique, partenariat, autre).

### D-078 · Anti-spam des formulaires publics
Même défense en trois couches que le traiteur : limitation de débit par IP (contact 3 / 10 min, inscription newsletter 5 / 10 min), piège à robots `website` (réponse identique, rien d'enregistré ni d'envoyé) et Cloudflare Turnstile (obligatoire en production).

### D-079 · Newsletter en double opt-in
L'inscription par le formulaire reste **en attente** jusqu'au clic sur le lien de confirmation (usage unique, 7 jours, empreinte SHA-256 seule en base). Réponse identique que l'adresse soit déjà inscrite ou non ; aucune relance pour une adresse déjà confirmée ; 3 e-mails de confirmation par jour au plus par adresse. Preuve du consentement conservée : texte exact de la case cochée, dates de demande et de confirmation, IP tronquées (/24, /48). Réinscription possible après une désinscription (nouveau double opt-in).

### D-080 · Désinscription en un clic
Chaque e-mail de la newsletter porte un lien de désinscription **signé** (identifiant + HMAC-SHA256 tronqué à 128 bits, clé dérivée par HKDF propre à cet usage, `IdSigner`) : sans date d'expiration (un vieil e-mail doit toujours permettre de partir), sans stockage, idempotent. En plus, en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058, exigés par Gmail et Yahoo pour les envois en nombre) pointant sur `POST /api/v1/newsletter/unsubscribe/one-click` ; ils ne sont posés que si `PUBLIC_API_URL` est défini. Le lien du site (`/newsletter/desinscription`) reste toujours présent.

### D-081 · Préférence du compte et newsletter
La case « recevoir les nouvelles » du compte et la newsletter sont une seule et même liste : cochée (adresse vérifiée), l'abonnement est confirmé directement (l'adresse est déjà prouvée, source `account`) ; décochée, la personne est désinscrite ; une désinscription par lien retire aussi la préférence du compte. Cochée à l'inscription, elle prend effet à la vérification de l'e-mail.

### D-082 · Envoi de la newsletter
L'API ne compose ni n'envoie de campagnes : l'administration exporte les abonné·es **confirmé·es** en CSV (avec la preuve du consentement, export journalisé) vers l'outil d'envoi choisi par Diani (Brevo, Resend Broadcasts…), qui gère alors sa propre désinscription. Les e-mails transactionnels restent sur Resend. Un envoi intégré pourra venir plus tard sans changer le modèle.

## Phase 9 — Administration et audit

### D-083 · Paramètres du site : un registre typé
Chaque paramètre est déclaré là où il sert (`*.settings.ts` : clé, schéma Zod, valeur par défaut sûre, description) et rassemblé dans un **registre** (`settings.registry.ts`). L'administration ne lit et n'écrit que les clés du registre : liste avec valeur en vigueur, valeur par défaut et **schéma JSON** (le back-office en génère le formulaire), modification validée par le schéma (erreurs en français, champ par champ : `value.text`), retour à la valeur par défaut. Toute modification invalide le cache public, revalide les pages concernées (étiquettes par groupe) et est journalisée (clé seulement). Une valeur invalide en base retombe sur la valeur par défaut, sans casser le site. Les anciens paramètres non typés (nom de la marque, autrice, Instagram, logo) passent dans ce registre ; Instagram rejoint `site.social_links`.

### D-084 · Rôles : pas de promotion par l'API
Le back-office ne change pas le rôle d'un compte : un administrateur se crée en ligne de commande, sur le serveur (`make create-admin-prod`). Une session d'administration volée ne peut donc pas fabriquer d'autres administrateurs.

### D-085 · Actions sur les comptes
Recherche (e-mail, prénom, nom ; comptes supprimés seulement sur demande), fiche (statistiques, 5 dernières commandes, jamais de secret), **suspension** (connexion refusée, toutes les sessions révoquées sur-le-champ), **réactivation** (qui lève aussi le verrou anti-force brute posé sur l'adresse), **réinitialisation du 2FA** (secret et codes de secours effacés, sessions révoquées, nouvel enrôlement exigé pour un administrateur), **déconnexion de tous les appareils**, **export des données** (demande d'accès reçue hors ligne). Chaque action est journalisée et la personne est prévenue par e-mail (`account-security-changed`). Une administratrice n'agit jamais ainsi sur son propre compte (espace personnel, ré-authentification) ; un compte supprimé est en lecture seule. Les accès aux formations s'accordent depuis `/admin/courses/accesses` (phase 7).

### D-086 · Interrupteurs de vente
`features.shop_open` et `features.course_sales_open` (ouverts par défaut) ferment la validation du panier et l'achat des packs (503 `FEATURE_DISABLED`, message en français) sans masquer les pages, ni toucher aux commandes et accès existants. Le frontend lit l'état dans `GET /api/v1/site/settings` pour masquer les boutons. Le parcours avancé du traiteur reste piloté par `CATERING_ONLINE_ORDERING` (variable d'environnement), parce qu'il dépend d'un déploiement.

### D-087 · Tableau de bord
`GET /api/v1/admin/dashboard?days=N` (1 à 365, 30 par défaut). Période en **jours civils de Paris** (la borne est calculée par PostgreSQL), ventes par date de paiement (brut, remboursé, net ; boutique et formations séparées), série quotidienne complète (zéro les jours sans vente), choses à faire (commandes à expédier, demandes traiteur en attente, événements des 14 prochains jours, messages, appels), nouvelles clientes, accès, newsletter, stocks bas (disponible ≤ seuil de la variante). Uniquement des comptages indexés, aucune donnée personnelle, pas de cache (données de l'administration).

### D-088 · Rotation de la clé de chiffrement outillée
`make reencrypt-secrets-prod` rechiffre avec la clé courante les secrets TOTP encore chiffrés avec l'ancienne : idempotent, mise à jour conditionnée à la valeur lue (sûr pendant que l'API tourne), rapport « vérifiés / rechiffrés / illisibles », code de sortie non nul si un secret est illisible. Les codes de secours, liens de suivi de commande et liens de désinscription sont des empreintes ou signatures HMAC (clés dérivées) : ils ne se rechiffrent pas, d'où la procédure du RUNBOOK avant de retirer l'ancienne clé.

### D-089 · OpenAPI de l'administration des formations
Réponses décrites en détail (packs, formation complète avec modules, leçons, fiches, quiz et bonnes réponses, accès, demandes d'appel) et typées dans le contrôleur : le compilateur vérifie qu'elles correspondent aux requêtes. Clôt D-076.

### D-090 · Clés d'accès (passkeys) reportées
Le cahier des charges les laisse facultatives. Le TOTP obligatoire couvre le risque pour les administrateurs ; WebAuthn demanderait un enregistrement et une vérification côté frontend. À reconsidérer après la mise en ligne.
