#!/usr/bin/env sh
# docker compose de production, lancé depuis la racine du projet sur le serveur (/opt/diani) :
#   - configuration du serveur : .env.production (chmod 600, jamais commité) ;
#   - version en service : .deploy/release.env (IMAGE_TAG=…), écrit par scripts/deploy.sh ;
#   - version du site : .deploy/web-release.env (WEB_IMAGE_TAG=…), écrit par scripts/deploy-web.sh.
# Chaque fichier n'est passé que s'il existe : en local, COMPOSE_FILE=docker-compose.yml suffit.
set -eu

compose_file="${COMPOSE_FILE:-docker-compose.prod.yml}"
release_file="${RELEASE_FILE:-.deploy/release.env}"
web_release_file="${WEB_RELEASE_FILE:-.deploy/web-release.env}"

set -- -f "$compose_file" "$@"
if [ -f "$web_release_file" ]; then set -- --env-file "$web_release_file" "$@"; fi
if [ -f "$release_file" ]; then set -- --env-file "$release_file" "$@"; fi
if [ -f .env.production ]; then set -- --env-file .env.production "$@"; fi
exec docker compose "$@"
