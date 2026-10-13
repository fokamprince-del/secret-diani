-- CreateEnum
CREATE TYPE "course_status" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "access_source" AS ENUM ('purchase', 'gift', 'admin');

-- CreateEnum
CREATE TYPE "call_request_status" AS ENUM ('requested', 'scheduled', 'done', 'cancelled');

-- AlterEnum
ALTER TYPE "shipping_method" ADD VALUE 'digital';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "pack_id" UUID;

-- CreateTable
CREATE TABLE "course_packs" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "summary" VARCHAR(500),
    "price_cents" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "features" JSONB NOT NULL DEFAULT '[]',
    "calls_included" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "description_markdown" TEXT NOT NULL DEFAULT '',
    "description_html" TEXT NOT NULL DEFAULT '',
    "pack_id" UUID NOT NULL,
    "cover_media_id" UUID,
    "cover_alt" VARCHAR(300) NOT NULL DEFAULT '',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "course_status" NOT NULL DEFAULT 'draft',
    "position" INTEGER NOT NULL DEFAULT 0,
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_modules" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "course_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(500),
    "video_id" VARCHAR(100),
    "video_duration_seconds" INTEGER,
    "tips_markdown" TEXT NOT NULL DEFAULT '',
    "tips_html" TEXT NOT NULL DEFAULT '',
    "free_preview" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_resources" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "watermark" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lesson_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "pass_score_percent" INTEGER NOT NULL DEFAULT 70,
    "max_attempts" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "prompt" VARCHAR(500) NOT NULL,
    "explanation" VARCHAR(1000),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_choices" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quiz_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_accesses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "source" "access_source" NOT NULL,
    "order_id" UUID,
    "granted_by_id" UUID,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "position_seconds" INTEGER NOT NULL DEFAULT 0,
    "video_completed_at" TIMESTAMPTZ(3),
    "quiz_best_score" INTEGER,
    "quiz_passed_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "score_percent" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answers" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "holder_name" VARCHAR(200) NOT NULL,
    "course_title" VARCHAR(200) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "pdf_key" VARCHAR(255),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "call_request_status" NOT NULL DEFAULT 'requested',
    "message" VARCHAR(2000) NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3),
    "admin_note" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "call_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_packs_slug_key" ON "course_packs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "course_packs_rank_key" ON "course_packs"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "courses_slug_key" ON "courses"("slug");

-- CreateIndex
CREATE INDEX "courses_status_position_idx" ON "courses"("status", "position");

-- CreateIndex
CREATE INDEX "courses_pack_id_idx" ON "courses"("pack_id");

-- CreateIndex
CREATE INDEX "courses_cover_media_id_idx" ON "courses"("cover_media_id");

-- CreateIndex
CREATE INDEX "course_modules_course_id_position_idx" ON "course_modules"("course_id", "position");

-- CreateIndex
CREATE INDEX "lessons_module_id_position_idx" ON "lessons"("module_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_course_id_slug_key" ON "lessons"("course_id", "slug");

-- CreateIndex
CREATE INDEX "lesson_resources_lesson_id_position_idx" ON "lesson_resources"("lesson_id", "position");

-- CreateIndex
CREATE INDEX "lesson_resources_media_id_idx" ON "lesson_resources"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_lesson_id_key" ON "quizzes"("lesson_id");

-- CreateIndex
CREATE INDEX "quiz_questions_quiz_id_position_idx" ON "quiz_questions"("quiz_id", "position");

-- CreateIndex
CREATE INDEX "quiz_choices_question_id_position_idx" ON "quiz_choices"("question_id", "position");

-- CreateIndex
CREATE INDEX "course_accesses_user_id_revoked_at_idx" ON "course_accesses"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "course_accesses_pack_id_idx" ON "course_accesses"("pack_id");

-- CreateIndex
CREATE INDEX "course_accesses_order_id_idx" ON "course_accesses"("order_id");

-- CreateIndex
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_user_id_lesson_id_key" ON "lesson_progress"("user_id", "lesson_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_user_id_quiz_id_idx" ON "quiz_attempts"("user_id", "quiz_id");

-- CreateIndex
CREATE INDEX "quiz_attempts_quiz_id_idx" ON "quiz_attempts"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_number_key" ON "certificates"("number");

-- CreateIndex
CREATE INDEX "certificates_course_id_idx" ON "certificates"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_user_id_course_id_key" ON "certificates"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "call_requests_user_id_status_idx" ON "call_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "call_requests_status_created_at_idx" ON "call_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "course_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_choices" ADD CONSTRAINT "quiz_choices_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_accesses" ADD CONSTRAINT "course_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_accesses" ADD CONSTRAINT "course_accesses_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "course_packs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_requests" ADD CONSTRAINT "call_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes métier (non exprimables dans le schéma Prisma).
-- La valeur d'énumération « digital » vient d'être ajoutée : elle n'est pas encore utilisable
-- dans cette transaction, d'où les comparaisons sur le texte.

-- Commande numérique (pack de formation) : ni adresse de livraison ni tarif de livraison.
ALTER TABLE "orders" DROP CONSTRAINT "orders_shipping_address_chk";
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_address_chk" CHECK (
  "shipping_method"::text IN ('pickup', 'digital') OR "shipping_address" IS NOT NULL
);
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_method_chk" CHECK ("method"::text <> 'digital');
-- Une ligne de commande est soit un article (variante), soit un pack de formation.
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_kind_chk" CHECK (
  ("kind" = 'product' AND "variant_id" IS NOT NULL AND "pack_id" IS NULL)
  OR ("kind" = 'pack' AND "pack_id" IS NOT NULL AND "variant_id" IS NULL)
);

ALTER TABLE "course_packs" ADD CONSTRAINT "course_packs_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "course_packs" ADD CONSTRAINT "course_packs_values_chk" CHECK (
  "price_cents" >= 0 AND "rank" BETWEEN 1 AND 20 AND "calls_included" BETWEEN 0 AND 100
);
ALTER TABLE "courses" ADD CONSTRAINT "courses_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "courses" ADD CONSTRAINT "courses_position_chk" CHECK ("position" >= 0);
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_position_chk" CHECK ("position" >= 0);
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_values_chk" CHECK (
  "position" >= 0 AND ("video_duration_seconds" IS NULL OR "video_duration_seconds" > 0)
);
ALTER TABLE "lesson_resources" ADD CONSTRAINT "lesson_resources_position_chk" CHECK ("position" >= 0);
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_values_chk" CHECK (
  "pass_score_percent" BETWEEN 1 AND 100 AND ("max_attempts" IS NULL OR "max_attempts" >= 1)
);
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_position_chk" CHECK ("position" >= 0);
ALTER TABLE "quiz_choices" ADD CONSTRAINT "quiz_choices_position_chk" CHECK ("position" >= 0);
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_score_chk" CHECK ("score_percent" BETWEEN 0 AND 100);
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_position_chk" CHECK ("position_seconds" BETWEEN 0 AND 86400);
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_number_chk" CHECK ("number" ~ '^DIANI-[0-9]{4}-[0-9A-Z]{8}$');

-- Un seul accès actif par cliente et par pack (l'historique des accès révoqués est conservé).
CREATE UNIQUE INDEX "course_accesses_active_key" ON "course_accesses" ("user_id", "pack_id") WHERE "revoked_at" IS NULL;
