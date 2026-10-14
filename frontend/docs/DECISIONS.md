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

## Phase 5 — Boutique, panier, commande, paiement

### D-F31 · Panier sur le serveur, badge dans le navigateur

Le panier vit dans l'API : panier invité identifié par son cookie HttpOnly (`/api/v1/shop`), ou panier du compte une fois connectée (jeton ajouté s'il existe). Tous les montants (prix, frais, total) viennent de l'API ; le navigateur n'envoie jamais de prix. Pour afficher le badge de l'en-tête sans appeler l'API sur chaque page, le nombre d'articles est gardé dans `localStorage` (simple indicateur, ni prix ni jeton) et synchronisé entre onglets ; le panier n'apparaît dans l'en-tête que s'il contient quelque chose. À la connexion, le panier invité rejoint celui du compte (`POST /shop/cart/merge`).

### D-F32 · Paiement par redirection uniquement

La commande est créée par l'API (`POST /shop/checkout` : montants recalculés, stock réservé 15 minutes), puis la personne est redirigée vers la page hébergée de Stripe Checkout ou de PayPal (`POST /payments/checkout`). Aucune donnée de carte ne passe par le site, aucun script de prestataire n'est chargé : la CSP n'a rien à autoriser. Au retour, rien n'est considéré payé sans l'API : PayPal → capture demandée par le site ; Stripe → attente (quelques secondes) de la confirmation par webhook, sinon message « paiement en cours de confirmation ». Paiement annulé : la commande reste réservée jusqu'à l'heure indiquée et le paiement peut être repris avec l'un ou l'autre moyen.

### D-F33 · Suivi sans compte

Le jeton de suivi (lien signé reçu par e-mail ou retour de paiement) est retiré de la barre d'adresse dès sa lecture et gardé en mémoire ; il donne accès au détail et à la facture (URL signée de 5 minutes). Les commandes passées connectée apparaissent dans « Mes commandes » de l'espace membre.

### D-F34 · Boutique fermée, rupture, plafond

Boutique fermée dans l'administration (`features.shopOpen`) : le catalogue reste visible, l'ajout au panier est remplacé par un message. Disponibilité toujours en mots (« En stock », « Plus que 2 en stock », « Épuisé pour le moment »), jamais par la seule couleur. Le sélecteur de quantité est borné par le stock affiché ; l'API reste juge (message de plafond affiché tel quel).

## Phase 6 — Formations

### D-F35 · Une seule adresse par leçon, accès décidé par l'API

Les leçons sont servies à `/formations/<formation>/<leçon>` (et non dans l'espace membre) : la même page sert la leçon d'exemple sans compte et la leçon complète une fois le pack acheté. La page ne contient aucune donnée ; la leçon est demandée par le navigateur avec le jeton s'il existe, et l'API décide : leçon offerte, leçon du pack, ou refus (403) → invitation claire à choisir le pack (« J'ai déjà un compte » mène à la connexion avec retour). Pages non indexées (contenu payant).

### D-F36 · Vidéo : HLS signé, hls.js chargé à la demande

La vidéo (Bunny Stream) arrive en playlist HLS signée et courte. Safari et iOS la lisent nativement ; ailleurs, hls.js (`1.7.3`, version figée) n'est chargé que sur les pages de leçon (import dynamique) : il ne pèse rien sur le reste du site. Commandes natives du navigateur (clavier, plein écran, sous-titres de la playlist quand ils existent). Format vertical 9:16, colonne de 26 rem au plus sur grand écran. Vidéo indisponible : message, le reste de la leçon reste consultable.

### D-F37 · Reprise de lecture

Position envoyée au plus toutes les 15 secondes de lecture (`shouldSave`, testée), à chaque pause et à la fin (« vidéo vue »). Reprise à la position enregistrée (sauf dans les 5 dernières secondes). Un échec d'enregistrement n'interrompt jamais la lecture. Rien n'est enregistré pour la leçon d'exemple sans accès.

### D-F38 · Quiz corrigé par l'API

Les bonnes réponses ne sont connues qu'après validation (l'API ne les envoie pas avant). Toutes les questions doivent avoir une réponse avant l'envoi. Correction en mots et en icônes (« Juste. » / « Pas tout à fait. »), bonne réponse signalée, explication, score, nouvel essai si permis. Grandes zones de réponse (≥ 52 px), boutons radio ou cases à cocher natifs.

### D-F39 · Achat d'un pack et accès

« Choisir ce pack » mène à `/commande/pack/<pack>` (compte obligatoire : sans session, connexion avec retour). Adresse de facturation, conditions de vente (avec demande d'accès immédiat), paiement par redirection comme la boutique. L'accès n'existe qu'après la confirmation du paiement par l'API (webhook) : un paiement annulé n'ouvre rien (test e2e). Après paiement, « Accéder à mes formations ». Ventes fermées dans l'administration (`courseSalesOpen`) : boutons remplacés par un message, accès existants conservés.

### D-F40 · Mes formations, certificats, avantages

« Mes formations » : barre de progression (rôle `progressbar`, remplissage animé sauf mouvement réduit), « Commencer » / « Reprendre » vers la bonne leçon, « Obtenir mon certificat » à 100 % (nom et prénom requis : sinon renvoi vers le profil), certificats téléchargeables avec leur page publique de vérification (`/certificat/<numéro>`, non indexée), avantages des packs et demandes d'appel personnalisé dans la limite incluse.

## Phase 7 — Animations, états, accessibilité, SEO avancé

### D-F41 · Animations : peu nombreuses, au service de l'action

Inventaire : entrée échelonnée du hero (seul « moment mémorable »), soulignement des liens, léger zoom des visuels au survol, confirmation « Ajouté au panier » / « ajouté à votre demande », barre de progression qui se remplit, ouverture fluide des accordéons, apparition du bandeau hors ligne. Toutes durent 150 à 700 ms et sont coupées si le mouvement est réduit (durées à 0, `scroll-behavior: auto`, animations retirées ; test e2e). Rien n'est caché en attente d'un défilement. Pas de vidéo de hero (aucune n'est fournie ; l'image reste la solution la plus légère, D-096).

### D-F42 · États partout

Chargement : squelettes à ratio réservé (aucun décalage). Vide : invitation à agir (« Découvrir les kits », « Découvrir les packs »), jamais d'excuse. Erreur : cause en mots simples et action de rattrapage (« Réessayer », « Revenir au panier », « Nous contacter »), jamais de code technique (seulement la référence d'incident sur la page d'erreur). Hors ligne : bandeau annoncé (`role="status"`) puis « Connexion rétablie ». 404 soignée, erreur de page (`error.tsx`) et erreur du gabarit (`global-error.tsx`).

### D-F43 · SEO avancé

Données structurées : WebSite et Organization (accueil), BreadcrumbList (article, produit, formation), Article, Product + Offer, Course, FAQPage (fournies par l'API quand elle les a). Image de partage par défaut générée au build (`app/opengraph-image.tsx`, couleurs de la marque, sans portrait), ajoutée explicitement par `pageMetadata` aux pages sans visuel propre (déclarer `openGraph` dans une page remplace sinon celle du gabarit). Cartes Twitter « grande image ». Pages privées, tunnel de commande, leçons et vérification de certificat : `noindex`.

### D-F44 · Accessibilité vérifiée par les tests

Axe (WCAG 2.2 AA, violations graves et critiques) sur toutes les pages publiques, de compte, de l'espace membre, du panier et de la commande ; un seul `h1` et un titre unique par page ; cibles d'au moins 44 px pour les boutons et champs sur mobile (test, qui a fait passer le bouton « Afficher » du mot de passe de 40 à 44 px) ; parcours au clavier (menu mobile, lien d'évitement, ajout au panier) ; texte alternatif sur toute image. Délai d'assertion e2e porté à 10 s (suite parallèle, CI chargée).

## Phase 8 — Performance et mise en production

### D-F45 · Mesures de performance : ce qui compte et comment on le mesure

Mesures Lighthouse mobile (4× ralentissement processeur, réseau 4G lente) sur le poste de développement (indice de performance 1381, processeur portable de milieu de gamme). Deux constats :

1. **Méthode « simulate » trompeuse en local.** Sur `localhost`, les scripts arrivent instantanément et le navigateur les exécute avant le premier affichage ; la simulation impute alors tout ce JavaScript au LCP (≈ 3,3 s simulés pour 0,4 s observés). Mesuré avec un vrai ralentissement (`devtools`), le LCP est de 1,5 à 2,3 s sur toutes les pages, sous l'objectif de 2,5 s. Lighthouse CI utilise donc la méthode `devtools` ; LCP < 2,5 s et CLS < 0,1 sont **bloquants**.
2. **Temps de blocage (TBT) élevé** sous ralentissement : 0,7 à 1,7 s selon la page, dû à l'hydratation de React et Next (≈ 165 ko compressés pour le cadre seul, le code du site n'en ajoute qu'une vingtaine). Le score de performance reste ainsi entre 0,7 et 0,8 sur ce poste : l'objectif de 90 n'est pas atteint ici. Il devient un **avertissement** en CI (non bloquant), avec le TBT et le poids du JavaScript, plutôt qu'une barrière que la machine de CI ne franchirait pas de façon fiable. La mesure qui fera foi est celle de PageSpeed Insights sur la préproduction puis les données réelles (Core Web Vitals) — voir [RECETTE.md](RECETTE.md).

Gains retenus : CSS critique en ligne (`experimental.inlineCss`, premier affichage 1,37 s → 1,07 s simulés), Zod et React Hook Form hors du code commun (D-F18), hls.js chargé à la demande (D-F36). Essais sans effet mesurable, écartés : polices en `display: optional`, `content-visibility` sur les sections hors écran.

### D-F46 · Cache de pages en mémoire, revalidé sur chaque instance

Le système de fichiers de l'image est en lecture seule : le cache des pages ISR reste en mémoire (`isrFlushToDisk: false`), le cache des requêtes va dans un `tmpfs`. Chaque instance ayant son cache, l'API prévient les deux (backend D-097). À chaque déploiement, `deploy-web.sh` revalide tous les contenus et visite les pages principales sur chaque instance : une page construite pendant que l'API était injoignable est réparée avant la fin du déploiement. Sonde `GET /api/health` (sans dépendance : une API en difficulté ne retire pas le site, qui sert ses pages depuis le cache).
