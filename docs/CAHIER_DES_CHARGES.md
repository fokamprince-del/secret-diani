# Cahier des charges — Backend « Les Secrets de Diani »

> Document de référence fourni par le porteur du projet. Travailler par phases, valider chaque phase (tests verts) avant de passer à la suivante.

---

## 0. Rôle et règles de travail

Ingénieur backend senior (NestJS, PostgreSQL, sécurité applicative). Construire **l'API complète** du site « Les Secrets de Diani », marque d'une cheffe/influenceuse (~50 000 abonnés, pics de trafic attendus à ~10 000 visiteurs lors d'annonces sur les réseaux).

Règles :
1. Code TypeScript strict (`strict: true`), aucun `any` injustifié, ESLint + Prettier.
2. Chaque phase se termine par : migrations appliquées, tests unitaires + e2e verts, documentation OpenAPI à jour, un court résumé de ce qui a été fait.
3. Pas de secret en dur. Toute configuration passe par variables d'environnement, validées au démarrage (Zod ou Joi) : l'application refuse de démarrer si une variable obligatoire manque.
4. Quand une décision n'est pas spécifiée, choisir l'option la plus sûre et la plus simple, puis la noter dans `docs/DECISIONS.md`.
5. Toutes les réponses d'erreur et tous les messages destinés à l'utilisateur sont en **français**, clairs et sans fuite d'information interne.
6. Langue du code : identifiants en anglais, messages et contenus en français.

## 1. Contexte métier

Trois univers sous une marque :
- **Traiteur & commandes** : plateaux, mini bouchées « à la carte », layer cakes. Le visiteur **ne paie pas en ligne** au départ : il voit les réalisations (photos, prix, tailles, parfums) et contacte Diani (bouton Contacter / WhatsApp) ; Diani crée ensuite la commande avec acompte manuel. Architecture évolutive pour activer plus tard un parcours avancé (panier, créneau, acompte en ligne).
- **Formations** : parcours vidéo avec PDF, conseils, quiz, progression, certificat. **Compte obligatoire.** Droits d'accès selon le pack acheté.
- **Boutique / Kits** : kits d'accessoires de pâtisserie, panier, paiement, stocks, frais de livraison, suivi de commande. **Compte facultatif** (achat invité possible).
- **Pages éditoriales** : Conseils & astuces (articles SEO), À propos, FAQ, Contact, pages légales — contenus modifiables par l'administratrice **sans développeur**.

Données de référence à charger en seed :
- Plateaux : *Plateau découverte* 40 € (5 mini burgers, 5 mini hot-dogs, 5 mini wraps, 5 mini pizzas) ; *Plateau mix gourmand* 42 € (5 mini pizzas, 5 nems, 5 mini samoussas, 5 beignets africains, 5 mini bricks).
- À la carte : mini burger x10 18 € ; mini hot-dog x10 16 € ; mini wrap x10 21 € ; mini samoussas x10 14 € ; pastels x12 15 €.
- Layer cakes : Bento 15 € ; 4–6 parts 35 € ; 6–8 parts 50 € ; 8–10 parts 60 € ; 10–15 parts 70 € ; 15–20 parts 80 € ; 20–25 parts 90 €. Parfums : mangue-passion, chocolat blanc, vanille, fraise, framboise, Kinder Bueno white, Kinder Bueno.
- Conditions traiteur : acompte 10 € si commande < 50 € ; 20 € si > 50 € ; commande validée seulement après réception de l'acompte ; acompte non remboursable en cas d'annulation client ; solde au retrait/livraison.
- Packs formation : Essentiel 29,99 € (crème au beurre, génoise, lissage, tips secrets) ; Intermédiaire 59,99 € (chantilly brésilienne, dégradé de couleurs, pâte hamburger, tips secrets, 2 fournisseurs offerts, 1 appel personnalisé) ; Premium 199,99 € (organisation buffet 200–300 personnes, vendre sur les réseaux, poche à douille, liste fournisseurs complète, tips secrets, 3 appels personnalisés, contenus des packs précédents).
- Kits : Débutant 37,99 € ; Expert 59,99 € ; Pro Atelier 89,99 € (prix indicatifs, modifiables en admin).
- Structure d'une leçon : vidéo (vertical 9:16 compatible desktop), fiche PDF, bloc conseils, quiz, progression, certificat de fin de parcours.

Les prix sont stockés **en centimes (entiers)**, devise EUR, jamais en flottant.

## 2. Stack imposée

- **NestJS** (Node LTS) + **TypeScript**, REST + OpenAPI (Swagger), préfixe `/api/v1`.
- **PostgreSQL 16** via **Prisma** (migrations versionnées) — ou TypeORM si justifié dans DECISIONS.md.
- **Redis** : cache, limitation de débit, files de jobs (BullMQ), blocage de jetons révoqués.
- **Docker / Docker Compose** (api, worker, postgres, redis, traefik). Image multi-étapes, utilisateur non-root, système de fichiers en lecture seule quand possible.
- **Stockage objets** compatible S3 (OVH Object Storage) pour images et PDF ; **Bunny Stream** pour les vidéos (URL signées à durée courte).
- **Paiements** : Stripe (Checkout + webhooks) et PayPal.
- **E-mails transactionnels** : Resend (templates HTML + texte, en français).
- **Observabilité** : Pino (logs JSON, sans donnée personnelle), Sentry, endpoint `/health` (liveness) et `/ready` (DB + Redis).
- **CI/CD** : GitHub Actions (lint, tests, audit des dépendances, build image → ghcr.io, déploiement SSH sur VPS, migration, rollback).
- Tests : Jest (unitaires), Supertest + base éphémère (e2e), couverture ≥ 80 % sur auth, paiements, droits d'accès.

## 3. Architecture des modules

Un module NestJS par domaine, couches `controller → service → repository`, DTO validés, aucune logique métier dans les contrôleurs.

```
src/
  main.ts  app.module.ts  config/
  common/ (guards, decorators, filters, interceptors, pipes, utils)
  auth/ users/ sessions/
  catalog-traiteur/ (plateaux, à la carte, layer cakes, parfums)
  catering-requests/ (demandes de commande traiteur)
  courses/ (formations, modules, leçons, ressources, quiz)
  enrollments/ (droits d'accès, packs)
  progress/ (progression, certificats)
  shop/ (produits, kits, stocks, panier, commandes, livraison)
  payments/ (Stripe, PayPal, webhooks, remboursements)
  content/ (articles, pages, FAQ, avis, médias)
  contact/ newsletter/
  mail/ storage/ video/
  admin/ (back-office API)
  audit/ rgpd/ jobs/
```

## 4. Modèle de données (PostgreSQL)

MLD (clés primaires UUID v7, `created_at`, `updated_at`, suppression logique `deleted_at` là où l'historique compte). Contraintes `NOT NULL`, `UNIQUE`, `CHECK` (prix ≥ 0, quantités ≥ 0, notes 1–5) et index sur toutes les clés étrangères et colonnes de recherche.

Entités principales :
- `utilisateur` (email unique insensible à la casse, hash du mot de passe, rôle `client|admin`, email_verifie, 2FA, statut, consentements horodatés)
- `session` / `refresh_token` (hash du jeton, famille de rotation, appareil, IP tronquée, expiration, révocation)
- `adresse` (livraison/facturation)
- `categorie_traiteur`, `produit_traiteur` (plateau / à la carte / layer cake), `variante_traiteur` (taille, prix), `parfum`, `produit_parfum`
- `demande_traiteur` (coordonnées, date souhaitée, nb invités, message, statut `nouvelle|contactee|acompte_recu|confirmee|livree|annulee`, acompte, solde)
- `pack_formation`, `formation`, `module`, `lecon`, `ressource` (PDF, fiche), `quiz`, `question_quiz`, `reponse_quiz`
- `donner_acces` (utilisateur ↔ pack/formation, source : achat/offert/admin, date d'expiration éventuelle)
- `progresser` (utilisateur ↔ leçon : position vidéo, terminée, score quiz, dates), `certificat` (numéro unique vérifiable)
- `produit_boutique`, `kit`, `composition_kit` (élément, quantité), `stock` (quantité, seuil d'alerte), `tarif_livraison`
- `panier`, `ligne_panier`, `commande`, `ligne_commande` (prix figé au moment de l'achat), `commander_kit`, `commander_pack`, `paiement`, `remboursement`
- `article` (slug, SEO, statut brouillon/publié/programmé), `page_statique`, `faq`, `avis` (traiteur uniquement, modération), `media`
- `contact_message`, `abonne_newsletter` (double opt-in), `audit_log`, `webhook_event` (idempotence)

Fournir : schéma Prisma, migrations, seeds (données de référence ci-dessus, 1 formation pilote complète : vidéo factice, PDF, conseils, quiz de 3 questions), compte admin créé via commande CLI sécurisée (jamais en seed avec mot de passe connu).

## 5. Fonctionnalités par domaine

### 5.1 Authentification et comptes
- Inscription (email + mot de passe), vérification d'e-mail par lien signé à usage unique, renvoi limité.
- Connexion, déconnexion, déconnexion de tous les appareils, mot de passe oublié/réinitialisation (jeton à usage unique, 30 min), changement de mot de passe (invalide les autres sessions).
- Mots de passe : **Argon2id** (paramètres OWASP), longueur ≥ 12, vérification contre mots de passe courants, jamais journalisés.
- **Access token JWT court (10–15 min)** + **refresh token opaque en cookie `HttpOnly; Secure; SameSite=Strict`**, **rotation à chaque usage**, détection de réutilisation (révocation de toute la famille).
- Messages de connexion identiques que le compte existe ou non ; délai constant (anti-énumération).
- Verrouillage progressif après échecs répétés (par compte et par IP), sans déni de service facile.
- **Admin : 2FA obligatoire (TOTP) + codes de secours**, option passkey (WebAuthn) ; sessions admin plus courtes.
- Profil : lecture, mise à jour, adresses, **export des données** et **suppression/anonymisation du compte** (RGPD) avec conservation légale des factures.
- RBAC : décorateurs `@Roles()`, garde globale « refus par défaut », routes publiques explicitement marquées `@Public()`.

### 5.2 Traiteur
- Endpoints publics : liste des plateaux, à la carte, layer cakes (tailles, prix, parfums, photos), conditions de commande, avis publiés, fiche détail.
- `POST /catering-requests` (public, anti-spam) : crée une demande + e-mail de confirmation au client + notification à Diani. Retourne un message WhatsApp pré-formaté optionnel.
- Admin : gestion complète du catalogue (CRUD, ordre, visibilité, photos), suivi des demandes (statuts, notes internes, acompte reçu → confirme), calcul automatique de l'acompte (10 € si total < 50 €, 20 € au-delà), génération d'un récapitulatif.
- Drapeau de configuration `CATERING_ONLINE_ORDERING=false` : le code du parcours avancé (panier traiteur, créneaux retrait/livraison, acompte en ligne) existe mais est désactivé.

### 5.3 Formations
- Catalogue public : packs, formations phares, contenu d'une leçon exemple gratuite.
- Achat d'un pack (compte requis) → paiement → création des droits d'accès **uniquement après confirmation du webhook signé**.
- Accès : un utilisateur ne voit une leçon que s'il possède le droit ; les packs supérieurs incluent les contenus des packs précédents (Premium ⊇ Intermédiaire ⊇ Essentiel).
- Lecture vidéo : l'API délivre une **URL signée à expiration courte** liée à l'utilisateur ; jamais d'URL de fichier permanente. Reprise de lecture (enregistrement de la position toutes les ~15 s, limité en débit).
- Ressources PDF : téléchargement via URL signée, filigrane optionnel avec le nom du client.
- Quiz : correction **côté serveur**, les bonnes réponses ne sont jamais envoyées avant validation ; tentatives illimitées ou limitées (configurable) ; score enregistré.
- Progression par leçon/module/formation en pourcentage ; **certificat PDF** généré à la fin (numéro unique, page publique de vérification), e-mail de fin de formation.
- Avantages des packs (appels personnalisés, fournisseurs offerts) : suivi du nombre d'appels restants et d'une demande de rendez-vous.
- Admin : créer/éditer formation, modules, leçons, ressources, quiz (endpoint de réordonnancement), publier/dépublier, accorder ou retirer un accès manuellement, statistiques (inscrits, taux de complétion).

### 5.4 Boutique
- Produits et kits avec variantes, composition détaillée, tableau comparatif (données structurées), images.
- Panier : invité (identifié par cookie signé) ou connecté ; fusion à la connexion ; recalcul **côté serveur** de tous les prix (le client n'envoie jamais un prix).
- Stocks : réservation temporaire à la création du paiement (15 min), décrément à la confirmation, libération si expiré ; **aucune survente** (transaction + verrouillage ou `SELECT … FOR UPDATE`) ; alerte de stock bas à l'admin.
- Livraison : tarifs par zone/poids, retrait possible, calcul au panier.
- Commande : numéro lisible unique, statuts `en_attente_paiement|payee|en_preparation|expediee|livree|annulee|remboursee`, historique des changements, suivi pour le client (invité via lien signé), numéro de suivi transporteur.
- Factures PDF numérotées sans trou (séquence dédiée), conservées 10 ans.
- Admin : gestion produits/kits/stocks/tarifs, liste et filtres des commandes, changement de statut (déclenche e-mails), remboursement total/partiel, export CSV.

### 5.5 Paiements
- **Stripe Checkout** et **PayPal** ; création de session côté serveur avec montants recalculés.
- **Webhooks** : vérification de signature, route avec corps brut, **idempotence** via table `webhook_event`, traitement asynchrone en file, relances en cas d'échec, journal.
- Cohérence : un paiement n'active des droits ou ne valide une commande qu'après événement confirmé ; gestion des états `echoue`, `abandonne`, `rembourse`, litiges.
- Aucune donnée de carte ne transite ni n'est stockée (PCI : redirection/hébergé par le prestataire).
- Réconciliation quotidienne (job) entre paiements prestataire et base.

### 5.6 Contenus éditoriaux et médias
- Articles : brouillon/publié/programmé, slug unique, titre/meta SEO, image de couverture avec texte alternatif, catégories, éditeur riche stocké en **JSON/Markdown assaini** (liste blanche de balises).
- Pages statiques (À propos, mentions légales, CGV, confidentialité), FAQ ordonnable, avis traiteur (saisie par admin, modération, **aucun avis inventé**).
- Médias : upload par URL pré-signée ou via l'API, validation du type réel (magic bytes), taille max, **renommage aléatoire**, analyse antivirus (ClamAV si disponible), variantes **WebP/AVIF** (srcset), suppression EXIF, jamais d'exécution possible.
- `sitemap.xml`, `robots.txt`, données structurées JSON-LD (Recipe/Product/Article/FAQ) exposées pour le frontend.

### 5.7 Contact et newsletter
- Formulaire de contact : validation, honeypot, limitation de débit, Turnstile/hCaptcha, e-mail à Diani + accusé de réception.
- Newsletter : **double opt-in**, désinscription en un clic (lien signé), export admin, preuve de consentement.

### 5.8 E-mails transactionnels (Resend, via file d'attente)
Vérification e-mail, bienvenue, réinitialisation de mot de passe, confirmation de paiement + accès aux formations, confirmation de commande boutique, expédition, demande traiteur reçue (client + admin), acompte reçu/commande confirmée, fin de formation + certificat, alerte stock bas (admin), alerte sécurité (nouvelle connexion admin). Templates versionnés, tests de rendu, liens signés, `List-Unsubscribe`, SPF/DKIM/DMARC documentés.

### 5.9 Administration (API back-office)
Tableau de bord (ventes, inscriptions, demandes traiteur en attente, stocks bas), CRUD de tout le contenu, gestion des utilisateurs (verrouiller, réinitialiser 2FA, accorder accès), journal d'audit, paramètres du site (prix, textes, activation de fonctionnalités), export des données. **Tout ce qui est texte, prix ou image doit être modifiable sans déploiement.**

## 6. Sécurité (exigences non négociables)

1. **Validation stricte** : `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, DTO partout, taille max des corps. Requêtes SQL uniquement paramétrées.
2. **Autorisation à chaque ressource** (anti-IDOR) ; tests e2e « A lit la donnée de B → 404/403 ».
3. `helmet`, CORS restreint (`credentials: true`), CSRF (SameSite=Strict + jeton routes sensibles), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CSP.
4. **Limitation de débit** (ThrottlerModule + Redis) par IP et par compte sur routes sensibles.
5. Secrets : gestionnaire sécurisé, rotation documentée, chiffrement des champs sensibles (secrets 2FA) avec clé hors base.
6. TLS 1.2+, Postgres/Redis non exposés (réseau Docker privé), sauvegardes **chiffrées** hors serveur, test de restauration documenté.
7. Logs sans données personnelles ni secrets, `audit_log` immuable.
8. Protection contre : énumération, brute force, rejeu de jetons, SSRF, injection de fichier, ReDoS, pollution de prototype, mass assignment, dépassement de taille, race conditions.
9. `npm audit`/Dependabot/Trivy en CI, image minimale, scan d'image.
10. Webhooks : signature, horodatage vérifié, idempotence.
11. **RGPD/CNIL** : registre des traitements, minimisation, durées de conservation + job de purge, consentements horodatés, droits d'accès/effacement/portabilité, `docs/INCIDENT.md` (notification sous 72 h).
12. `docs/SECURITY.md` : modèle STRIDE, checklist OWASP ASVS niveau 2 avec renvois vers les tests.

## 7. Performance et fiabilité (10 000 visiteurs)

- Pagination curseur, `select` explicite, pas de N+1.
- Cache Redis des catalogues publics (invalidation admin) + `Cache-Control`/`ETag` ; compatible Cloudflare.
- Pool de connexions dimensionné, index analysés, timeouts, arrêt gracieux.
- Tâches lourdes en **BullMQ** dans un conteneur `worker` séparé, relances exponentielles, file des échecs.
- k6 : 300 req/s lecture catalogue, p95 < 300 ms ; paiement/inscription sans erreur sous 50 req/s.
- Sauvegarde Postgres quotidienne + WAL optionnel, rétention 30 jours.

## 8. Déploiement et exploitation

- `docker-compose.yml` (dev) et `docker-compose.prod.yml` (Traefik + Let's Encrypt, réseaux séparés, healthchecks, limites, redémarrage auto).
- `.env.example` complet et commenté.
- GitHub Actions : lint → tests → audit → build/push ghcr.io → déploiement SSH → migrations → test de fumée → **rollback automatique**.
- `make dev`, `make test`, `make migrate`, `make backup`, `make restore`, `make create-admin`.
- Monitoring : UptimeRobot sur `/health`, Sentry, Prometheus optionnel.
- Docs : `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/INCIDENT.md`, `docs/RUNBOOK.md`, OpenAPI exportée, mini-guide admin.

## 9. Plan de réalisation

1. **Socle** : projet, config validée, Docker, Postgres/Redis, Prisma, logs, health, CI minimale, gestion d'erreurs.
2. **Auth & comptes**
3. **Contenus & médias**
4. **Traiteur**
5. **Boutique**
6. **Paiements**
7. **Formations**
8. **E-mails, contact, newsletter**
9. **Admin & audit**
10. **Durcissement & charge**

## 10. Critères d'acceptation

- Inscription → vérification → achat pack → déblocage **uniquement après webhook** → leçon avec reprise → quiz → certificat.
- Invité achète un kit : stock sans survente, facture et e-mails, suivi par lien signé.
- Demande traiteur → visible en admin → acompte (10/20 €) → confirmation.
- Diani modifie texte, prix ou image **sans développeur**.
- Aucun test d'IDOR, d'injection, de brute force, de rejeu de webhook ou de survente n'aboutit.
- Tests verts en CI, déploiement et **restauration depuis sauvegarde** documentés.
- Aucune donnée personnelle dans les logs ; export et suppression de compte fonctionnels.

## 11. Livrables

Dépôt Git propre (commits conventionnels), code, migrations, seeds, tests, Dockerfiles et compose, workflows CI/CD, OpenAPI, documentation (§8), et un **rapport final** : fait / reporté / risques / variables d'environnement à fournir / procédure de mise en production.

**Une phase à la fois ; résumé et validation à la fin de chaque phase.**
