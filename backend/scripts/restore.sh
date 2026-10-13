#!/usr/bin/env sh
# Restauration d'une sauvegarde chiffrée (voir docs/RUNBOOK.md, procédure et test de restauration).
#
#   ./scripts/restore.sh backups/diani-AAAAMMJJ-HHMMSS.dump.age
#
# La clé PRIVÉE age n'est jamais stockée sur le serveur : elle est fournie au moment
# de la restauration (BACKUP_AGE_IDENTITY = chemin d'un fichier temporaire, supprimé ensuite).
# Par sécurité, la restauration cible une base dédiée (RESTORE_DB, défaut diani_restore) ;
# la bascule vers la base de production est une décision manuelle documentée dans le RUNBOOK.
set -eu

file="${1:?Usage : restore.sh <fichier .dump.age>}"
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY manquant (fichier de clé privée age)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
RESTORE_DB="${RESTORE_DB:-diani_restore}"

[ -f "$file" ] || { echo "Fichier introuvable : $file" >&2; exit 1; }
command -v age >/dev/null || { echo "age n'est pas installé" >&2; exit 1; }

echo "Création de la base $RESTORE_DB…"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c "dropdb --if-exists -U \"\$POSTGRES_USER\" $RESTORE_DB && createdb -U \"\$POSTGRES_USER\" $RESTORE_DB"

echo "Restauration de $file dans $RESTORE_DB…"
age --decrypt --identity "$BACKUP_AGE_IDENTITY" "$file" \
  | docker compose -f "$COMPOSE_FILE" exec -T postgres \
      sh -c "pg_restore --no-owner --no-privileges --exit-on-error -U \"\$POSTGRES_USER\" -d $RESTORE_DB"

# La sauvegarde est faite sans droits (--no-privileges) : on réapplique ceux du rôle applicatif
# diani_app (sinon l'API n'a plus accès à rien après la bascule) et les délais de sécurité.
root="$(dirname "$0")/.."
for sql in "$root/prisma/migrations/20261013000000_app_role/migration.sql" \
           "$root/docker/postgres/10-timeouts.sql"; do
  echo "Application de $(basename "$(dirname "$sql")")/$(basename "$sql")…"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    sh -c "psql -v ON_ERROR_STOP=1 -q -U \"\$POSTGRES_USER\" -d $RESTORE_DB" < "$sql"
done

echo "Vérification : migrations présentes dans la base restaurée"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  sh -c "psql -U \"\$POSTGRES_USER\" -d $RESTORE_DB -c 'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;'"

echo "Restauration terminée dans $RESTORE_DB."
