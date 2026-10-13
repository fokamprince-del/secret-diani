-- CreateEnum
CREATE TYPE "catering_kind" AS ENUM ('platter', 'a_la_carte', 'layer_cake');

-- CreateEnum
CREATE TYPE "catering_request_status" AS ENUM ('new', 'contacted', 'deposit_received', 'confirmed', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "catering_fulfilment" AS ENUM ('pickup', 'delivery');

-- CreateEnum
CREATE TYPE "catering_request_source" AS ENUM ('form', 'online', 'admin');

-- CreateTable
CREATE TABLE "catering_categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "kind" "catering_kind" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catering_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "composition" JSONB NOT NULL DEFAULT '[]',
    "max_flavours" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "catering_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "servings_min" INTEGER,
    "servings_max" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catering_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_flavours" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catering_flavours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_product_flavours" (
    "product_id" UUID NOT NULL,
    "flavour_id" UUID NOT NULL,

    CONSTRAINT "catering_product_flavours_pkey" PRIMARY KEY ("product_id","flavour_id")
);

-- CreateTable
CREATE TABLE "catering_product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "alt" VARCHAR(300) NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catering_product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_requests" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "source" "catering_request_source" NOT NULL DEFAULT 'form',
    "status" "catering_request_status" NOT NULL DEFAULT 'new',
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "email" CITEXT NOT NULL,
    "phone" VARCHAR(20),
    "event_date" DATE NOT NULL,
    "guest_count" INTEGER,
    "fulfilment" "catering_fulfilment",
    "delivery_address" VARCHAR(300),
    "message" VARCHAR(3000),
    "estimated_total_cents" INTEGER,
    "agreed_total_cents" INTEGER,
    "deposit_cents" INTEGER,
    "deposit_received_at" TIMESTAMPTZ(3),
    "deposit_method" VARCHAR(50),
    "confirmed_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" VARCHAR(500),
    "internal_notes" VARCHAR(5000),
    "slot_id" UUID,
    "anonymized_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catering_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_request_items" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "product_name" VARCHAR(160) NOT NULL,
    "variant_label" VARCHAR(80) NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "flavours" VARCHAR(120)[] DEFAULT ARRAY[]::VARCHAR(120)[],
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catering_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_request_events" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "from_status" "catering_request_status",
    "to_status" "catering_request_status" NOT NULL,
    "actor_id" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catering_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catering_slots" (
    "id" UUID NOT NULL,
    "fulfilment" "catering_fulfilment" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catering_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catering_categories_slug_key" ON "catering_categories"("slug");

-- CreateIndex
CREATE INDEX "catering_categories_position_idx" ON "catering_categories"("position");

-- CreateIndex
CREATE UNIQUE INDEX "catering_products_slug_key" ON "catering_products"("slug");

-- CreateIndex
CREATE INDEX "catering_products_category_id_position_idx" ON "catering_products"("category_id", "position");

-- CreateIndex
CREATE INDEX "catering_products_deleted_at_idx" ON "catering_products"("deleted_at");

-- CreateIndex
CREATE INDEX "catering_variants_product_id_position_idx" ON "catering_variants"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "catering_flavours_slug_key" ON "catering_flavours"("slug");

-- CreateIndex
CREATE INDEX "catering_flavours_position_idx" ON "catering_flavours"("position");

-- CreateIndex
CREATE INDEX "catering_product_flavours_flavour_id_idx" ON "catering_product_flavours"("flavour_id");

-- CreateIndex
CREATE INDEX "catering_product_images_media_id_idx" ON "catering_product_images"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "catering_product_images_product_id_media_id_key" ON "catering_product_images"("product_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "catering_requests_number_key" ON "catering_requests"("number");

-- CreateIndex
CREATE INDEX "catering_requests_status_event_date_idx" ON "catering_requests"("status", "event_date");

-- CreateIndex
CREATE INDEX "catering_requests_email_idx" ON "catering_requests"("email");

-- CreateIndex
CREATE INDEX "catering_requests_event_date_idx" ON "catering_requests"("event_date");

-- CreateIndex
CREATE INDEX "catering_requests_slot_id_idx" ON "catering_requests"("slot_id");

-- CreateIndex
CREATE INDEX "catering_requests_updated_at_idx" ON "catering_requests"("updated_at");

-- CreateIndex
CREATE INDEX "catering_request_items_request_id_idx" ON "catering_request_items"("request_id");

-- CreateIndex
CREATE INDEX "catering_request_events_request_id_created_at_idx" ON "catering_request_events"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "catering_slots_fulfilment_starts_at_idx" ON "catering_slots"("fulfilment", "starts_at");

-- AddForeignKey
ALTER TABLE "catering_products" ADD CONSTRAINT "catering_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "catering_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_variants" ADD CONSTRAINT "catering_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catering_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_product_flavours" ADD CONSTRAINT "catering_product_flavours_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catering_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_product_flavours" ADD CONSTRAINT "catering_product_flavours_flavour_id_fkey" FOREIGN KEY ("flavour_id") REFERENCES "catering_flavours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_product_images" ADD CONSTRAINT "catering_product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "catering_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_product_images" ADD CONSTRAINT "catering_product_images_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_requests" ADD CONSTRAINT "catering_requests_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "catering_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_request_items" ADD CONSTRAINT "catering_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "catering_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_request_events" ADD CONSTRAINT "catering_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "catering_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes métier (non exprimables dans le schéma Prisma).
ALTER TABLE "catering_categories" ADD CONSTRAINT "catering_categories_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "catering_categories" ADD CONSTRAINT "catering_categories_position_chk" CHECK ("position" >= 0);
ALTER TABLE "catering_products" ADD CONSTRAINT "catering_products_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "catering_products" ADD CONSTRAINT "catering_products_position_chk" CHECK ("position" >= 0);
ALTER TABLE "catering_products" ADD CONSTRAINT "catering_products_max_flavours_chk" CHECK ("max_flavours" BETWEEN 0 AND 10);
ALTER TABLE "catering_flavours" ADD CONSTRAINT "catering_flavours_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "catering_flavours" ADD CONSTRAINT "catering_flavours_position_chk" CHECK ("position" >= 0);

-- Prix en centimes, jamais négatifs ; parts indicatives cohérentes.
ALTER TABLE "catering_variants" ADD CONSTRAINT "catering_variants_price_chk" CHECK ("price_cents" >= 0);
ALTER TABLE "catering_variants" ADD CONSTRAINT "catering_variants_servings_chk" CHECK (
  ("servings_min" IS NULL OR "servings_min" > 0)
  AND ("servings_max" IS NULL OR "servings_max" > 0)
  AND ("servings_min" IS NULL OR "servings_max" IS NULL OR "servings_min" <= "servings_max")
);
ALTER TABLE "catering_variants" ADD CONSTRAINT "catering_variants_position_chk" CHECK ("position" >= 0);
ALTER TABLE "catering_product_images" ADD CONSTRAINT "catering_product_images_position_chk" CHECK ("position" >= 0);

-- Demandes : montants positifs, acompte cohérent avec le statut.
ALTER TABLE "catering_requests" ADD CONSTRAINT "catering_requests_guest_count_chk" CHECK ("guest_count" IS NULL OR "guest_count" BETWEEN 1 AND 5000);
ALTER TABLE "catering_requests" ADD CONSTRAINT "catering_requests_amounts_chk" CHECK (
  ("estimated_total_cents" IS NULL OR "estimated_total_cents" >= 0)
  AND ("agreed_total_cents" IS NULL OR "agreed_total_cents" >= 0)
  AND ("deposit_cents" IS NULL OR "deposit_cents" >= 0)
);
-- Une commande n'est confirmée (ou livrée) qu'après réception de l'acompte.
ALTER TABLE "catering_requests" ADD CONSTRAINT "catering_requests_deposit_before_confirm_chk" CHECK (
  "status" NOT IN ('deposit_received', 'confirmed', 'delivered')
  OR ("deposit_received_at" IS NOT NULL AND "deposit_cents" IS NOT NULL AND "agreed_total_cents" IS NOT NULL)
);
ALTER TABLE "catering_requests" ADD CONSTRAINT "catering_requests_cancelled_chk" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "catering_requests" ADD CONSTRAINT "catering_requests_delivery_chk" CHECK ("delivery_address" IS NULL OR "fulfilment" = 'delivery');

ALTER TABLE "catering_request_items" ADD CONSTRAINT "catering_request_items_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 500);
ALTER TABLE "catering_request_items" ADD CONSTRAINT "catering_request_items_price_chk" CHECK ("unit_price_cents" >= 0);

ALTER TABLE "catering_slots" ADD CONSTRAINT "catering_slots_range_chk" CHECK ("ends_at" > "starts_at");
ALTER TABLE "catering_slots" ADD CONSTRAINT "catering_slots_capacity_chk" CHECK ("capacity" BETWEEN 1 AND 1000);
