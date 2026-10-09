#!/usr/bin/env sh
# Sauvegarde PostgreSQL chiffrée, à exécuter sur le serveur (cron quotidien, voir docs/RUNBOOK.md).
#
#   - pg_dump au format personnalisé (restauration sélective possible) ;
#   - chiffrement asymétrique avec age : le serveur ne détient que la clé PUBLIQUE,
#     une compromission du serveur ne permet donc pas de lire les anciennes sauvegardes ;
#   - copie hors serveur (OVH Object Storage, via rclone) puis purge locale > 7 jours.
#     La rétention distante (30 jours) est gérée par une règle de cycle de vie du bucket.
#
# Variables requises : BACKUP_AGE_RECIPIENT (clé publique age), BACKUP_RCLONE_REMOTE (ex. ovh:diani-backups)
# Variables facultatives : COMPOSE_FILE (défaut docker-compose.prod.yml), BACKUP_DIR (défaut ./backups)
set -eu

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT manquant (clé publique age)}"
: "${BACKUP_RCLONE_REMOTE:?BACKUP_RCLONE_REMOTE manquant (destination hors serveur)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

command -v age >/dev/null || { echo "age n'est pas installé" >&2; exit 1; }
command -v rclone >/dev/null || { echo "rclone n'est pas installé" >&2; exit 1; }

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/diani-$stamp.dump.age"

echo "Sauvegarde de la base vers $target…"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$target"

# Une sauvegarde vide ou tronquée est une sauvegarde ratée.
size="$(wc -c < "$target")"
if [ "$size" -lt 1024 ]; then
  echo "Sauvegarde anormalement petite ($size octets) : échec." >&2
  exit 1
fi

rclone copy "$target" "$BACKUP_RCLONE_REMOTE/postgres/" --immutable
find "$BACKUP_DIR" -name 'diani-*.dump.age' -mtime +7 -delete

echo "Sauvegarde terminée et copiée hors serveur ($size octets)."
