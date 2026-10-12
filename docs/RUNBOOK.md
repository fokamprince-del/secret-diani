# Runbook d'exploitation

> Version phase 2 : sauvegarde et restauration, comptes administrateurs, rotation des secrets d'authentification. Le déploiement continu et le rollback automatique seront complétés en phase 10.

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
- Réappliquer les délais de sécurité sur la nouvelle base (`docker/postgres/10-timeouts.sql`), car `pg_dump` ne les sauvegarde pas.
- Supprimer la clé privée du serveur immédiatement après la restauration.

### Essai de restauration — journal

| Date | Environnement | Résultat |
|---|---|---|
| 2026-10-09 | Dev local (Docker) | Sauvegarde chiffrée (en-tête `age-encryption.org/v1`) puis restauration dans `diani_restore` : migrations présentes, donnée témoin retrouvée. |

À refaire chaque trimestre et après toute modification des scripts.

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
2. Si l'application d'authentification elle-même est perdue : un autre administrateur pourra réinitialiser le 2FA depuis le back-office (phase 9). D'ici là, en base : `UPDATE users SET totp_secret_enc = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE email = '…';` puis `DELETE FROM mfa_backup_codes WHERE user_id = '…';`. L'enrôlement est redemandé à la connexion suivante. Consigner l'intervention.

## Rotation des secrets

### `JWT_ACCESS_SECRET` (jetons d'accès)
1. Générer un nouveau secret : `openssl rand -base64 48`.
2. Dans `.env.production` : `JWT_ACCESS_SECRET_PREVIOUS=<ancien>` et `JWT_ACCESS_SECRET=<nouveau>`, puis redéployer. Les jetons en cours restent valides.
3. Après 15 minutes au moins (durée maximale d'un jeton d'accès), retirer `JWT_ACCESS_SECRET_PREVIOUS` et redéployer.

En cas de **compromission**, sauter l'étape de transition : tous les jetons d'accès deviennent invalides, et les utilisateurs les renouvellent de façon transparente avec leur cookie de session.

### `FIELD_ENCRYPTION_KEY` (secrets 2FA, codes de secours)
1. Générer une nouvelle clé : `openssl rand -base64 32`. La stocker hors serveur (gestionnaire de mots de passe), jamais avec les sauvegardes de la base.
2. `FIELD_ENCRYPTION_KEY_PREVIOUS=<ancienne>` et `FIELD_ENCRYPTION_KEY=<nouvelle>`, puis redéployer : les secrets existants restent lisibles.
3. Conserver `FIELD_ENCRYPTION_KEY_PREVIOUS` tant que des secrets TOTP chiffrés avec l'ancienne clé existent. Leur rechiffrement sera outillé en phase 9. Chaque administrateur remplace aussi ses codes de secours.

## Variables d'environnement ajoutées en phase 2

À ajouter dans `.env.production` (chmod 600) avant le déploiement : `JWT_ACCESS_SECRET`, `FIELD_ENCRYPTION_KEY`, `MAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `MAIL_FROM`, et éventuellement `MAIL_REPLY_TO` et `TERMS_VERSION`. Voir `.env.example`. L'API et le worker refusent de démarrer si l'une d'elles manque.

## Sondes

| URL | Rôle | Attendu |
|---|---|---|
| `GET /health` | le processus répond (UptimeRobot, Docker) | 200 `{"status":"ok"}` |
| `GET /ready` | base de données et Redis joignables (Traefik, déploiement) | 200 ; 503 si une dépendance est en panne |
