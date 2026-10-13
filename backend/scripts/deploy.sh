#!/usr/bin/env bash
# Déploiement d'une version sur le serveur, appelé par la CI (ou à la main) depuis /opt/diani :
#   scripts/deploy.sh <tag d'image>
#
# 1. télécharge les images de la version ;
# 2. sauvegarde chiffrée de la base (sauf premier déploiement) ;
# 3. applique les migrations (rôle propriétaire, conteneur dédié) ;
# 4. remplace les deux instances de l'API l'une après l'autre (Traefik sert l'autre pendant ce
#    temps : pas de coupure), puis le worker ; au premier déploiement, démarre toute la pile ;
# 5. test de fumée sur l'URL publique ;
# 6. en cas d'échec aux étapes 4-5 : retour automatique à la version précédente.
#
# Les migrations ne sont pas annulées par le retour arrière : elles doivent rester compatibles
# avec la version précédente (règle « expand / contract », docs/DECISIONS.md D-091).
set -euo pipefail

new_tag="${1:?Usage : deploy.sh <tag d image>}"
[[ "$new_tag" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || { echo "Tag invalide : $new_tag" >&2; exit 2; }

mkdir -p .deploy
release=.deploy/release.env
candidate=.deploy/candidate.env
previous_tag="$(sed -n 's/^IMAGE_TAG=//p' "$release" 2>/dev/null || true)"
printf 'IMAGE_TAG=%s\n' "$new_tag" > "$candidate"

api_domain="$(sed -n 's/^API_DOMAIN=//p' .env.production | tr -d '"' | tail -n 1)"
[[ -n "$api_domain" ]] || { echo "API_DOMAIN absent de .env.production" >&2; exit 2; }

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
with_release() { RELEASE_FILE="$1" ./scripts/compose-prod.sh "${@:2}"; }

log "Version en service : ${previous_tag:-aucune} → nouvelle version : $new_tag"

log "Téléchargement des images"
with_release "$candidate" --profile migrate pull api worker migrate

if [[ -n "$previous_tag" && "${SKIP_BACKUP:-0}" != "1" ]]; then
  log "Sauvegarde chiffrée avant migration"
  # shellcheck disable=SC1091 # fichier du serveur (voir RUNBOOK › Sauvegardes)
  (set -a && . /etc/diani/backup.env && set +a && RELEASE_FILE="$release" ./scripts/backup.sh)
fi

log "Migrations de la base"
with_release "$candidate" --profile migrate run --rm migrate

# Remplacement progressif : chaque instance doit redevenir « healthy », puis Traefik la
# réintègre (vérification toutes les 5 s) avant que la suivante ne redémarre.
switch_to() {
  local file="$1" service
  for service in api api-2 worker; do
    with_release "$file" up -d --no-deps --wait --wait-timeout 180 "$service" || return 1
    if [[ "$service" != worker ]]; then sleep 6; fi
  done
  # Autres services (Traefik, Postgres, Redis) : recréés seulement si leur configuration a changé.
  with_release "$file" up -d --wait --wait-timeout 180
}

rollback() {
  if [[ -z "$previous_tag" ]]; then
    log "ÉCHEC du premier déploiement : rien vers quoi revenir. Voir les journaux : ./scripts/compose-prod.sh logs api api-2 worker"
    exit 1
  fi
  log "ÉCHEC : retour à la version $previous_tag"
  switch_to "$release" || log "Le retour arrière n'a pas abouti : intervention manuelle nécessaire."
  ./scripts/smoke.sh "https://$api_domain" || log "La version précédente échoue aussi au test de fumée : intervention manuelle nécessaire."
  exit 1
}

if [[ -z "$previous_tag" ]]; then
  log "Premier déploiement : démarrage de toute la pile"
  with_release "$candidate" up -d --wait --wait-timeout 300 || rollback
else
  log "Remplacement progressif de l'API (deux instances) et du worker"
  switch_to "$candidate" || rollback
fi

log "Test de fumée"
./scripts/smoke.sh "https://$api_domain" || rollback

mv "$candidate" "$release"
log "Version $new_tag en service."
# Images de plus de 30 jours inutilisées : supprimées (les versions récentes restent pour un retour manuel).
docker image prune -af --filter "until=720h" > /dev/null || true
