#!/usr/bin/env bash
# Déploiement d'une version du site (Next.js), appelé par la CI du frontend depuis /opt/diani :
#   scripts/deploy-web.sh <tag d'image>
#
# 1. télécharge l'image du site ;
# 2. remplace les deux instances l'une après l'autre (Traefik sert l'autre : pas de coupure) ;
# 3. réchauffe le cache des pages : revalidation de tous les contenus sur chaque instance, puis
#    visite des pages principales (une page construite sans API se répare tout de suite) ;
# 4. test de fumée sur l'URL publique ;
# 5. en cas d'échec aux étapes 2 à 4 : retour automatique à la version précédente.
# Le site ne touche ni à la base ni à l'API : aucune sauvegarde ni migration ici.
set -euo pipefail

new_tag="${1:?Usage : deploy-web.sh <tag d image>}"
[[ "$new_tag" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || { echo "Tag invalide : $new_tag" >&2; exit 2; }

mkdir -p .deploy
release=.deploy/web-release.env
candidate=.deploy/web-candidate.env
previous_tag="$(sed -n 's/^WEB_IMAGE_TAG=//p' "$release" 2>/dev/null || true)"
printf 'WEB_IMAGE_TAG=%s\n' "$new_tag" > "$candidate"

site_domain="$(sed -n 's/^SITE_DOMAIN=//p' .env.production | tr -d '"' | tail -n 1)"
[[ -n "$site_domain" ]] || { echo "SITE_DOMAIN absent de .env.production" >&2; exit 2; }

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
with_release() { WEB_RELEASE_FILE="$1" ./scripts/compose-prod.sh --profile web "${@:2}"; }

# Toutes les étiquettes de cache du site (lib/api/server.ts) : tout est régénéré.
TAGS='{"tags":["articles","article-categories","pages","faq","reviews","media","catering","shop","courses","site","sitemap"]}'

warm_up() {
  local file="$1" service path
  for service in web web-2; do
    with_release "$file" exec -T "$service" sh -c \
      "wget -qO- --header \"Authorization: Bearer \$REVALIDATE_SECRET\" --header 'Content-Type: application/json' --post-data '$TAGS' http://127.0.0.1:5173/api/revalidate" \
      >/dev/null || return 1
    # Première visite : régénération en arrière-plan ; seconde : la page à jour est servie.
    for path in / /traiteur /formations /boutique /conseils /faq /sitemap.xml; do
      with_release "$file" exec -T "$service" wget -qO /dev/null "http://127.0.0.1:5173$path" || true
    done
  done
}

switch_to() {
  local file="$1" service
  for service in web web-2; do
    with_release "$file" up -d --no-deps --wait --wait-timeout 120 "$service" || return 1
    # Traefik réintègre l'instance (vérification toutes les 5 s) avant de passer à l'autre.
    sleep 6
  done
}

rollback() {
  if [[ -z "$previous_tag" ]]; then
    log "ÉCHEC du premier déploiement du site : rien vers quoi revenir. Journaux : ./scripts/compose-prod.sh --profile web logs web web-2"
    exit 1
  fi
  log "ÉCHEC : retour du site à la version $previous_tag"
  switch_to "$release" || log "Le retour arrière n'a pas abouti : intervention manuelle nécessaire."
  ./scripts/smoke-web.sh "https://$site_domain" || log "La version précédente échoue aussi : intervention manuelle nécessaire."
  exit 1
}

log "Site en service : ${previous_tag:-aucun} → nouvelle version : $new_tag"
log "Téléchargement de l'image"
with_release "$candidate" pull web

log "Remplacement progressif des deux instances"
switch_to "$candidate" || rollback

log "Réchauffage du cache des pages"
warm_up "$candidate" || rollback

log "Test de fumée"
./scripts/smoke-web.sh "https://$site_domain" || rollback

mv "$candidate" "$release"
log "Site en service : $new_tag"
