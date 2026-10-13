# PROMPT — Frontend « Les Secrets de Diani » (de A à Z)

> À coller dans un agent de code (Claude Code, Cursor, etc.) sur un dépôt vide `frontend/`. : il sert de **référence visuelle et de contenu**. Travailler par phases, valider chacune avant la suivante.

---

## 0. Rôle et règles de travail

Tu es un ingénieur frontend senior (Next.js, accessibilité, performance, design éditorial). Tu transformes le prototype statique en **application Next.js de production**, branchée sur l'API NestJS du projet (`/api/v1`, OpenAPI fournie).

Règles :
1. TypeScript strict, ESLint + Prettier, zéro `any` injustifié.
2. Chaque phase se termine par : build sans erreur ni avertissement, tests verts, audit Lighthouse mobile, un court résumé.
3. Quand une décision n'est pas spécifiée, choisis l'option la plus simple et la plus sûre, note-la dans `docs/DECISIONS.md`.
4. Tous les textes visibles sont en **français**, en phrase normale (pas de majuscules décoratives), verbes d'action clairs (« Ajouter au panier », jamais « Valider » vague). Une action garde le même nom tout au long du parcours.
5. Les contenus (textes, prix, images, avis, FAQ, articles) viennent **de l'API** : rien de métier n'est écrit en dur dans les composants, sauf textes d'interface.

## 1. Positionnement et direction artistique (non négociable)

Marque ombrelle avec **trois univers** : Traiteur & commandes, Formations, Boutique / Kits. « La home présente. Les pages univers détaillent. » On ne mélange jamais produits traiteur, cours et kits dans une même grille.

- Style : sobre, chic, actuel, féminin, gourmand, accessible. Crème / nude / beige chaud / camel / brun doux. **Le noir ne domine jamais.** L'or reste un micro-accent (détails, filets), jamais en aplat ni pour du texte.
- **Le hero de l'accueil n'affiche pas le visage de Diani** : vidéo ou photo d'ambiance culinaire, titre fort, un seul CTA. Titre : « Bien plus qu'une cuisine, une histoire de partage. » ; sous-texte : « Traiteur, formations et boutique d'accessoires pour créer, apprendre et se faire plaisir. » ; CTA : « Découvrir nos univers ».
- Éviter l'effet « template IA » : pas de surenchère de cartes, de dégradés artificiels, de pictogrammes génériques, de textes décoratifs, ni d'animations gadgets.
- Photos grandes, chaudes, naturelles, d'une même température de couleur ; coins légèrement arrondis (14 px), ombres très douces ou absentes ; icônes au trait fin d'une même famille.
- Photos et gestes réels de Diani quand ils existent. Une photo de Diani est autorisée sur « À propos ».
- Aucun avis inventé : les avis traiteur viennent de l'API (modérés) ; aucun avis affiché pour formations/boutique au lancement.

## 2. Jetons de design (à reprendre tels quels du prototype)

```
--creme:#F9EEE8; --sable:#F0E2D9; --peche:#E9CDB8; --nude:#DAB6AA;
--terra:#9B6155; --terra-d:#82493F; --cacao:#5E2F1B; --texte:#5A504A;
--texte-s:#7A6B63; --or:#B8935A (décoratif seulement); --blanc:#FFFBF8;
Typo : Playfair Display (titres) · DM Sans (texte) · Allura (accent manuscrit rare)
Rayon 14 px · gouttière fluide clamp(18px,5vw,64px) · largeur max 1180 px
```

- Les définir comme **variables CSS** (et dans le thème Tailwind si utilisé). Un seul thème clair assumé ; `color-scheme: light` ; fond du `body` explicite.
- Polices via `next/font` (auto-hébergées, `display: swap`, sous-ensembles latin). Si le logo/les polices d'origine sont fournis, les substituer.
- **Contrastes WCAG AA vérifiés** : texte courant ≥ 4,5:1 (le texte `#5A504A` sur crème convient ; le blanc sur `#9B6155` ≈ 5,2:1 convient ; l'or ne porte jamais de texte).
- Texte courant ≥ 16 px sur mobile, interlignage ≥ 1,6, lignes ≤ 65 caractères.

## 3. Stack imposée

- **Next.js (App Router, dernière LTS)**, React, TypeScript.
- Styles : **CSS Modules ou Tailwind** (choisir un seul, justifier) avec les jetons ci-dessus ; pas de bibliothèque de composants lourde qui impose son look.
- Données : `fetch` côté serveur (Server Components) avec cache/revalidation ; **TanStack Query** pour les interactions client (panier, progression, quiz).
- Formulaires : React Hook Form + Zod (schémas partagés avec les messages d'erreur en français).
- Vidéo : lecteur HLS (hls.js) pour **Bunny Stream** avec URL signées fournies par l'API ; format vertical 9:16 sur mobile, adaptatif sur desktop.
- Paiement : redirection vers **Stripe Checkout** / **PayPal** (aucune saisie de carte dans notre code).
- Images : `next/image`, sources WebP/AVIF, `sizes` corrects, lazy loading, **placeholder flou**, `alt` utile sur toute image porteuse de sens.
- Tests : Vitest + Testing Library (composants), **Playwright** (parcours e2e), axe-core (accessibilité), Lighthouse CI.
- Analytics respectueux du RGPD (Plausible ou GA4 derrière consentement).

## 4. Architecture

```
app/
  (marketing)/ page.tsx            # Accueil
  traiteur/ page.tsx
  formations/ page.tsx
  boutique/ page.tsx  boutique/[slug]/page.tsx
  conseils/ page.tsx  conseils/[slug]/page.tsx
  a-propos/ contact/ faq/
  (legal)/ mentions-legales cgv confidentialite
  (auth)/ connexion inscription mot-de-passe-oublie reinitialiser verifier-email
  (membre)/ espace-membre/ page.tsx
            formations/[formation]/[lecon]/page.tsx
            certificat/[id]/ commandes/ profil/
  panier/ commande/succes commande/annule
  sitemap.ts robots.ts not-found.tsx error.tsx
components/ (ui, layout, home, catering, courses, shop, forms)
lib/ (api client typé généré depuis OpenAPI, auth, format, seo)
styles/ tokens.css
```

- **Client d'API typé généré depuis l'OpenAPI** du backend (pas de types écrits à la main).
- Rendu : pages publiques en **SSG/ISR** (revalidation à la modification admin via webhook de revalidation), pages membres en rendu dynamique protégé.
- Aucun secret côté client ; variables publiques préfixées `NEXT_PUBLIC_` seulement si nécessaires.

## 5. Navigation et gabarit

- **Header** sticky : logo (« Les Secrets de » + « Diani » manuscrit), navigation horizontale Traiteur · Formations · Boutique · Conseils · À propos · Contact, icônes compte et panier. **Le panier et l'espace membre n'apparaissent que s'ils servent** (badge de quantité, état connecté). Mobile : menu hamburger plein écran, court et priorisé, fermeture à Échap, piège de focus.
- **Footer** : navigation, réseaux (Instagram @diani_cuisto), inscription newsletter (double opt-in), liens légaux, lien « Gérer mes cookies ».
- Lien d'évitement « Aller au contenu », repères ARIA, `lang="fr"`.

## 6. Pages et comportements

**Accueil** (ordre imposé) : header → hero d'ambiance (vidéo courte muette en différé + image de remplacement ; jamais de portrait) → Univers 01 Traiteur → Univers 02 Formations → Univers 03 Boutique (grands bandeaux visuels, texte court, un bouton chacun, **aucun détail produit/prix**) → avis clients traiteur (3 à 6, carte ou slider accessible) → mot de Diani → réassurance (frais et de qualité · fait maison avec passion · paiement sécurisé · à votre écoute) → footer. Critère : les trois univers sont identifiables en moins de 5 secondes.

**Traiteur** : plateaux (composition + prix), à la carte, layer cakes (galerie, sélecteur de taille avec prix, parfums multiples), conditions de commande affichées clairement (acompte 10 € < 50 € / 20 € au-delà, validation après acompte, non remboursable, solde au retrait/livraison), avis, CTA final. **Chaque carte produit a un bouton « Contacter »** qui ouvre WhatsApp avec un message pré-rempli (numéro configuré côté API) ; bouton « Demande personnalisée » → formulaire (date, invités, message) envoyé à `POST /catering-requests`. Pas de paiement en ligne tant que le drapeau `cateringOnline` est faux ; le composant du parcours avancé (panier, créneau) est prévu mais masqué.

**Formations** : 3 packs (Essentiel 29,99 € / Intermédiaire 59,99 € / Premium 199,99 €, contenus listés), formations phares (crème au beurre, chantilly brésilienne, vendre sur les réseaux, organisation d'une commande, buffets & cocktails), exemple de leçon gratuit, fonctionnement de la plateforme. **Compte obligatoire** : « Choisir ce pack » → connexion/inscription puis paiement.

**Leçon (espace membre)** — priorité mobile : lecteur vidéo 9:16 visible dès le premier écran, reprise de lecture (position envoyée toutes ~15 s, débit limité), téléchargement de la fiche PDF (URL signée), bloc Conseils & astuces, **quiz** utilisable au pouce (réponses en grandes zones tactiles, correction fournie par l'API, retour explicite juste/faux), navigation précédent/suivant, progression enregistrée, accès refusé → invitation claire à acheter le pack. **Certificat** à la fin avec téléchargement.

**Espace membre** : mes formations (barres de progression, « Reprendre »), ressources, commandes, profil, adresses, export/suppression des données (RGPD), changement de mot de passe, sessions actives.

**Boutique** : liste des kits (Débutant 37,99 € / Expert 59,99 € / Pro Atelier 89,99 €), fiche kit avec composition, **tableau comparatif** défilable horizontalement sur mobile, FAQ, ajout au panier. **Compte facultatif.**

**Panier / commande** : quantités modifiables, **tous les montants viennent du serveur**, frais de livraison calculés, état de stock (« plus que 2 »), achat invité (e-mail + adresse), redirection Stripe/PayPal, pages succès/annulation, suivi de commande par lien signé.

**Conseils & astuces** : liste filtrable par catégorie, articles avec titres Hn corrects, table des matières, temps de lecture, articles liés, CTA vers une formation, données structurées.

**À propos, Contact** (formulaire court, honeypot, captcha discret, erreurs explicites, Instagram, WhatsApp), **FAQ** (accordéon natif accessible : livraison, paiement, accès formation, kits, retours, traiteur), **pages légales** rendues depuis l'API.

**États partout** : chargement (squelettes), vide (invitation à agir, pas d'excuse), erreur (cause + action de rattrapage, sans jargon), hors-ligne, 404 soignée, 500.

## 7. Animations et micro-interactions

Douces, brèves (150–400 ms), au service de l'action ; **tout est visible au repos** (pas de contenu caché en attente d'un défilement).
- Un moment mémorable : l'ouverture du hero (entrée échelonnée du titre, du sous-texte et du bouton ; scène d'ambiance discrète).
- Soulignement animé des liens, léger zoom des visuels au survol, confirmation « Ajouté au panier », barre de progression qui se remplit, ouverture fluide des accordéons.
- Respect de `prefers-reduced-motion` : animations désactivées, vidéo remplacée par l'image ; pas de vidéo si `saveData`.
- Pas de parallaxe lourde, de curseur custom, ni de carrousels auto-défilants.

## 8. Authentification côté client

- Jeton d'accès court en mémoire, **refresh en cookie HttpOnly** géré par l'API ; renouvellement transparent ; déconnexion multi-onglets synchronisée.
- Middleware Next.js : routes `(membre)` protégées, redirection vers `/connexion` avec retour à la page demandée.
- Aucun jeton dans `localStorage`. Messages d'erreur de connexion génériques.
- Protection CSRF respectée pour les actions sensibles ; en-têtes de sécurité (CSP stricte, HSTS, Referrer-Policy, Permissions-Policy) configurés dans `next.config`.

## 9. SEO

Titres et meta descriptions uniques par page, un seul `h1`, hiérarchie Hn correcte, URL propres, balises Open Graph/Twitter, `sitemap.xml` et `robots.txt` générés, données structurées JSON-LD (Organization, Product/Offer pour kits, Course pour formations, Article, FAQPage, Recipe si pertinent), balises canoniques, pages membres en `noindex`.

## 10. Performance (Core Web Vitals)

Objectifs mobile : **LCP < 2,5 s, INP < 200 ms, CLS < 0,1**, score Lighthouse ≥ 90 sur accueil, traiteur, formations, boutique.
- Pas de vidéo hero lourde : < 8 Mo, 720p, muette, chargée après le premier rendu, avec image de remplacement ; rien ne bloque l'affichage.
- Images dimensionnées (ratio réservé), `priority` uniquement pour l'image du hero, le reste en différé.
- JavaScript minimal : composants serveur par défaut, composants client seulement pour l'interactif ; découpage par route ; budget JS documenté.
- Polices : 2 familles utiles seulement, sous-ensemble, préchargement.
- Mise en cache : ISR, en-têtes `Cache-Control`, CDN Cloudflare.

## 11. Accessibilité (RGAA / WCAG 2.2 AA)

Navigation clavier complète, **focus visibles**, ordre logique, cibles tactiles ≥ 44 px, labels liés aux champs, erreurs de formulaire annoncées (`aria-live`) et décrites précisément, quiz et accordéons accessibles, lecteur vidéo avec commandes clavier et sous-titres, contrastes validés, aucun contenu uniquement par la couleur, textes alternatifs sur les images porteuses de sens (vides sur les décoratives). Tests axe en CI : zéro violation critique.

## 12. Conformité, mobile et responsive

- Mobile-first (TikTok/Instagram = portes d'entrée) ; breakpoints testés à 360, 390, 768, 1024, 1440 px ; aucun défilement horizontal de la page.
- CTA accessibles au pouce, formulaires courts, clavier adapté (`inputmode`, `autocomplete`).
- **RGPD** : bandeau de consentement cookies (refus aussi simple que l'acceptation) n'activant l'analytics qu'après accord, pages légales, double opt-in newsletter.

## 13. Qualité, CI/CD et livraison

- Tests : composants clés, **e2e Playwright** sur les parcours : (1) visiteur → demande traiteur / WhatsApp, (2) inscription → achat d'un pack → leçon → quiz → certificat, (3) invité → kit → panier → paiement (mode test), (4) navigation mobile au clavier.
- GitHub Actions : lint → types → tests → axe → build → Lighthouse CI → image Docker → déploiement (même VPS que l'API, derrière Traefik) ou Vercel si décidé.
- `.env.example`, `README.md`, `docs/DECISIONS.md`, guide de contribution, **Storybook facultatif** pour les composants du système de design.
- Livrable final : code, tests, workflows, rapport (ce qui est fait/reporté, scores Lighthouse, risques, variables à fournir : URL de l'API, clés publiques Stripe/PayPal, clé captcha, numéro WhatsApp, identifiants analytics).

## 14. Plan de réalisation

1. **Socle** : projet, tokens, polices, layout (header/footer/menu mobile), composants UI de base, client d'API généré, CI.
2. **Accueil + pages éditoriales** (À propos, Contact, FAQ, légales, Conseils) avec SEO.
3. **Traiteur** : catalogue, sélecteur layer cake, boutons Contacter/WhatsApp, demande personnalisée.
4. **Authentification** et espace membre (profil, RGPD).
5. **Boutique** : kits, comparatif, panier, commande invité/connecté, paiement.
6. **Formations** : packs, achat, lecteur, PDF, quiz, progression, certificat.
7. **Animations, états vides/erreur, accessibilité, SEO avancé.**
8. **Performance, tests e2e, Lighthouse, recette finale sur vrais téléphones.**

## 15. Critères d'acceptation

- Les trois univers sont identifiables en moins de 5 secondes sur l'accueil, **sans grille de produits** et **sans portrait de Diani** dans le hero.
- Le visuel reste crème / nude / brun, léger, sans noir dominant ni or omniprésent.
- Chaque page univers a son CTA et son parcours clair ; la leçon fonctionne parfaitement sur mobile.
- Prix, textes et images sont modifiables depuis l'administration et visibles sans redéploiement.
- Lighthouse mobile ≥ 90, Core Web Vitals dans les seuils, axe sans violation critique, aucun défilement horizontal.
- Tous les parcours e2e passent ; paiements testés de bout en bout en mode test.

**Commence par la Phase 1. À la fin de chaque phase, résume et attends ma validation avant de continuer.**
