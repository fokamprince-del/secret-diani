-- Connexion avec Google : identifiant stable du compte Google (« sub » OpenID Connect).
ALTER TABLE "users" ADD COLUMN     "google_subject" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_subject_key" ON "users"("google_subject");

-- Un compte actif s'authentifie par mot de passe OU par Google (compte créé avec Google).
ALTER TABLE "users" DROP CONSTRAINT "users_active_has_password_chk";
ALTER TABLE "users" ADD CONSTRAINT "users_active_has_password_chk"
  CHECK ("status" = 'deleted' OR "password_hash" IS NOT NULL OR "google_subject" IS NOT NULL);
