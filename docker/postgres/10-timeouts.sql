-- Exécuté une seule fois, à l'initialisation du volume Postgres.
-- Bornes de sécurité : aucune requête ni transaction oubliée ne peut bloquer la base.
-- (Une migration longue peut les relever localement avec SET LOCAL.)
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET statement_timeout = %L', current_database(), '15s');
  EXECUTE format('ALTER DATABASE %I SET idle_in_transaction_session_timeout = %L', current_database(), '30s');
  EXECUTE format('ALTER DATABASE %I SET lock_timeout = %L', current_database(), '10s');
END
$$;
