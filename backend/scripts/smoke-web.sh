#!/usr/bin/env sh
# Test de fumée du site : pages principales servies, espace membre protégé, plan du site, et
# en-têtes de sécurité (CSP statique sur les pages publiques, CSP à nonce sur les pages privées).
#   Usage : scripts/smoke-web.sh https://lessecretsdediani.fr
set -eu

base="${1:?Usage : smoke-web.sh <url du site>}"
base="${base%/}"
failures=0

status_of() {
  curl -sS --max-time 15 --retry 3 --retry-delay 2 --retry-all-errors -o /dev/null -w '%{http_code}' "$1" || true
}

check() {
  label="$1"; path="$2"; expected="$3"
  code="$(status_of "$base$path")"
  if [ "$code" = "$expected" ]; then
    echo "OK    $label ($code)"
  else
    echo "ÉCHEC $label : attendu $expected, reçu ${code:-aucune réponse}" >&2
    failures=$((failures + 1))
  fi
}

check "sonde du site" /api/health 200
check "accueil" / 200
check "traiteur" /traiteur 200
check "formations" /formations 200
check "boutique" /boutique 200
check "plan du site" /sitemap.xml 200
check "page inconnue" /page-qui-n-existe-pas 404
# Sans témoin de session, l'espace membre renvoie vers la connexion (proxy).
check "espace membre protégé" /espace-membre 307

has_header() {
  label="$1"; path="$2"; pattern="$3"
  if curl -sS --max-time 15 -D - -o /dev/null "$base$path" | grep -qiE "$pattern"; then
    echo "OK    $label"
  else
    echo "ÉCHEC $label" >&2
    failures=$((failures + 1))
  fi
}

has_header "CSP des pages publiques" / "^content-security-policy:.*frame-ancestors 'none'"
has_header "CSP à nonce sur la connexion" /connexion "^content-security-policy:.*'nonce-"
has_header "HSTS" / "^strict-transport-security:"
has_header "X-Content-Type-Options" / "^x-content-type-options: nosniff"

if [ "$failures" -gt 0 ]; then
  echo "Test de fumée du site : $failures échec(s)." >&2
  exit 1
fi
echo "Test de fumée du site réussi."
