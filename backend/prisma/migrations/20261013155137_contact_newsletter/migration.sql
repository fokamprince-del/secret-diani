-- CreateEnum
CREATE TYPE "contact_subject" AS ENUM ('general', 'catering', 'courses', 'shop', 'partnership', 'other');

-- CreateEnum
CREATE TYPE "contact_status" AS ENUM ('new', 'read', 'answered', 'archived');

-- CreateEnum
CREATE TYPE "newsletter_status" AS ENUM ('pending', 'confirmed', 'unsubscribed');

-- CreateEnum
CREATE TYPE "newsletter_source" AS ENUM ('form', 'account');

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(20),
    "subject" "contact_subject" NOT NULL DEFAULT 'general',
    "message" VARCHAR(5000) NOT NULL,
    "status" "contact_status" NOT NULL DEFAULT 'new',
    "admin_note" VARCHAR(2000),
    "handled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "status" "newsletter_status" NOT NULL DEFAULT 'pending',
    "source" "newsletter_source" NOT NULL DEFAULT 'form',
    "consent_text" VARCHAR(500) NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "request_ip_truncated" VARCHAR(64),
    "confirm_token_hash" CHAR(64),
    "confirm_token_expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "confirm_ip_truncated" VARCHAR(64),
    "unsubscribed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "contact_messages_email_idx" ON "contact_messages"("email");

-- CreateIndex
CREATE INDEX "contact_messages_updated_at_idx" ON "contact_messages"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_confirm_token_hash_key" ON "newsletter_subscribers"("confirm_token_hash");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_confirmed_at_idx" ON "newsletter_subscribers"("status", "confirmed_at");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_updated_at_idx" ON "newsletter_subscribers"("updated_at");


-- Contraintes métier.
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_confirmed_chk" CHECK ("status" <> 'confirmed' OR "confirmed_at" IS NOT NULL);
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_unsubscribed_chk" CHECK ("status" <> 'unsubscribed' OR "unsubscribed_at" IS NOT NULL);
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_length_chk" CHECK (char_length("message") >= 10);
