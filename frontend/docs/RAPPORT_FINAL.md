# Rapport final — frontend « Les Secrets de Diani »

État au 14 octobre 2026, branche `develop`. Cahier des charges : [CAHIER_DES_CHARGES.md](CAHIER_DES_CHARGES.md). Décisions : [DECISIONS.md](DECISIONS.md) (D-F01 à D-F46).

## 1. En bref

- Les **8 phases** du plan sont livrées : socle, accueil et pages éditoriales, traiteur, comptes et espace membre, boutique et paiement, formations, expérience et SEO, performance et mise en production.
- **Tests** : 94 tests unitaires (Vitest, Testing Library, axe) et 182 tests de parcours (Playwright, mobile et ordinateur) sur une API factice typée par l'OpenAPI. Les quatre parcours du cahier des charges sont couverts : demande traiteur et WhatsApp, inscription → pack → leçon → quiz → certificat, achat invité d'un kit jusqu'au paiement, navigation mobile au clavier.
- **Accessibilité** : aucune violation axe grave ou critique (WCAG 2.2 AA) sur toutes les pages testées ; score Lighthouse accessibilité 1.
- **Mise en production** : image Docker, deux instances derrière le Traefik de l'API, déploiement progressif avec réchauffage du cache, test de fumée et retour arrière automatique (CI du frontend, sur `main`).
- **Reste à faire avant d'ouvrir** : recette sur vrais téléphones en préproduction ([RECETTE.md](RECETTE.md)), mesure de performance sur le serveur réel, contenus et photos de Diani.

## 2. Ce qui est fait

| Phase                           | Contenu                                                                                                                                                                                                             | Décisions     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1. Socle                        | Next.js 16 (App Router), CSS Modules et jetons de la marque, polices auto-hébergées, gabarit (en-tête, menu mobile `<dialog>`, pied de page), composants d'interface, client d'API généré, consentement cookies, CI | D-F01 → D-F11 |
| 2. Accueil et pages éditoriales | Accueil (hero, trois univers, avis, mot de Diani, réassurance), pages de l'API à la racine, FAQ, contact, newsletter en double opt-in, Conseils (catégories, pagination, articles), API factice                     | D-F12 → D-F19 |
| 3. Traiteur                     | Catalogue, tailles et parfums, « Contacter » WhatsApp pré-rempli, sélection jointe à la demande personnalisée, conditions et acompte                                                                                | D-F20 → D-F23 |
| 4. Comptes                      | Connexion (second facteur administrateur), inscription, mots de passe, sessions multi-onglets sûres, CSP à nonce des pages privées, espace membre (profil, adresses, sécurité, export et suppression)               | D-F24 → D-F30 |
| 5. Boutique                     | Kits, comparatif, panier serveur, commande invitée ou connectée, paiement Stripe / PayPal par redirection, suivi et factures                                                                                        | D-F31 → D-F34 |
| 6. Formations                   | Packs, fiches, leçon (vidéo HLS signée, reprise, fiches, conseils), quiz corrigé par l'API, achat de pack, progression, certificats vérifiables, avantages                                                          | D-F35 → D-F40 |
| 7. Expérience, SEO              | Animations sobres et mouvement réduit, états (chargement, vide, erreur, hors ligne), données structurées (fil d'Ariane, site), image de partage, cibles tactiles                                                    | D-F41 → D-F44 |
| 8. Performance, production      | CSS critique en ligne, cache de pages en mémoire revalidé sur chaque instance, déploiement continu, mesures Lighthouse, recette                                                                                     | D-F45 → D-F46 |

Côté API, quelques ajouts nécessaires au site ont été faits au passage (backend D-096 et D-097) : contenus de l'accueil modifiables, types OpenAPI corrigés (champs facultatifs, comparatif, sessions), revalidation de plusieurs instances du site.

## 3. Critères d'acceptation

| Critère                                                                                                   | État | Preuve                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| Trois univers identifiables, ordre de l'accueil respecté, aucun prix sur l'accueil                        | ✅   | `contenus.spec`                                                                                               |
| Contenus, prix, images, avis, FAQ venant de l'API (rien de métier en dur)                                 | ✅   | API factice ; libellés d'interface seulement dans le code                                                     |
| Traiteur : « Contacter » WhatsApp sur chaque produit, demande personnalisée, pas de paiement              | ✅   | `traiteur.spec`                                                                                               |
| Formations : compte obligatoire, accès **après** paiement confirmé, leçon, quiz, certificat               | ✅   | `formations.spec` (paiement annulé → aucun accès)                                                             |
| Boutique : compte facultatif, montants du serveur, stock, paiement hébergé, suivi                         | ✅   | `boutique.spec`                                                                                               |
| Jeton en mémoire, cookie HttpOnly, multi-onglets, routes membres protégées                                | ✅   | `compte.spec` (trois onglets simultanés)                                                                      |
| CSP, HSTS, Referrer-Policy, Permissions-Policy                                                            | ✅   | `socle.spec`, `compte.spec` ; CSP à nonce sur les pages privées                                               |
| WCAG 2.2 AA : clavier, focus, cibles 44 px, erreurs annoncées, contrastes                                 | ✅   | axe sur toutes les pages, `experience.spec`, `navigation-clavier.spec`                                        |
| SEO : titres uniques, un `h1`, canonique, sitemap, robots, JSON-LD, `noindex` des pages privées           | ✅   | `contenus.spec`, `experience.spec`                                                                            |
| RGPD : bandeau (refus aussi simple), mesure d'audience après accord, double opt-in, export et suppression | ✅   | `socle.spec`, `compte.spec`                                                                                   |
| Lighthouse mobile ≥ 90 et Core Web Vitals                                                                 | ⚠️   | §4 : LCP et CLS atteints en conditions réalistes ; score de performance sous 90 sur le poste de développement |
| Recette sur vrais téléphones                                                                              | ⏳   | [RECETTE.md](RECETTE.md), à faire en préproduction                                                            |

## 4. Performance mesurée

Lighthouse mobile (4G lente, processeur ralenti 4×), build de production, poste de développement (processeur portable de milieu de gamme, indice 1381), médiane de 3 passages, méthode `devtools` (D-F45) :

| Page       | Performance | Accessibilité | Bonnes pratiques | SEO | LCP   | TBT    | CLS |
| ---------- | ----------- | ------------- | ---------------- | --- | ----- | ------ | --- |
| Accueil    | 0,74        | 1             | 1                | 1   | 1,7 s | 1,19 s | 0   |
| Traiteur   | 0,71        | 1             | 1*               | 1   | 2,0 s | 1,53 s | 0   |
| Boutique   | 0,76        | 1             | 1                | 1   | 1,7 s | 1,02 s | 0   |
| Formations | 0,78        | 1             | 1                | 1   | 1,7 s | 0,89 s | 0   |
| Conseils   | 0,77        | 1             | 1                | 1   | 1,6 s | 0,99 s | 0   |
| Article    | 0,77        | 1             | 1                | 1   | 2,1 s | 0,82 s | 0   |
| Contact    | 0,71        | 1             | 1*               | 1   | 1,8 s | 1,87 s | 0   |

\* 0,96 lors de la mesure : Zod sondait `new Function()` au chargement (violation de CSP sans effet) ; corrigé ensuite (`jitless`), vérifié sans violation.

- **Atteint** : LCP < 2,5 s et CLS < 0,1 sur toutes les pages (bloquants en CI), accessibilité, bonnes pratiques et SEO à 1.
- **Non atteint sur ce poste** : score de performance ≥ 90. En cause, le temps de blocage (TBT 0,8 à 1,9 s) de l'hydratation de React et Next : environ 165 ko de JavaScript compressé pour le cadre, une vingtaine pour le site. Avertissement en CI, à confirmer sur la préproduction avec PageSpeed Insights puis sur les données réelles.
- Avec la méthode « simulate » par défaut, le LCP paraît à 3,3 s : artefact d'une mesure sur `localhost` (D-F45).
- JavaScript chargé : environ 190 ko compressés sur l'accueil (React et Next compris) ; React Hook Form, Zod et hls.js ne sont chargés que sur les pages qui en ont besoin.

## 5. Reporté ou hors périmètre

| Sujet                                  | Raison                                                              | Suite                                                           |
| -------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| Back-office (écrans d'administration)  | Hors du cahier des charges du site ; l'API d'administration existe  | Projet à part, ou outil d'administration générique en attendant |
| Vidéo d'ambiance du hero               | Aucune vidéo fournie ; l'image est la solution la plus légère (LCP) | Possible plus tard, chargée après le premier affichage          |
| Logo vectoriel                         | Non fourni : le mot « Diani » utilise la police Allura (≈ 27 ko)    | Remplacer par le SVG d'origine (D-F06)                          |
| Parcours `@api` contre le vrai backend | La CI utilise l'API factice                                         | À jouer en préproduction (recette)                              |
| Storybook                              | Facultatif au cahier des charges                                    | —                                                               |

## 6. Risques

| Risque                                                                                             | Gravité | Atténuation                                                                                                   |
| -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| Performance mobile sur téléphones d'entrée de gamme (temps de blocage dû à l'hydratation de React) | Moyenne | Mesurer en préproduction et sur données réelles ; pistes : moins de composants interactifs par page, logo SVG |
| Contenus absents au lancement (photos, textes) : pages en aplats                                   | Moyenne | Paramètres « Accueil » et médiathèque à remplir avant l'ouverture                                             |
| Clé Turnstile absente en production : formulaires refusés par l'API                                | Moyenne | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` dans les variables de build (§7)                                             |
| Variables publiques figées au build                                                                | Faible  | Une nouvelle image est nécessaire si un domaine change                                                        |
| Dépendance au webhook de revalidation                                                              | Faible  | Revalidation de secours toutes les 5 minutes ; réchauffage à chaque déploiement                               |

## 7. Variables à fournir

Build (variables GitHub de l'environnement `production`, figées dans le JavaScript) :

| Variable             | Obligatoire       | Rôle                                   |
| -------------------- | ----------------- | -------------------------------------- |
| `SITE_DOMAIN`        | oui               | domaine du site (sans `https://`)      |
| `API_DOMAIN`         | oui               | domaine de l'API                       |
| `MEDIA_URL`          | oui               | origine publique des médias (S3 / CDN) |
| `TURNSTILE_SITE_KEY` | oui en production | clé **publique** Cloudflare Turnstile  |
| `PLAUSIBLE_DOMAIN`   | non               | mesure d'audience (après consentement) |

Exécution (serveur, `.env.production`) : `SITE_DOMAIN`, `FRONTEND_REVALIDATE_SECRET` (partagé avec l'API), `FRONTEND_REVALIDATE_URL=http://web:5173/api/revalidate,http://web-2:5173/api/revalidate`. Le numéro WhatsApp, l'e-mail de contact, les réseaux sociaux, l'annonce, les textes et images de l'accueil se règlent dans l'administration, pas en variables. Aucune clé Stripe ou PayPal n'est nécessaire côté site (paiement par redirection).

## 8. Mise en production

Suivre la procédure de l'API ([../../backend/docs/RAPPORT_FINAL.md](../../backend/docs/RAPPORT_FINAL.md) §6), puis :

1. renseigner les variables du §7 (GitHub et serveur) ;
2. fusionner sur `main` : la CI du frontend publie l'image et lance `scripts/deploy-web.sh` ;
3. vérifier `https://<SITE_DOMAIN>/api/health`, puis dérouler la [recette](RECETTE.md) ;
4. déclarer le site dans la Search Console (plan du site : `/sitemap.xml`) ;
5. activer la surveillance (UptimeRobot sur `/api/health`).
