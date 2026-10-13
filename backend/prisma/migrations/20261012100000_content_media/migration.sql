-- Phase 3 — contenus éditoriaux et médias.

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('image', 'document');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('pending', 'processing', 'ready', 'rejected');

-- CreateEnum
CREATE TYPE "article_status" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "faq_category" AS ENUM ('general', 'traiteur', 'formations', 'boutique', 'livraison', 'paiement', 'retours');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "kind" "media_kind" NOT NULL,
    "status" "media_status" NOT NULL DEFAULT 'pending',
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100),
    "size_bytes" INTEGER,
    "sha256" CHAR(64),
    "storage_key" VARCHAR(255) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt" VARCHAR(300) NOT NULL DEFAULT '',
    "variants" JSONB NOT NULL DEFAULT '[]',
    "blur_data_url" VARCHAR(2000),
    "scan_result" VARCHAR(20),
    "rejection_reason" VARCHAR(300),
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "article_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "previous_slugs" VARCHAR(160)[] DEFAULT ARRAY[]::VARCHAR(160)[],
    "title" VARCHAR(200) NOT NULL,
    "excerpt" VARCHAR(500) NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "toc" JSONB NOT NULL DEFAULT '[]',
    "reading_minutes" INTEGER NOT NULL DEFAULT 1,
    "status" "article_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(3),
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(160),
    "cover_media_id" UUID,
    "cover_alt" VARCHAR(300) NOT NULL DEFAULT '',
    "category_id" UUID,
    "related_course_slug" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "static_pages" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "toc" JSONB NOT NULL DEFAULT '[]',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "static_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" UUID NOT NULL,
    "category" "faq_category" NOT NULL DEFAULT 'general',
    "question" VARCHAR(300) NOT NULL,
    "answer_markdown" TEXT NOT NULL,
    "answer_html" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "author_name" VARCHAR(80) NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "occasion" VARCHAR(120),
    "received_on" DATE NOT NULL,
    "source_note" VARCHAR(300) NOT NULL,
    "consent_confirmed" BOOLEAN NOT NULL,
    "status" "review_status" NOT NULL DEFAULT 'pending',
    "position" INTEGER NOT NULL DEFAULT 0,
    "moderated_by_id" UUID,
    "moderated_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_kind_status_created_at_idx" ON "media"("kind", "status", "created_at");

-- CreateIndex
CREATE INDEX "media_deleted_at_idx" ON "media"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "article_categories_slug_key" ON "article_categories"("slug");

-- CreateIndex
CREATE INDEX "article_categories_position_idx" ON "article_categories"("position");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- CreateIndex
CREATE INDEX "articles_status_published_at_idx" ON "articles"("status", "published_at");

-- CreateIndex
CREATE INDEX "articles_category_id_status_published_at_idx" ON "articles"("category_id", "status", "published_at");

-- CreateIndex
CREATE INDEX "articles_cover_media_id_idx" ON "articles"("cover_media_id");

-- CreateIndex
CREATE INDEX "articles_deleted_at_idx" ON "articles"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "static_pages_slug_key" ON "static_pages"("slug");

-- CreateIndex
CREATE INDEX "faqs_category_position_idx" ON "faqs"("category", "position");

-- CreateIndex
CREATE INDEX "reviews_status_position_idx" ON "reviews"("status", "position");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "article_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Contraintes métier (non exprimables dans le schéma Prisma).
ALTER TABLE "media" ADD CONSTRAINT "media_size_chk" CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0);
ALTER TABLE "media" ADD CONSTRAINT "media_dimensions_chk" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));
ALTER TABLE "media" ADD CONSTRAINT "media_rejection_chk" CHECK (("status" = 'rejected') = ("rejection_reason" IS NOT NULL));

ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "articles" ADD CONSTRAINT "articles_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "articles" ADD CONSTRAINT "articles_reading_minutes_chk" CHECK ("reading_minutes" >= 1);
-- Un article publié a toujours une date de publication (future = programmé).
ALTER TABLE "articles" ADD CONSTRAINT "articles_published_at_chk" CHECK ("status" = 'draft' OR "published_at" IS NOT NULL);
ALTER TABLE "static_pages" ADD CONSTRAINT "static_pages_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "faqs" ADD CONSTRAINT "faqs_position_chk" CHECK ("position" >= 0);

-- Avis : note de 1 à 5, consentement de la cliente obligatoire (aucun avis inventé).
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_chk" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_consent_chk" CHECK ("consent_confirmed");
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_position_chk" CHECK ("position" >= 0);

-- Recherche d'un article par ancien slug (redirection permanente).
CREATE INDEX "articles_previous_slugs_idx" ON "articles" USING GIN ("previous_slugs");
