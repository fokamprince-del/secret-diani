# Les Secrets de Diani — commandes courantes.
# Sous Windows : utiliser Git Bash / WSL (make), ou lancer les commandes npm équivalentes.

COMPOSE_DEV  = docker compose -f docker-compose.yml
COMPOSE_TEST = docker compose -f docker-compose.test.yml
COMPOSE_PROD = docker compose -f docker-compose.prod.yml

.PHONY: help install dev infra-up infra-down migrate migrate-new seed lint typecheck test \
        test-unit test-e2e test-infra-up test-infra-down openapi build image \
        backup restore create-admin create-admin-prod

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install: ## Installe les dépendances et génère le client Prisma
	npm ci
	npx prisma generate

dev: infra-up ## Démarre Postgres + Redis, applique les migrations et lance l'API en rechargement à chaud
	npx prisma migrate deploy
	npm run start:dev

infra-up: ## Démarre Postgres et Redis de développement
	$(COMPOSE_DEV) up -d --wait postgres redis

infra-down: ## Arrête l'infrastructure de développement (les données sont conservées)
	$(COMPOSE_DEV) down

migrate: ## Applique les migrations versionnées (non destructif)
	npx prisma migrate deploy

migrate-new: ## Crée une nouvelle migration à partir du schéma : make migrate-new name=ajout_utilisateurs
	npx prisma migrate dev --name $(name)

seed: ## Charge les données de référence (idempotent)
	npx prisma db seed

lint: ## Lint + vérification du formatage
	npm run lint
	npm run format:check

typecheck: ## Vérification TypeScript stricte
	npm run typecheck

test: test-unit test-e2e ## Tous les tests (unitaires + e2e sur infrastructure éphémère)

test-unit: ## Tests unitaires avec couverture
	npm run test:cov

test-infra-up:
	$(COMPOSE_TEST) up -d --wait

test-infra-down:
	$(COMPOSE_TEST) down -v

test-e2e: test-infra-up ## Tests e2e (Postgres + Redis jetables)
	npm run test:e2e; status=$$?; $(COMPOSE_TEST) down -v; exit $$status

openapi: ## Exporte la spécification OpenAPI dans docs/openapi.json
	npm run openapi:export

build: ## Compile l'application
	npm run build

image: ## Construit l'image Docker de production
	docker build --target runtime -t diani-api:local .

backup: ## Sauvegarde chiffrée de la base (serveur de production)
	./scripts/backup.sh

restore: ## Restauration d'une sauvegarde : make restore file=backups/diani-AAAAMMJJ-HHMMSS.dump.age
	./scripts/restore.sh $(file)

create-admin: ## Crée un compte administrateur (saisie interactive, mot de passe masqué)
	npx ts-node --transpile-only src/cli/create-admin.ts

create-admin-prod: ## Production : crée un administrateur depuis le conteneur API (voir RUNBOOK)
	$(COMPOSE_PROD) --env-file .env.production run --rm -it api node dist/cli/create-admin.js
