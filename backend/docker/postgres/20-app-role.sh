#!/bin/sh
# Rôle de connexion de l'API et du worker (privilèges minimaux, voir la migration
# 20261013000000_app_role). Exécuté à l'initialisation d'un volume neuf, ou à la demande
# sur une base existante : `make db-app-role` (idempotent).
# Le mot de passe vient de POSTGRES_APP_PASSWORD ; il est transmis à psql comme variable
# (:'pw'), donc correctement échappé, et n'apparaît pas dans la liste des processus.
# Ni `exit` ni `set` : l'entrypoint de l'image Postgres peut sourcer ce fichier.

if [ -z "${POSTGRES_APP_PASSWORD:-}" ]; then
  echo "20-app-role : POSTGRES_APP_PASSWORD absent, rôle diani_app non configuré." >&2
else
  psql -v ON_ERROR_STOP=1 -v pw="$POSTGRES_APP_PASSWORD" \
    --username "${POSTGRES_USER:-postgres}" --dbname "${POSTGRES_DB:-postgres}" <<'SQL'
SELECT 'CREATE ROLE diani_app NOLOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'diani_app') \gexec
ALTER ROLE diani_app WITH LOGIN PASSWORD :'pw';
SQL
fi
