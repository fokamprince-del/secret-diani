# Les Secrets de Diani

Site de la marque « Les Secrets de Diani » : traiteur, formations en ligne, boutique de kits et contenus éditoriaux.

| Dossier | Rôle | Cahier des charges |
|---|---|---|
| [backend/](backend/) | API NestJS (`/api/v1`), PostgreSQL, Redis, workers BullMQ | [backend/docs/CAHIER_DES_CHARGES.md](backend/docs/CAHIER_DES_CHARGES.md) |
| [frontend/](frontend/) | Application Next.js branchée sur l'API | [frontend/docs/CAHIER_DES_CHARGES.md](frontend/docs/CAHIER_DES_CHARGES.md) |

Les deux applications vivent dans ce même dépôt (monorepo) mais restent indépendantes : chacune a ses dépendances, ses commandes (`npm` à lancer dans son dossier) et sa CI (`.github/workflows/backend.yml`, `.github/workflows/frontend.yml`, déclenchées seulement quand leur dossier change). Le frontend consomme l'API via le client typé généré depuis `backend/docs/openapi.json` (`npm run api:sync` dans `frontend/`).

## Branches

| Branche | Rôle |
|---|---|
| `main` | Version stable : backend jusqu'à la phase 6 (paiements), frontend phase 1 |
| `develop` | Branche de travail : les nouvelles phases y sont intégrées avant de rejoindre `main` |

L'historique du backend (phases 1 à 6 et lots de l'audit) est conservé sous `backend/`.
