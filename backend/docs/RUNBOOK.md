# Runbook d'exploitation

> Mise en production pas à pas : [RAPPORT_FINAL.md](RAPPORT_FINAL.md) › Procédure de mise en production. Ce document décrit l'exploitation courante.

## Sauvegardes

### Mise en place (une fois, sur le VPS)

1. Installer `age` et `rclone` (`apt install age rclone`).
2. **Sur un poste sûr, pas sur le serveur**, générer la paire de clés : `age-keygen -o diani-backup.key`. Conserver la clé privée hors ligne, dans un gestionnaire de mots de passe, avec deux personnes de confiance. Sur le serveur, ne reporter que la ligne `public key: age1…`.
3. Configurer un remote rclone vers OVH Object Storage (bucket dédié, région différente du VPS), puis activer sur ce bucket le verrouillage d'objets et une règle de cycle de vie de 30 jours.
4. Ajouter dans `/etc/diani/backup.env` (chmod 600) :
   ```
   BACKUP_AGE_RECIPIENT=age1…
   BACKUP_RCLONE_REMOTE=ovh-backup:diani-backups
   ```
5. Planifier la sauvegarde quotidienne (cron, 3 h UTC) :
   ```
   0 3 * * * cd /opt/diani && set -a && . /etc/diani/backup.env && set +a && ./scripts/backup.sh >> /var/log/diani-backup.log 2>&1
   ```

### Restauration

```
BACKUP_AGE_IDENTITY=/chemin/temporaire/diani-backup.key ./scripts/restore.sh backups/diani-AAAAMMJJ-HHMMSS.dump.age
```

- La sauvegarde est restaurée dans une base séparée `diani_restore`, jamais directement en production.
- Vérifier les données, puis décider de la bascule : arrêter `api` et `worker`, renommer les bases (`ALTER DATABASE`), redémarrer.
- Le script réapplique lui-même ce que `pg_dump` ne sauvegarde pas : les droits du rôle applicatif `diani_app` (sans eux, l'API n'a plus accès à rien après la bascule) et les délais de sécurité (`docker/postgres/10-timeouts.sql`).
- Supprimer la clé privée du serveur immédiatement après la restauration.

### Essai de restauration — journal

| Date | Environnement | Résultat |
|---|---|---|
| 2026-10-09 | Dev local (Docker) | Sauvegarde chiffrée (en-tête `age-encryption.org/v1`) puis restauration dans `diani_restore` : migrations présentes, donnée témoin retrouvée. |

À refaire chaque trimestre et après toute modification des scripts.

## Base de données : rôles

| Rôle | Utilisé par | Droits |
|---|---|---|
| `diani` (`POSTGRES_USER`) | conteneur `migrate`, sauvegarde, restauration, interventions manuelles | propriétaire du schéma (superutilisateur de l'image Postgres) |
| `diani_app` | `api` et `worker` (`DATABASE_URL`) | lecture et écriture des données seulement : ni DDL, ni TRUNCATE, ni accès à `_prisma_migrations` |

Les droits de `diani_app` sont versionnés dans la migration `20261013000000_app_role`, appliqués aussi aux tables créées par les migrations suivantes. Un attaquant qui obtiendrait l'exécution de SQL via l'API ne pourrait donc ni désactiver les déclencheurs du journal d'audit, ni modifier le schéma (test : `account.e2e` › « le rôle de l'API ne peut ni désactiver les déclencheurs ni modifier le schéma »).

### Mise en place

1. Générer le mot de passe **en hexadécimal** (le base64 contient `/`, `+` et `=`, qui cassent l'URL de connexion) : `openssl rand -hex 32`.
2. L'ajouter à `.env.production` : `POSTGRES_APP_PASSWORD=…`.
3. **Volume neuf** : rien d'autre à faire, `docker/postgres/20-app-role.sh` crée le rôle au premier démarrage de Postgres.
   **Base existante** (volume créé avant ce rôle) : appliquer les migrations (`migrate`), puis `make db-app-role`, puis redémarrer `api` et `worker`.

### Rotation du mot de passe de `diani_app`

Nouveau mot de passe dans `.env.production`, puis `make db-app-role` (idempotent) et redémarrage de `api` et `worker` (`up -d`). Les connexions déjà ouvertes restent valides jusqu'au redémarrage.

## Comptes administrateurs

### Créer un administrateur

Jamais via le seed, jamais avec un mot de passe dans une commande ou une variable d'environnement.

```
# Développement
make create-admin
# Production (sur le VPS, dans /opt/diani)
make create-admin-prod
# soit : docker compose -f docker-compose.prod.yml --env-file .env.production run --rm -it api node dist/cli/create-admin.js
```

La commande demande l'e-mail, le prénom et le mot de passe (saisi sans écho, deux fois). À sa première connexion, l'administrateur configure son application d'authentification (TOTP) et reçoit 10 codes de secours **à conserver hors ligne**.

### Administrateur ayant perdu son téléphone

1. Se connecter avec un code de secours, puis remplacer les codes : `POST /api/v1/auth/2fa/backup-codes` (code TOTP exigé).
2. Si l'application d'authentification elle-même est perdue : un autre administrateur réinitialise le 2FA depuis le back-office (`POST /api/v1/admin/users/:id/mfa/reset`) ; l'enrôlement est redemandé à la connexion suivante. S'il n'y a pas d'autre administrateur : créer un administrateur de secours (`make create-admin-prod`), puis faire la réinitialisation depuis son compte. L'action est journalisée.

## Rotation des secrets

### `JWT_ACCESS_SECRET` (jetons d'accès)

1. Générer un nouveau secret : `openssl rand -base64 48`.
2. Dans `.env.production` : `JWT_ACCESS_SECRET_PREVIOUS=<ancien>` et `JWT_ACCESS_SECRET=<nouveau>`, puis redéployer. Les jetons en cours restent valides.
3. Après 15 minutes au moins (durée maximale d'un jeton d'accès), retirer `JWT_ACCESS_SECRET_PREVIOUS` et redéployer.

En cas de **compromission**, sauter l'étape de transition : tous les jetons d'accès deviennent invalides, et les utilisateurs les renouvellent de façon transparente avec leur cookie de session.

### `FIELD_ENCRYPTION_KEY` (secrets 2FA, codes de secours)

1. Générer une nouvelle clé : `openssl rand -base64 32`. La stocker hors serveur (gestionnaire de mots de passe), jamais avec les sauvegardes de la base.
2. `FIELD_ENCRYPTION_KEY_PREVIOUS=<ancienne>` et `FIELD_ENCRYPTION_KEY=<nouvelle>`, puis redéployer : les secrets existants restent lisibles.
3. Rechiffrer les secrets TOTP : `make reencrypt-secrets-prod`. Le rapport doit afficher « illisibles : 0 » (sinon, ne pas aller plus loin : réinitialiser le 2FA des comptes concernés depuis le back-office, puis relancer).
4. Chaque administrateur remplace ses codes de secours (`POST /api/v1/auth/2fa/backup-codes`) : ils sont protégés par une empreinte liée à la clé et ne se rechiffrent pas.
5. Les liens de suivi de commande et de désinscription déjà envoyés sont signés avec l'ancienne clé. Hors compromission, garder `FIELD_ENCRYPTION_KEY_PREVIOUS` au moins 3 mois (les liens de désinscription des anciennes newsletters restent ainsi valides), puis la retirer et redéployer. En cas de **compromission**, la retirer tout de suite après les étapes 3 et 4.

## Variables d'environnement ajoutées en phase 2

À ajouter dans `.env.production` (chmod 600) avant le déploiement : `JWT_ACCESS_SECRET`, `FIELD_ENCRYPTION_KEY`, `MAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `MAIL_FROM`, et éventuellement `MAIL_REPLY_TO` et `TERMS_VERSION`. Voir `.env.example`. L'API et le worker refusent de démarrer si l'une d'elles manque.

## Variables d'environnement ajoutées en phase 4

`TURNSTILE_SECRET_KEY` (obligatoire en production) : clé secrète du widget Cloudflare Turnstile, créé dans le tableau de bord Cloudflare (Turnstile → ajouter un site, domaine du site, mode « Managed »). La **clé publique** du même widget est fournie au frontend. `CATERING_ONLINE_ORDERING` reste à `false` tant que le paiement de l'acompte en ligne n'est pas livré (phase 6).

## Traiteur : réglages sans déploiement

Les paramètres suivants se trouvent dans la table `app_settings` (écran d'administration en phase 9 ; d'ici là, une ligne SQL suffit ; la valeur est prise en compte au plus tard après la durée du cache, `CONTENT_CACHE_TTL_SECONDS`, 5 minutes par défaut) :

| Clé | Valeur par défaut | Rôle |
|---|---|---|
| `catering.deposit_threshold_cents` | `5000` | Seuil de l'acompte (50 €) |
| `catering.deposit_below_cents` | `1000` | Acompte sous le seuil (10 €) |
| `catering.deposit_from_cents` | `2000` | Acompte à partir du seuil (20 €) |
| `catering.min_notice_days` | `2` | Délai minimal avant l'événement (jours) |
| `catering.conditions` | 3 phrases | Conditions affichées après la phrase sur l'acompte |
| `site.whatsapp_number` | vide | Numéro WhatsApp international (`+33…`) ; vide = pas de bouton WhatsApp |

## Boutique : avant d'ouvrir les ventes

1. **Mentions du vendeur** (`legal.seller`, obligatoires sur chaque facture, figées à l'émission) : nom commercial, forme juridique, adresse, SIRET, e-mail, mention TVA. Par défaut : « TVA non applicable, art. 293 B du CGI » (franchise en base), à confirmer.
2. **Tarifs de livraison** (Boutique → Livraison) : aucun n'est créé par le seed. Sans tarif actif, aucune commande ne peut être validée. Pour le retrait, renseigner aussi `shop.pickup_details` (adresse, horaires).
3. **Kits** : compléter composition, poids d'expédition, photos, puis réassort (Boutique → Stock) et rendre visibles.

| Clé | Valeur par défaut | Rôle |
|---|---|---|
| `shop.reservation_minutes` | `15` | Durée de réservation du stock pendant le paiement |
| `shop.max_quantity_per_item` | `10` | Quantité maximale d'un même article par commande |
| `shop.low_stock_display` | `5` | Seuil d'affichage « plus que N » |
| `shop.pickup_details` | vide | Adresse et horaires du retrait |
| `legal.seller` | voir ci-dessus | Vendeur affiché sur les factures |

Le seuil d'**alerte** « stock bas » se règle par variante (Boutique → Stock) ; l'e-mail part une fois, puis de nouveau après un réassort au-dessus du seuil.

## Paiements : mise en place

### Stripe
1. Tableau de bord Stripe → Développeurs → Clés API : créer une **clé restreinte** (`rk_live_…`) avec les droits *Checkout Sessions* (écriture), *Refunds* (écriture), *PaymentIntents* (lecture) → `STRIPE_SECRET_KEY`.
2. Développeurs → Webhooks → Ajouter un point de terminaison : `https://<domaine de l'API>/api/v1/payments/webhooks/stripe`, événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.updated`, `charge.dispute.created`. Copier le secret de signature → `STRIPE_WEBHOOK_SECRET`.
3. Facultatif : liste d'IP des webhooks Stripe (documentation Stripe « IP addresses ») dans `WEBHOOK_ALLOWED_IPS`, en même temps que celles de PayPal si PayPal est activé.

### PayPal
1. developer.paypal.com → Apps & Credentials (mode **Live**) → créer une application REST → `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` ; `PAYPAL_ENVIRONMENT=live`.
2. Dans l'application → Webhooks → ajouter `https://<domaine de l'API>/api/v1/payments/webhooks/paypal`, événements : `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `CUSTOMER.DISPUTE.CREATED`. Copier l'identifiant du webhook → `PAYPAL_WEBHOOK_ID`.

### Vérifier
- `GET /api/v1/payments/methods` indique les moyens actifs.
- Une commande test en mode test (clés `sk_test_…`, PayPal sandbox), puis le remboursement depuis l'administration, avant de passer aux clés de production.
- Les webhooks en échec restent dans `webhook_events` (statut `failed`, message d'erreur) et dans la file des échecs de BullMQ ; le prestataire les renvoie aussi de lui-même (Stripe pendant 3 jours).
- La réconciliation quotidienne (4 h 15) rattrape un paiement dont le webhook aurait été perdu ; ses écarts arrivent par e-mail (« Paiements : écarts de réconciliation »).

## Formations : mise en place

### Bunny Stream (vidéos)
1. bunny.net → Stream → créer une bibliothèque (région Europe), y téléverser les vidéos (format vertical 9:16 accepté).
2. Zone de diffusion de la bibliothèque → **Security** : activer « Token authentication » et copier la clé → `BUNNY_STREAM_TOKEN_KEY` ; nom d'hôte de la zone (`vz-….b-cdn.net`) → `BUNNY_STREAM_CDN_HOST`. Désactiver l'accès direct non signé.
3. Dans l'administration, renseigner pour chaque leçon l'identifiant de la vidéo (GUID Bunny) et sa durée en secondes.

### Avant d'ouvrir les ventes
- Vérifier les trois packs (prix, contenus, appels inclus) créés par le seed.
- Formation pilote : remplacer la vidéo factice (`video-pilote-a-remplacer`) et la fiche de démonstration, puis la publier.
- Une formation se publie dès qu'elle a au moins une leçon publiée ; une leçon marquée « exemple gratuit » est visible sans compte.
- Le certificat porte le prénom et le nom du profil : rappeler aux clientes de les renseigner.

## Back-office : paramètres et comptes

- **Paramètres du site** (`/api/v1/admin/settings`) : acomptes, conditions traiteur, durée de réservation du stock, mentions des factures, coordonnées, réseaux sociaux, bandeau d'annonce, ouverture de la boutique et des ventes de formations. Effet immédiat, sans déploiement ; « revenir à la valeur par défaut » est toujours possible. Le guide pas à pas pour Diani est dans `docs/GUIDE_ADMIN.md`.
- **Fermer temporairement la boutique** (vacances) : `features.shop_open` à `false`. Le catalogue reste visible, la validation du panier est refusée avec un message aimable.
- **Compte compromis ou abusif** : suspendre le compte (toutes ses sessions sont coupées), consigner la raison dans le suivi interne ; réactiver une fois la situation réglée.
- **Demande d'accès à ses données reçue par e-mail ou courrier** : vérifier l'identité de la personne, puis exporter ses données depuis sa fiche (`GET /api/v1/admin/users/:id/export`) et les lui transmettre par un canal sûr, sous un mois.

## E-mails : domaine d'envoi (Resend)

Sans authentification du domaine, les e-mails (confirmations, factures, newsletter) finissent en indésirables. Une fois, avant la mise en ligne :
1. Resend → **Domains** → ajouter `lessecretsdediani.fr` (région UE). Créer chez le registrar les enregistrements DNS affichés : **DKIM** (TXT `resend._domainkey`), **SPF** (TXT et MX du sous-domaine d'envoi `send`). Attendre l'état « Verified ».
2. **DMARC** : TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:dmarc@lessecretsdediani.fr` pendant deux à quatre semaines, lire les rapports, puis passer à `p=quarantine`.
3. `MAIL_FROM` sur ce domaine ; `MAIL_REPLY_TO` vers une boîte réellement lue (les messages de contact, eux, répondent directement à la personne).
4. `PUBLIC_API_URL=https://<domaine de l'API>` : active la désinscription en un clic depuis Gmail, Yahoo, Outlook (en-têtes `List-Unsubscribe`).
5. Vérifier avec mail-tester.com (score ≥ 9/10) en s'inscrivant à la newsletter avec l'adresse fournie.

## Contact et newsletter

- Les messages du formulaire arrivent par e-mail aux administrateurs (« Répondre » écrit directement à la personne) et dans l'administration (`/admin/contact-messages`) : les passer en « répondu » ou « archivé ».
- Campagnes : exporter les abonné·es confirmé·es (`GET /api/v1/admin/newsletter/subscribers/export`) et les importer dans l'outil d'envoi ; ne jamais réimporter une liste plus ancienne (elle contiendrait des personnes désinscrites depuis). Exporter juste avant chaque envoi.
- Demande d'effacement d'une personne sans compte : la supprimer de la liste dans l'administration, et dans l'outil d'envoi.

## Déploiement continu

Chaque fusion sur `main` qui passe la CI est déployée automatiquement (D-091). Déroulé, visible dans l'onglet *Actions* de GitHub :
1. publication des images `les-secrets-de-diani-backend` et `-migrate` sur ghcr.io ;
2. copie de `docker-compose.prod.yml`, `docker/`, `scripts/` et du `Makefile` dans `/opt/diani` ;
3. `scripts/deploy.sh <tag>` sur le serveur : sauvegarde chiffrée, migrations, remplacement de `api` puis `api-2` puis `worker` (chacun doit redevenir « healthy »), test de fumée ;
4. test de fumée depuis GitHub, à travers Cloudflare.

En cas d'échec à l'étape 3, la version précédente est remise en service automatiquement et le job échoue (e-mail de GitHub).

### Mise en place (une fois)

Sur le serveur :
1. Utilisateur `deploy` sans sudo, membre du groupe `docker`, propriétaire de `/opt/diani`. Clé SSH **dédiée** au déploiement dans `~deploy/.ssh/authorized_keys`.
2. `/opt/diani/.env.production` (chmod 600) : variables de l'application (voir `.env.example`) **et** celles de compose : `GHCR_OWNER` (propriétaire du dépôt GitHub, en minuscules), `API_DOMAIN`, `SITE_DOMAIN` (domaine du site, sans `https://`), `ACME_EMAIL`, `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, `REDIS_PASSWORD`. Pour la revalidation des pages du site : `FRONTEND_REVALIDATE_URL=http://web:5173/api/revalidate,http://web-2:5173/api/revalidate` (réseau interne, une adresse par instance, D-097) et `FRONTEND_REVALIDATE_SECRET` (32 caractères au moins, `openssl rand -base64 48`).
3. Accès en lecture aux images : jeton GitHub (*fine-grained*, permission `read:packages` seulement), puis `docker login ghcr.io -u <compte>` en tant que `deploy`.
4. `/etc/diani/backup.env` (voir Sauvegardes) : la sauvegarde avant migration l'utilise.

Dans GitHub, *Settings › Environments › production* :
- secrets `DEPLOY_HOST`, `DEPLOY_USER` (`deploy`), `DEPLOY_SSH_KEY` (clé privée dédiée), `DEPLOY_KNOWN_HOSTS` (ligne de `ssh-keyscan -t ed25519 <hôte>`, **vérifiée** contre l'empreinte affichée par l'hébergeur) ;
- variable `API_DOMAIN` ;
- pour le site (CI du frontend) : variables `SITE_DOMAIN`, `MEDIA_URL` (origine publique des médias), et si utilisées `PLAUSIBLE_DOMAIN`, `TURNSTILE_SITE_KEY` (clé **publique**) : elles sont figées dans le JavaScript au build ;
- facultatif : « Required reviewers » pour valider chaque mise en production à la main.

### Déploiement du site (Next.js)

Une fusion sur `main` qui touche `frontend/` lance la CI du frontend : contrôles, tests e2e, Lighthouse, puis publication de l'image `les-secrets-de-diani-frontend` (étiquette = 12 premiers caractères du commit) et `scripts/deploy-web.sh <tag>` sur le serveur :
1. téléchargement de l'image ;
2. remplacement de `web` puis de `web-2` (Traefik sert l'autre instance, sonde `/api/health`) ;
3. réchauffage du cache des pages : revalidation de tous les contenus sur chaque instance, puis visite des pages principales ;
4. test de fumée (`scripts/smoke-web.sh`) : pages, 404, espace membre protégé, CSP, HSTS ;
5. retour automatique à la version précédente en cas d'échec.

Le site ne touche ni à la base ni à l'API. Version en service : `.deploy/web-release.env`. Retour manuel : `./scripts/deploy-web.sh <tag précédent>`. Premier déploiement : l'API doit déjà tourner (les pages sont construites avec ses contenus ; à défaut, elles se réparent au réchauffage).

### Retour manuel à une version

```
cd /opt/diani && cat .deploy/release.env          # version en service
docker image ls ghcr.io/*/les-secrets-de-diani-backend   # versions disponibles (30 jours)
./scripts/deploy.sh <tag précédent>
```

Les migrations déjà appliquées restent en place (elles sont compatibles avec la version précédente, D-091). Une migration en échec s'arrête sans bascule : la version en service continue ; corriger, puis `npx prisma migrate resolve` depuis l'image `migrate` si besoin, ou restaurer la sauvegarde prise juste avant.

### Commandes ponctuelles en production

Toujours via `./scripts/compose-prod.sh` (ou les cibles `make …-prod`), qui ajoute `.env.production` et la version en service : par exemple `./scripts/compose-prod.sh logs -f --tail=100 api api-2`.

## Dimensionnement

Limites des conteneurs (docker-compose.prod.yml) : API 2 × (1,5 CPU, 768 Mo), site 2 × (1 CPU, 512 Mo), worker 1 CPU / 768 Mo, Postgres 1,5 CPU / 1,5 Go, Redis 0,5 CPU / 384 Mo, Traefik 0,5 CPU / 256 Mo, ClamAV facultatif 1 CPU / 1,5 Go. **VPS recommandé : 4 vCPU, 8 Go de RAM**, disque SSD 80 Go. Mesures de charge et limites connues : [load/README.md](../load/README.md).

## Sondes

| URL | Rôle | Attendu |
|---|---|---|
| `GET /health` | le processus répond (UptimeRobot, Docker) | 200 `{"status":"ok"}` |
| `GET /ready` | base de données et Redis joignables (Traefik, déploiement) | 200 ; 503 si une dépendance est en panne |
