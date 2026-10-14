# Journal des décisions — frontend

Décisions prises quand le cahier des charges ne tranchait pas : option la plus simple et la plus sûre (règle 3). Chaque entrée indique la phase où elle a été prise. Les numéros `D-Fxx` sont cités dans le code.

## Phase 1 — Socle

### D-F01 · Versions

**Choix :** Node 24 LTS, Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript 5.9, ESLint 10, Vitest 5, Playwright 1.64.
**Pourquoi :** dernières versions stables, alignées sur le backend (Node 24, TypeScript 5.9). TypeScript 7 (compilateur natif) est écarté pour la même raison qu'au backend (D-001) : outillage pas encore éprouvé.

### D-F02 · CSS Modules plutôt que Tailwind

**Choix :** CSS Modules + variables CSS globales (`styles/tokens.css`).
**Pourquoi :** le prototype est écrit en CSS classique avec ces jetons ; les reprendre tels quels est direct. Les styles restent lisibles par un intégrateur, sans classe utilitaire dans le JSX ni dépendance de build supplémentaire. Aucune bibliothèque de composants : les composants de `components/ui` portent seuls le style de la marque.

### D-F03 · Client d'API généré, copie versionnée de la spécification

**Choix :** `openapi-typescript` génère `lib/api/schema.d.ts` depuis `openapi/openapi.json` ; les appels passent par `openapi-fetch` (typé, ~6 ko).
**Pourquoi :** les deux dépôts sont indépendants (README racine). La spécification est copiée et versionnée ici (`npm run api:sync`), pour que le build ne dépende pas du dépôt voisin. La CI vérifie que le client généré correspond à la copie (`npm run api:check`).

### D-F04 · Rendu et revalidation

**Choix :** pages publiques statiques (ISR), chaque appel `fetch` serveur étiqueté (`lib/api/server.ts`). Le worker de l'API appelle `POST /api/revalidate` après une modification admin, avec un secret partagé comparé en temps constant. Revalidation de secours : cinq minutes (une heure en phase 1, raccourcie en phase 2, voir D-F12).
**Pourquoi :** contenu modifiable sans redéploiement (critère d'acceptation), pages servies depuis le cache (LCP), et pas de dépendance à l'API au moment de la visite.

### D-F05 · Politique de sécurité du contenu (CSP) — **validée : option 1 (2026-10-13)**

**Constat :** l'App Router de Next injecte la charge RSC dans des scripts en ligne (`self.__next_f.push(…)`). Avec `script-src 'self'` seul, ces scripts sont bloqués et l'hydratation échoue : menu mobile, bandeau cookies et tout composant client cessent de fonctionner en production. L'intégrité (SRI, activée) ne couvre pas ces scripts en ligne, et Next ne l'applique qu'aux scripts d'amorçage, pas aux morceaux propres à chaque route (vérifié avec Turbopack et webpack). `script-src 'self'` garantit en revanche qu'aucun fichier JS tiers ne peut être chargé.
**Options :**

1. `script-src 'self' 'unsafe-inline'` sur les pages publiques statiques + SRI, puis une CSP à nonce (via `proxy.ts`) sur les routes déjà dynamiques (membre, panier, commande) en phase 4. Garde l'ISR et les performances ; protège le mieux les pages où des données personnelles circulent.
2. CSP à nonce partout : la plus stricte, mais toutes les pages deviennent dynamiques (plus d'ISR, LCP et charge serveur dégradés, risque sur l'objectif Lighthouse ≥ 90).
3. CSP à empreintes (hash) calculées après le build : stricte et statique, mais outillage maison à maintenir à chaque version de Next.

**Recommandation :** option 1. Risque résiduel limité : React échappe tout le contenu, le seul `dangerouslySetInnerHTML` (JSON-LD) échappe `<`, le HTML riche de l'API est déjà assaini côté serveur, `object-src 'none'`, `base-uri 'self'` et `frame-ancestors 'none'` restent verrouillés.

**État :** option 1 validée le 2026-10-13. `script-src 'self' 'unsafe-inline'` (+ SRI) appliqué à toutes les pages dans `next.config.ts` ; la CSP à nonce des routes dynamiques (membre, panier, commande) est livrée en phase 4 (`proxy.ts`, `lib/csp.ts`).

### D-F06 · Polices

Playfair Display (titres, romain) et DM Sans (texte) auto-hébergées par `next/font`, sous-ensemble latin, `display: swap`, préchargées : ce sont les deux familles du premier écran. Ne sont pas préchargées : Playfair italique (citations des articles seulement) et Allura (logo). Sortir l'italique du préchargement a fait passer le LCP simulé de 3,0 s à 2,7 s. Allura reste sur le chemin critique pour le seul mot « Diani » : à remplacer par le logo vectoriel d'origine dès qu'il est fourni (gain attendu : ~27 ko et le LCP sous 2,5 s).

### D-F07 · Images de l'API servies telles quelles

L'API fournit déjà chaque image en AVIF et WebP à plusieurs largeurs, avec un aperçu flou (`blurDataUrl`). `ResponsiveImage` les sert via `<picture>` + `srcset`/`sizes`, ratio réservé (pas de CLS), `loading="lazy"` sauf l'image du hero. `next/image` les ré-optimiserait une seconde fois (CPU et stockage doublés, cache à invalider) sans gain. `next/image` reste disponible pour les images locales de `public/`.

### D-F08 · Consentement : stockage local, Plausible

Le choix cookies est gardé 6 mois dans `localStorage` (recommandation CNIL), puis redemandé. Ce n'est pas un jeton : la règle « aucun jeton dans `localStorage` » est respectée. Mesure d'audience Plausible, chargée seulement après « Accepter » ; « Refuser » a le même style et le même poids que « Accepter ». Sans `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, rien n'est chargé.

### D-F09 · Menu mobile en `<dialog>` natif

`showModal()` rend le reste de la page inerte (piège de focus natif), Échap ferme et le focus revient au bouton d'ouverture. Pas de bibliothèque ni de gestion de focus maison.

### D-F10 · Serveur autonome et port

`output: 'standalone'` pour une image Docker légère (même VPS que l'API, derrière Traefik). `next start` ne sert pas ce mode : `npm run start` lance `.next/standalone/server.js`, complété par `postbuild` (fichiers statiques et `public/`). Port 5173, celui déjà autorisé par le CORS de l'API en développement.

### D-F11 · Budget JavaScript

Composants serveur par défaut ; composants client uniquement pour l'interactif (menu, navigation courante, consentement, mesure d'audience). TanStack Query n'est monté que dans les zones interactives (panier, leçon), pas dans le gabarit racine. Lighthouse CI avertit au-delà de 180 ko de JS (compressé) sur l'accueil.

## Phase 2 — Accueil et pages éditoriales

### D-F12 · Contenu indisponible : page dégradée au build, dernière version gardée ensuite

**Constat :** l'image Docker se construit sans accès à l'API ; un build qui échoue faute d'API bloquerait tout déploiement.
**Choix :** `lib/api/content.ts` distingue deux moments. Pendant le build (`NEXT_PHASE`), une API injoignable donne `null` : la page s'affiche sans ce contenu (sections masquées, état d'erreur sur les pages qui n'ont que lui). À l'exécution, l'erreur remonte : Next garde alors la dernière version réussie de la page au lieu de la remplacer par une version dégradée. La revalidation de secours passe à **5 minutes** pour qu'une page construite sans API se répare seule rapidement ; le webhook de revalidation reste le chemin normal (immédiat). Coût : au plus une régénération par page et par tranche de 5 minutes, servie par le cache Redis de l'API.
Une page ou un article absent (404 de l'API) donne une vraie 404 ; une adresse mal formée n'est jamais transmise à l'API.

### D-F13 · Contenus de l'accueil dans l'API

L'image d'ambiance, les textes des trois univers et le mot de Diani sont des paramètres de l'administration (`GET /site/home`, backend D-096). Seuls les libellés d'interface (titres des univers, boutons, engagements de réassurance) sont dans le code. Sans image, un aplat de la palette remplace la photo (jamais un faux visuel ni un portrait). Sans avis publié, la section des avis est masquée (aucun avis inventé).

### D-F14 · Pages de l'API servies à la racine

`app/(pages)/[page]` sert toute page publiée de l'API à `/<slug>` (À propos, mentions légales, CGV, confidentialité, et toute page créée plus tard), comme le plan du site de l'API. Les pages connues au build sont statiques ; une nouvelle page est rendue à sa première visite puis mise en cache, sans redéploiement. Les routes fixes (`/contact`, `/faq`, `/conseils`…) ont priorité.

### D-F15 · Conseils : une adresse par catégorie, pagination à la demande

Le filtre par catégorie est fait de vrais liens (`/conseils/categorie/<slug>`) : pages statiques, indexables, sans paramètre d'URL qui rendrait la page dynamique. La première page d'articles (12) est rendue au build ; « Afficher plus d'articles » charge la suite depuis le navigateur, place le focus sur le premier article ajouté et annonce le nombre d'articles chargés. Une ancienne adresse d'article redirige définitivement (301) vers la nouvelle.

### D-F16 · Anti-robot Turnstile chargé à la demande

Formulaires de contact et de newsletter : champ piège (honeypot) + Cloudflare Turnstile en mode « interaction seulement » (invisible sauf doute). Le script n'est chargé qu'au premier focus dans un formulaire, jamais au chargement de la page ; la CSP n'autorise `challenges.cloudflare.com` (script et cadre) que si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` est définie. Pas de SRI possible sur ce script (Cloudflare le met à jour sans préavis) : l'origine est restreinte à la seule adresse de Cloudflare.

### D-F17 · Liens des e-mails : action au clic, jeton retiré de l'adresse

Les pages `/newsletter/confirmer` et `/newsletter/desinscription` (adresses envoyées par l'API) ne déclenchent rien au chargement : un bouton confirme l'action. Les robots qui ouvrent les liens des e-mails pour les analyser ne peuvent ainsi ni confirmer ni désinscrire à la place de la personne. Le jeton est retiré de la barre d'adresse dès sa lecture (historique, mesure d'audience). Pages non indexées.

### D-F18 · Budget JavaScript : rien de lourd dans le code commun

Le formulaire de newsletter est dans le pied de page de toutes les pages : il est écrit sans bibliothèque de formulaire (validation native, messages partagés dans `lib/form-messages.ts`). `lib/env.ts` valide les variables publiques sans Zod. React Hook Form et Zod ne sont chargés que sur la page Contact. Effet mesuré sur l'accueil : 227 → 185 ko de JavaScript compressé.

### D-F19 · Tests e2e sur une API factice

`tests/mock-api` sert des données typées par l'OpenAPI (le typage casse si le contrat change) et simule les réponses des formulaires (succès, erreur de champ, limite de débit, lien expiré). Port 3999, jamais 3000 (celui du vrai backend en local). Les parcours avec le vrai backend restent marqués `@api`.

**Lighthouse (mobile, simulation, poste de développement) en fin de phase 2 :** accessibilité, bonnes pratiques et SEO à 1 / 0,96 / 1 sur les quatre pages mesurées ; performance 0,83 à 0,90 ; CLS 0 ; LCP simulé ≈ 3,2 s (observé ≈ 0,5 s). L'objectif LCP < 2,5 s n'est **pas atteint** : sur ce poste, le premier affichage attend l'exécution du JavaScript de React et Next (hydratation ≈ 700 ms de script en simulation, ~120 ko compressés pour le seul cadre), que la simulation compte en entier. Travail prévu en phase 8 (performance) : mesure sur l'environnement de préproduction, retrait de la police manuscrite du chemin critique (logo vectoriel, D-F06), réduction du JavaScript hydraté.

## Phase 3 — Traiteur

### D-F20 · Choisir, contacter, demander : jamais de paiement

Chaque produit a un bouton « Contacter » qui ouvre WhatsApp (numéro réglé dans l'administration) avec un message reprenant le choix exact (taille, parfums). Le lien de l'API est réutilisé, seul le texte est remplacé, et seul un lien `https://wa.me` est accepté. Sans numéro configuré, « Contacter » mène au formulaire de demande. « Ajouter à ma demande » construit une sélection jointe à la demande personnalisée (`POST /catering-requests`) : quantités, parfums, estimation et acompte affichés à titre indicatif ; **aucun prix n'est envoyé**, l'API recalcule l'estimation et la renvoie dans l'accusé de réception (référence, lien WhatsApp avec la référence).

### D-F21 · Sélection gardée pour la session de l'onglet

La sélection est gardée dans `sessionStorage` (aucune donnée personnelle, aucun jeton) : elle survit à un rechargement ou à un détour par une autre page, et disparaît à la fermeture de l'onglet. Stockage indisponible : la sélection vit le temps de la page.

### D-F22 · Délai de préparation calculé dans le navigateur

La date minimale de l'événement dépend du jour et du délai réglé dans l'administration (`minNoticeDays`). La page étant générée à l'avance, cette date n'est calculée qu'après l'hydratation (sinon le HTML du build serait faux, et l'hydratation divergerait) ; l'API revérifie la date.

### D-F23 · Parcours de commande en ligne prêt mais masqué

Si l'administration ouvre la commande en ligne (`onlineOrdering`), le même formulaire demande un créneau (`GET /catering/slots`) et envoie une commande (`POST /catering/orders`). Fermée par défaut (`CATERING_ONLINE_ORDERING=false` côté API) : rien n'en apparaît.

## Phase 4 — Authentification et espace membre

### D-F24 · Session : jeton en mémoire, cookie de l'API, témoin sans secret

Le jeton d'accès (court) reste en mémoire dans le navigateur, jamais dans un stockage ; le jeton de renouvellement est le cookie HttpOnly de l'API (chemin `/api/v1/auth`, invisible du serveur Next comme du JavaScript). Au chargement, la session est restaurée par `POST /auth/refresh` (en-tête CSRF). Un témoin `diani_session=1` sur le domaine du site indique seulement qu'une session existe : il évite un appel inutile pour les visiteurs jamais connectés et permet au proxy de rediriger `/espace-membre` vers `/connexion?retour=…` sans attendre le JavaScript. Ce témoin n'est **pas** une preuve : chaque donnée de l'espace membre est demandée par le navigateur avec le jeton, l'API reste seule juge. L'adresse de retour n'accepte qu'un chemin interne (pas de redirection ouverte).

### D-F25 · Plusieurs onglets : renouvellement sérialisé et partagé

L'API révoque toute la session si un jeton de renouvellement sert deux fois (détection de vol). Deux onglets qui renouvellent en même temps se déconnecteraient donc mutuellement. Les renouvellements passent par un verrou du navigateur (Web Locks, `diani-auth-refresh`) ; le jeton obtenu est diffusé aux autres onglets (BroadcastChannel, en mémoire, même origine), qui n'ont plus à renouveler. Les appels simultanés d'un même onglet partagent le même renouvellement. La déconnexion (ou la perte de session) est diffusée de la même façon : tous les onglets quittent l'espace membre. Test e2e dédié (trois onglets restaurés en même temps).

### D-F26 · Requêtes authentifiées : un seul nouvel essai

`authedApi` ajoute le jeton, le renouvelle s'il expire dans moins de 30 secondes, et sur une réponse 401 renouvelle une fois puis réessaie ; au second refus, la session est close partout. Pas de boucle de renouvellement.

### D-F27 · Pages de compte et espace membre rendus à la demande

Connexion, inscription, liens reçus par e-mail et espace membre sont rendus à chaque requête (`connection()`), reçoivent la CSP à nonce du proxy (`script-src 'self' 'nonce-…' 'strict-dynamic'`, sans `'unsafe-inline'` pour les scripts) et `Cache-Control: private, no-store`. Les styles en ligne restent autorisés (attributs `style` de React, sans risque d'exécution). Jamais indexés.

### D-F28 · Second facteur de l'administration dans le formulaire de connexion

Si l'API demande le second facteur, la connexion enchaîne sur le code de l'application (ou un code de secours). À la première connexion d'un compte administrateur, la clé est affichée (texte et lien `otpauth://`, sans bibliothèque de QR code), puis les codes de secours, une seule fois, avant d'entrer.

### D-F29 · Liens reçus par e-mail

L'activation du compte se fait à l'ouverture du lien (elle prouve seulement l'accès à la boîte mail). Le changement d'adresse attend un clic (un robot qui ouvre les liens ne doit pas pouvoir le valider). Dans tous les cas, le jeton est retiré de la barre d'adresse dès sa lecture.

### D-F30 · Suppression du compte et export

L'export (`GET /me/export`) est téléchargé en fichier JSON. La suppression demande le mot de passe dans une fenêtre native (`<dialog>`), puis ferme la session dans tous les onglets ; l'API anonymise le compte et ne garde que les factures (obligation légale).
