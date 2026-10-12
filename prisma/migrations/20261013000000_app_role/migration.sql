-- Rôle applicatif à privilèges minimaux (audit de conformité, lot 2).
-- L'API et le worker se connectent avec `diani_app` : lecture et écriture des données
-- seulement. Ni DDL, ni TRUNCATE, ni propriété des tables : impossible de désactiver ou
-- de supprimer les déclencheurs du journal d'audit, même avec une injection SQL.
-- Les migrations restent exécutées par le rôle propriétaire du schéma.
-- Le mot de passe (attribut LOGIN) est posé par chaque environnement, jamais ici :
-- docker/postgres/20-app-role.sh (volume neuf) ou `make db-app-role` (voir RUNBOOK).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'diani_app') THEN
    CREATE ROLE diani_app NOLOGIN;
  END IF;
END
$$;

-- Personne d'autre que le propriétaire ne crée d'objets dans le schéma.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO diani_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO diani_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO diani_app;

-- Tables et séquences créées par les migrations futures (exécutées par ce même rôle propriétaire).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO diani_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO diani_app;

-- L'historique des migrations n'appartient qu'au rôle propriétaire.
REVOKE ALL ON TABLE _prisma_migrations FROM diani_app;
