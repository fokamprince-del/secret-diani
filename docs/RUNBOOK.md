# Runbook d'exploitation

> Version phase 1 : sauvegarde et restauration. Le déploiement continu, le rollback automatique et la rotation des secrets seront complétés en phase 10.

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

## Sondes

| URL | Rôle | Attendu |
|---|---|---|
| `GET /health` | le processus répond (UptimeRobot, Docker) | 200 `{"status":"ok"}` |
| `GET /ready` | base de données et Redis joignables (Traefik, déploiement) | 200 ; 503 si une dépendance est en panne |
