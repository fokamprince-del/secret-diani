# Tests de charge (k6)

Objectifs du cahier des charges (§7) : lecture des catalogues à **300 req/s avec p95 < 300 ms** ; inscription et paiement **sans erreur sous 50 req/s**.

| Script | Ce qu'il mesure | Seuils |
|---|---|---|
| `catalog.js` | Pages publiques les plus vues (paramètres du site, traiteur, boutique, formations, blog, FAQ, avis), pondérées | p95 < 300 ms, < 1 % d'échecs |
| `transactions.js` | Inscription (`ONLY=inscription`) et commande boutique : ajout au panier puis validation, stock réservé (`ONLY=commande`) | 0 échec, p95 < 1 s (inscription) et < 800 ms (commande) |

## Lancer

Contre un environnement **de préproduction**, jamais la production :

```bash
# Catalogue (300 req/s pendant 2 minutes par défaut)
k6 run -e BASE_URL=http://api-staging:3000 load/catalog.js

# Commande : variantes en stock (grand stock dédié au test) et tarif de livraison actif
k6 run -e BASE_URL=http://api-staging:3000 -e ONLY=commande \
  -e VARIANT_IDS=<id1,id2,…> -e SHIPPING_RATE_ID=<id> load/transactions.js

# Plusieurs instances sans répartiteur : BASE_URL=http://api:3000,http://api-2:3000
```

Variables : `RATE` (requêtes ou parcours par seconde), `DURATION` (ex. `1m`), `CAPTCHA_TOKEN`.

Préparer l'environnement de préproduction :
- k6 appelle l'API **directement** (pas à travers Cloudflare ni Traefik) avec `TRUST_PROXY_HOPS=1` : chaque itération envoie une adresse `X-Forwarded-For` différente (plage de test 198.18.0.0/15), sinon les limites de débit par IP refuseraient le test ;
- Turnstile : clé secrète de test « toujours valide » de Cloudflare (`1x0000000000000000000000000000000AA`) ;
- une ou plusieurs variantes avec un très grand stock (le test réserve une unité par commande), un tarif de livraison actif pour la France ;
- le paiement chez Stripe n'est pas sollicité : en mode test, Stripe limite à environ 25 requêtes/s. Le traitement des webhooks est couvert par les tests e2e (idempotence, rejeu).

## Résultats mesurés (2026-10-13)

Environnement : poste Windows 11, Docker Desktop (WSL2, 8 processeurs visibles). Image de production de l'API (`runtime`), limitée comme en production à **1,5 CPU et 768 Mo par instance**. Postgres 16 et Redis 7 sur le même réseau Docker ; k6 1.3.0 en conteneur **sur la même machine** (il prend lui aussi du CPU). Les chiffres d'un VPS dédié devraient être au moins aussi bons, mais **sont à confirmer en préproduction**.

| Scénario | Instances d'API | Débit obtenu | p95 | Échecs | Objectif |
|---|---|---|---|---|---|
| Catalogue, 2 min | 1 | 299 req/s | 12 à 14 ms | 0 / 35 900 | ✅ |
| Commande (ajout + validation), 5 variantes, 1 min | 1 | 35 parcours/s (70 req/s) | 5,0 s | 0 | ❌ CPU saturé |
| Commande, 5 variantes, 1 min | **2** | **50 parcours/s (100 req/s)** | **190 ms** | **0** | ✅ |
| Commande, 1 seule variante, 1 min (avant le cache des paramètres, D-092) | 1 | 30 parcours/s | 5,8 s | 0 | ❌ (verrou d'une seule ligne de stock) |
| Inscription, 1 min | 2 | 20 inscriptions/s | 27 s | 0 | ❌ Argon2id (voir D-094) |

Enseignements :
- les catalogues sont servis par le cache Redis : quelques millisecondes par requête, un seul processus suffit ;
- un parcours de commande fait une trentaine de requêtes SQL ; le processus Node est limité par le CPU (client Prisma). D'où **deux instances d'API en production** (D-093) ;
- toutes les commandes simultanées sur un même article se succèdent sur sa ligne de stock (garantie anti-survente) : un lancement de kit très demandé ralentit, sans jamais survendre ;
- l'inscription est bornée par le coût du hachage des mots de passe, réglé au minimum recommandé par l'OWASP. Les demandes au-delà patientent mais aboutissent toutes (0 échec).
