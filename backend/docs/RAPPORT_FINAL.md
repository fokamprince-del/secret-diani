# Rapport final — API « Les Secrets de Diani »

État au 13 octobre 2026, branche `develop`. Ce rapport couvre le **backend** ; le frontend fait l'objet de son propre suivi (il est à sa phase 1).

## 1. En bref

- Les 10 phases du cahier des charges sont livrées : socle, comptes, contenus et médias, traiteur, boutique, paiements, formations, e-mails / contact / newsletter, administration, durcissement et mise en production.
- **Tests** : 302 tests unitaires et environ 250 tests de bout en bout (application réelle, Postgres, Redis et stockage S3 éphémères), tous verts. Couverture ≥ 80 % exigée et vérifiée en CI sur l'authentification, les comptes, le RGPD, le traiteur, la boutique, les paiements, les droits d'accès aux formations, le contact, la newsletter, l'administration et les paramètres.
- **Exploitation** : images Docker minimales et scannées, déploiement continu avec sauvegarde, migrations, remplacement sans coupure, test de fumée et retour arrière automatique.
- **Il reste à faire avant d'ouvrir au public** : le frontend (boutique, espace client, back-office), la configuration des comptes externes (§5), une répétition complète sur un serveur de préproduction (§6).

## 2. Ce qui est fait

| Phase | Contenu principal | Décisions |
|---|---|---|
| 1. Socle | Configuration validée au démarrage, Docker, Postgres et Redis, Prisma, journaux sans données personnelles, sondes, format d'erreur unique, CI | D-001 → D-020 |
| 2. Comptes | Inscription, vérification de l'e-mail, sessions rotatives (cookie HttpOnly), mot de passe oublié, 2FA obligatoire pour l'administration, RBAC, export et suppression du compte | D-021 → D-040 |
| 3. Contenus et médias | Articles, pages, FAQ, avis, médiathèque (type réel vérifié, EXIF retiré, WebP/AVIF, antivirus facultatif), SEO (sitemap, JSON-LD), cache Redis et revalidation du frontend | — |
| 4. Traiteur | Catalogue (plateaux, layer cakes, parfums), demandes personnalisées, acompte 10 € / 20 € (seuil 50 €), créneaux, suivi en administration | D-041 → D-049 |
| 5. Boutique | Catalogue de kits, panier invité ou client, stock **sans survente** (réservation 15 min), livraison, factures numérotées sans trou et immuables, suivi par lien signé | D-050 → D-057 |
| 6. Paiements | Stripe Checkout et PayPal, webhooks signés et idempotents, remboursements, litiges, réconciliation quotidienne | D-058 → D-066 |
| 7. Formations | Packs inclusifs, accès **ouvert uniquement par le webhook de paiement**, vidéo signée (Bunny), reprise de lecture, quiz corrigés côté serveur, fiches PDF filigranées, certificats vérifiables | D-067 → D-076 |
| 8. E-mails, contact, newsletter | Formulaire de contact anti-spam, newsletter en double opt-in avec preuve du consentement, désinscription en un clic (RFC 8058) | D-077 → D-082 |
| 9. Administration | Paramètres du site sans déploiement (registre typé), gestion des comptes, tableau de bord, journal d'audit filtrable, rotation de clé outillée, guide d'administration | D-083 → D-090 |
| 10. Durcissement et charge | Déploiement continu avec retour arrière, deux instances d'API, Dependabot, shellcheck, tests de charge k6 mesurés | D-091 → D-095 |

## 3. Critères d'acceptation (cahier des charges §10)

| Critère | État | Preuve |
|---|---|---|
| Inscription → vérification → achat de pack → déblocage **uniquement après webhook** → leçon avec reprise → quiz → certificat | ✅ | `courses.e2e` (parcours complet, accès refusé tant que le webhook n'est pas reçu) |
| Invité achète un kit : stock sans survente, facture et e-mails, suivi par lien signé | ✅ | `shop.e2e`, `payments.e2e` (dernière unité disputée, facture, lien signé) |
| Demande traiteur → visible en administration → acompte (10 / 20 €) → confirmation | ✅ | `catering.e2e` (acompte enregistré par l'administration ; paiement en ligne de l'acompte : §4) |
| Diani modifie texte, prix ou image **sans développeur** | ✅ côté API | `admin.e2e`, `content.e2e` ; écrans du back-office : frontend à venir |
| Aucun test d'IDOR, d'injection, de force brute, de rejeu de webhook ou de survente n'aboutit | ✅ | tests e2e dédiés de chaque domaine (voir SECURITY.md, colonne « Preuves ») |
| Tests verts en CI ; déploiement et **restauration depuis sauvegarde** documentés | ✅ (restauration essayée en local) | RUNBOOK ; essai de restauration à refaire sur le serveur (§6) |
| Aucune donnée personnelle dans les journaux ; export et suppression de compte fonctionnels | ✅ | `account.e2e`, `foundation.e2e` |

Performance (§7), mesurée sur poste local en conditions proches de la production (load/README.md) :

| Objectif | Résultat |
|---|---|
| Catalogue 300 req/s, p95 < 300 ms | ✅ p95 ≈ 13 ms, 0 erreur |
| Commande sans erreur sous 50 req/s | ✅ avec deux instances d'API : 50 parcours/s (100 req/s), p95 190 ms, 0 erreur |
| Inscription sans erreur sous 50 req/s | ⚠️ 0 erreur, mais ≈ 20 inscriptions/s seulement : borné volontairement par le hachage des mots de passe (D-094) |

## 4. Reporté ou hors périmètre

| Sujet | Raison | Suite |
|---|---|---|
| **Frontend** (site public, espace client, back-office) | Projet séparé, à sa phase 1 | Le client typé se génère depuis `docs/openapi.json` |
| Paiement en ligne de l'acompte traiteur | Code prêt mais désactivé (`CATERING_ONLINE_ORDERING=false`, D-045) : l'acompte est encaissé hors ligne et saisi dans l'administration | Brancher sur les paiements de la phase 6 quand Diani le souhaite |
| Envoi intégré des newsletters | Export CSV vers un outil spécialisé (D-082) | Intégration possible plus tard sans changer le modèle |
| Clés d'accès (passkeys) | Facultatives au cahier des charges ; TOTP obligatoire pour l'administration (D-090) | Après la mise en ligne |
| Prometheus | Facultatif au cahier des charges ; Sentry et UptimeRobot suffisent au démarrage | Si le trafic le justifie |
| 50 inscriptions/s | Contraire au niveau de hachage recommandé (D-094) | Plus de processeurs ou file d'inscription si un besoin réel apparaît |

## 5. Risques

| Risque | Gravité | Atténuation |
|---|---|---|
| Déploiement progressif et retour arrière jamais exécutés sur un vrai serveur | Moyenne | Validés par shellcheck et `docker compose config` ; **répétition obligatoire en préproduction** (§6, étape 9) |
| Mesures de charge faites sur un poste de développement | Moyenne | Refaire `load/` en préproduction (mêmes scripts) |
| Migration incompatible avec la version précédente → retour arrière inefficace | Moyenne | Règle « expand / contract » (D-091) ; sauvegarde automatique avant chaque migration |
| Lancement d'un kit très demandé : commandes en file sur une même ligne de stock | Faible | Aucune survente possible ; temps de réponse dégradé pendant le pic (mesuré) |
| Comptes tiers mal configurés (Stripe, PayPal, Resend, Bunny, Turnstile) | Moyenne | L'application refuse de démarrer sans les clés obligatoires ; test de fumée ; paiements en mode test d'abord |
| Perte de la clé privée des sauvegardes (age) | Élevée | Conservée hors ligne par deux personnes (RUNBOOK › Sauvegardes) |
| Mentions légales des factures incomplètes | Moyenne (légal) | Paramètre « Mentions légales » à compléter avant la première vente (SIRET, adresse, mention TVA à confirmer avec un comptable) |
| Une seule personne administratrice | Moyenne | Créer un second administrateur (secours du 2FA, RUNBOOK) |

## 6. Procédure de mise en production

Pré-requis : VPS 4 vCPU / 8 Go (Ubuntu LTS, Docker et le plugin compose à jour), domaine sur Cloudflare (proxy activé), dépôt GitHub avec la CI verte sur `main`.

1. **Comptes externes** (§7) : créer les comptes et récupérer les clés ; Stripe et PayPal **en mode test** pour la répétition.
2. **Serveur** : utilisateur `deploy`, `/opt/diani`, `docker login ghcr.io` (lecture seule), pare-feu limité à 22 (IP connues) et 80/443 (IP Cloudflare). Voir RUNBOOK › Déploiement continu.
3. **Fichiers secrets** : `/opt/diani/.env.production` (chmod 600) et `/etc/diani/backup.env` ; secrets générés par `openssl rand` (jamais réutilisés d'un environnement à l'autre).
4. **Stockage** : buckets privé et public chez OVH (le public en lecture seule), règle de cycle de vie des sauvegardes (RUNBOOK).
5. **Resend** : domaine vérifié (SPF, DKIM, DMARC en `p=none`), test mail-tester ≥ 9/10.
6. **GitHub** : environnement `production` (secrets et variable `API_DOMAIN`), validation manuelle activée pour les premiers déploiements.
7. **Premier déploiement** : fusion sur `main` → la CI publie et déploie (premier démarrage de toute la pile). Puis `make seed-prod` (données de référence, idempotent), `make create-admin-prod` (deux administrateurs).
8. **Webhooks** : déclarer `https://<API_DOMAIN>/api/v1/payments/webhooks/stripe` et `…/paypal` chez les prestataires, faire un paiement test de bout en bout, un remboursement test.
9. **Répétitions** : un second déploiement (remplacement progressif sans coupure), un retour arrière manuel (`scripts/deploy.sh <tag précédent>`), une restauration de sauvegarde dans `diani_restore`, les tests de charge `load/` ; consigner les résultats dans le RUNBOOK.
10. **Contenus et réglages** (Diani, GUIDE_ADMIN) : mentions légales et vendeur des factures, conditions traiteur, prix, packs, formation pilote (remplacer la vidéo factice), pages légales, numéro WhatsApp.
11. **Bascule en production réelle** : clés Stripe et PayPal de production, DMARC en `p=quarantine` après 2 à 4 semaines, UptimeRobot sur `/health` et `/ready`, alertes Sentry.

## 7. Variables d'environnement à fournir

Toutes sont décrites dans `.env.example` ; l'application refuse de démarrer si une variable obligatoire manque ou est invalide.

| Variable | Obligatoire en production | Source |
|---|---|---|
| `PUBLIC_SITE_URL`, `CORS_ORIGINS` | oui (https) | domaine du site |
| `PUBLIC_API_URL` | conseillée | domaine de l'API (désinscription en un clic) |
| `DATABASE_URL`, `REDIS_URL` | posées par `docker-compose.prod.yml` | à partir de `POSTGRES_APP_PASSWORD`, `REDIS_PASSWORD` |
| `JWT_ACCESS_SECRET` | oui | `openssl rand -base64 48` |
| `FIELD_ENCRYPTION_KEY` | oui | `openssl rand -base64 32`, conservée aussi hors serveur |
| `TRUST_PROXY_HOPS` | oui (`1` derrière Traefik) | — |
| `MAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | oui (sauf `MAIL_REPLY_TO`) | Resend |
| `TURNSTILE_SECRET_KEY` | oui | Cloudflare › Turnstile (clé publique : frontend) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | au moins un prestataire | Stripe |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENVIRONMENT` | au moins un prestataire | PayPal Developer |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PRIVATE`, `S3_BUCKET_PUBLIC`, `MEDIA_PUBLIC_BASE_URL` | oui | OVH Object Storage |
| `BUNNY_STREAM_CDN_HOST`, `BUNNY_STREAM_TOKEN_KEY` | pour les vidéos | Bunny Stream |
| `FRONTEND_REVALIDATE_URL`, `FRONTEND_REVALIDATE_SECRET` | conseillées | partagées avec le frontend |
| `SENTRY_DSN` | conseillée | Sentry |
| `CLAMAV_HOST` (+ `COMPOSE_PROFILES=antivirus`) | conseillée | conteneur fourni |
| `TERMS_VERSION` | oui à chaque nouvelle version des CGV | — |

Pour `docker compose` (même fichier `.env.production`) : `GHCR_OWNER`, `API_DOMAIN`, `ACME_EMAIL`, `POSTGRES_PASSWORD`, `POSTGRES_APP_PASSWORD`, `REDIS_PASSWORD`. Sauvegardes (`/etc/diani/backup.env`) : `BACKUP_AGE_RECIPIENT`, `BACKUP_RCLONE_REMOTE`. GitHub (environnement `production`) : `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, variable `API_DOMAIN`.
