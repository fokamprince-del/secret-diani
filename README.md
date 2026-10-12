# Les Secrets de Diani — API

API REST du site « Les Secrets de Diani » : traiteur, formations en ligne, boutique de kits et contenus éditoriaux.

**Stack :** NestJS 11 · TypeScript strict · PostgreSQL 16 (Prisma) · Redis 7 (cache, limitation de débit, files BullMQ) · Docker · Traefik.

> Cahier des charges : [docs/CAHIER_DES_CHARGES.md](docs/CAHIER_DES_CHARGES.md) · Décisions : [docs/DECISIONS.md](docs/DECISIONS.md) · Architecture : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Sécurité : [docs/SECURITY.md](docs/SECURITY.md) · RGPD : [docs/RGPD.md](docs/RGPD.md) · Exploitation : [docs/RUNBOOK.md](docs/RUNBOOK.md)

## Prérequis

- Node.js 24 LTS (`.nvmrc`)
- Docker et Docker Compose
- `make` (sous Windows : Git Bash ou WSL ; sinon, utiliser les commandes `npm` équivalentes)

## Démarrage rapide

```bash
cp .env.example .env      # puis renseigner les deux secrets ci-dessous
openssl rand -base64 48   # → JWT_ACCESS_SECRET
openssl rand -base64 32   # → FIELD_ENCRYPTION_KEY
make install              # dépendances + client Prisma
make dev                  # Postgres + Redis (Docker), migrations, API en rechargement à chaud
make create-admin         # premier compte administrateur (2FA configurée à la première connexion)
```

En développement, les e-mails ne partent pas : le worker (`npm run start:worker:dev`) les écrit dans `tmp/mails/`.

- API : http://localhost:3000/api/v1
- Documentation interactive : http://localhost:3000/api/docs (si `SWAGGER_ENABLED=true`)
- Sondes : http://localhost:3000/health, http://localhost:3000/ready

Pour lancer la pile complète en conteneurs (API, worker, migrations) :

```bash
docker compose --profile app up -d --build --wait
```

## Commandes

| Commande | Rôle |
|---|---|
| `make dev` | Infrastructure locale + API en rechargement à chaud |
| `make test` | Tests unitaires + e2e (Postgres et Redis jetables) |
| `make lint` / `make typecheck` | Qualité du code |
| `make migrate` | Applique les migrations (non destructif) |
| `make migrate-new name=…` | Crée une migration à partir du schéma Prisma |
| `make seed` | Données de référence (idempotent) |
| `make openapi` | Exporte la spécification dans `docs/openapi.json` |
| `make image` | Construit l'image de production |
| `make backup` / `make restore file=…` | Sauvegarde chiffrée / restauration (voir RUNBOOK) |
| `make create-admin` | Création sécurisée d'un administrateur (mot de passe saisi sans écho) |

## Configuration

Toutes les variables sont décrites dans [.env.example](.env.example). Elles sont validées au démarrage : l'application refuse de démarrer si une variable obligatoire manque ou est invalide, sans jamais afficher de valeur.

## Conventions

- Identifiants en anglais ; messages, erreurs et contenus en français.
- Montants en centimes (entiers), devise EUR.
- Erreurs au format unique `{ statusCode, code, message, errors?, requestId }`.
- Commits conventionnels (`feat:`, `fix:`, `chore:`, `docs:`, `test:`…).

## Avancement

| Phase | Contenu | État |
|---|---|---|
| 1 | Socle : configuration, Docker, Postgres/Redis, Prisma, journaux, sondes, CI, erreurs | ✅ |
| 2 | Authentification et comptes : inscription, e-mail, sessions rotatives, 2FA admin, RBAC, RGPD | ✅ (en attente de validation) |
| 3 | Contenus et médias | — |
| 4 | Traiteur | — |
| 5 | Boutique | — |
| 6 | Paiements | — |
| 7 | Formations | — |
| 8 | E-mails, contact, newsletter | — |
| 9 | Administration et audit | — |
| 10 | Durcissement, charge, mise en production | — |
