# Contribuer

## Avant d'ouvrir une demande de fusion

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

La CI rejoue ces étapes, puis axe, Lighthouse CI (mobile, score ≥ 90) et le build de l'image Docker.

## Règles

- **Textes** : en français, en phrase normale (pas de majuscules décoratives). Verbes d'action précis (« Ajouter au panier », jamais « Valider »). Une action garde le même nom tout au long du parcours.
- **Contenus métier** (prix, textes, images, avis, FAQ, articles) : toujours depuis l'API, jamais en dur dans un composant.
- **Types** : TypeScript strict, pas de `any`. Les types de l'API viennent de `lib/api/schema.d.ts` (généré, ne pas modifier à la main : `npm run api:sync`).
- **Composants** : serveur par défaut ; `'use client'` seulement pour l'interactif.
- **Styles** : CSS Modules et jetons de `styles/tokens.css`. Pas de noir, l'or ne porte jamais de texte, rayon 14 px.
- **Accessibilité** : focus visible, cibles ≥ 44 px, libellés liés, erreurs annoncées. Tout nouveau composant d'interface a un test axe.
- **Mouvement** : 150 à 400 ms, contenu visible au repos, `prefers-reduced-motion` respecté.
- **Décisions** : un choix non prévu par le cahier des charges est noté dans `docs/DECISIONS.md`.

## Commits

Messages au format Conventional Commits, en français : `feat(traiteur): sélecteur de taille des layer cakes`.
