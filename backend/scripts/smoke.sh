#!/usr/bin/env sh
# Test de fumée d'un déploiement : l'API répond, ses dépendances sont prêtes, une route publique
# lit la base, et les en-têtes de sécurité sont présents.
#   Usage : scripts/smoke.sh https://api.lessecretsdediani.fr
set -eu

base="${1:?Usage : smoke.sh <url de l API>}"
base="${base%/}"
failures=0

check() {
  label="$1"; url="$2"; expected="$3"
  body="$(curl -sS --max-time 10 --retry 3 --retry-delay 2 --retry-all-errors -w '\n%{http_code}' "$url" || true)"
  code="$(printf '%s' "$body" | tail -n 1)"
  if [ "$code" = "$expected" ]; then
    echo "OK    $label ($code)"
  else
    echo "ÉCHEC $label : attendu $expected, reçu ${code:-aucune réponse}" >&2
    failures=$((failures + 1))
  fi
}

check "processus vivant" "$base/health" 200
check "base et Redis prêts" "$base/ready" 200
check "lecture publique (paramètres du site)" "$base/api/v1/site/settings" 200
check "route protégée refusée sans jeton" "$base/api/v1/me" 401

headers="$(curl -sS --max-time 10 -D - -o /dev/null "$base/health" || true)"
for header in x-content-type-options referrer-policy content-security-policy; do
  if printf '%s' "$headers" | grep -qi "^$header:"; then
    echo "OK    en-tête $header"
  else
    echo "ÉCHEC en-tête $header absent" >&2
    failures=$((failures + 1))
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "Test de fumée : $failures échec(s)." >&2
  exit 1
fi
echo "Test de fumée réussi."
