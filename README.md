# Les Secrets de Diani

Site de la marque « Les Secrets de Diani » : traiteur, formations en ligne, boutique de kits et contenus éditoriaux.

| Dossier | Rôle | Cahier des charges |
|---|---|---|
| [backend/](backend/) | API NestJS (`/api/v1`), PostgreSQL, Redis, workers BullMQ | [backend/docs/CAHIER_DES_CHARGES.md](backend/docs/CAHIER_DES_CHARGES.md) |
| [frontend/](frontend/) | Application Next.js branchée sur l'API | [frontend/docs/CAHIER_DES_CHARGES.md](frontend/docs/CAHIER_DES_CHARGES.md) |

Chaque dossier est un dépôt Git indépendant, avec sa propre CI et son propre cycle de livraison. Le frontend consomme l'API via le client typé généré depuis `backend/docs/openapi.json`.
