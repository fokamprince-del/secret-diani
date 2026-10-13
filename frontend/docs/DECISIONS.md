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

**Choix :** pages publiques statiques (ISR), chaque appel `fetch` serveur étiqueté (`lib/api/server.ts`). Le worker de l'API appelle `POST /api/revalidate` après une modification admin, avec un secret partagé comparé en temps constant. Revalidation de secours : une heure.
**Pourquoi :** contenu modifiable sans redéploiement (critère d'acceptation), pages servies depuis le cache (LCP), et pas de dépendance à l'API au moment de la visite.

### D-F05 · Politique de sécurité du contenu (CSP) — **validée : option 1 (2026-10-13)**

**Constat :** l'App Router de Next injecte la charge RSC dans des scripts en ligne (`self.__next_f.push(…)`). Avec `script-src 'self'` seul, ces scripts sont bloqués et l'hydratation échoue : menu mobile, bandeau cookies et tout composant client cessent de fonctionner en production. L'intégrité (SRI, activée) ne couvre pas ces scripts en ligne, et Next ne l'applique qu'aux scripts d'amorçage, pas aux morceaux propres à chaque route (vérifié avec Turbopack et webpack). `script-src 'self'` garantit en revanche qu'aucun fichier JS tiers ne peut être chargé.
**Options :**

1. `script-src 'self' 'unsafe-inline'` sur les pages publiques statiques + SRI, puis une CSP à nonce (via `proxy.ts`) sur les routes déjà dynamiques (membre, panier, commande) en phase 4. Garde l'ISR et les performances ; protège le mieux les pages où des données personnelles circulent.
2. CSP à nonce partout : la plus stricte, mais toutes les pages deviennent dynamiques (plus d'ISR, LCP et charge serveur dégradés, risque sur l'objectif Lighthouse ≥ 90).
3. CSP à empreintes (hash) calculées après le build : stricte et statique, mais outillage maison à maintenir à chaque version de Next.

**Recommandation :** option 1. Risque résiduel limité : React échappe tout le contenu, le seul `dangerouslySetInnerHTML` (JSON-LD) échappe `<`, le HTML riche de l'API est déjà assaini côté serveur, `object-src 'none'`, `base-uri 'self'` et `frame-ancestors 'none'` restent verrouillés.

**État :** option 1 validée le 2026-10-13. `script-src 'self' 'unsafe-inline'` (+ SRI) appliqué à toutes les pages dans `next.config.ts` ; la CSP à nonce des routes dynamiques (membre, panier, commande) est à livrer avec la phase 4.

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
