-- CreateEnum
CREATE TYPE "shop_product_kind" AS ENUM ('kit', 'accessory');

-- CreateEnum
CREATE TYPE "stock_movement_reason" AS ENUM ('adjustment', 'sale', 'restock');

-- CreateEnum
CREATE TYPE "shipping_method" AS ENUM ('delivery', 'pickup');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "order_item_kind" AS ENUM ('product', 'pack');

-- CreateTable
CREATE TABLE "shop_products" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "kind" "shop_product_kind" NOT NULL,
    "short_description" VARCHAR(300),
    "description_markdown" TEXT NOT NULL DEFAULT '',
    "description_html" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(160),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "weight_grams" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_stocks" (
    "variant_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 3,
    "low_stock_alerted_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_stocks_pkey" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "shop_stock_movements" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "stock_movement_reason" NOT NULL,
    "order_id" UUID,
    "actor_id" UUID,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_kit_items" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "details" VARCHAR(300),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shop_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_product_images" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "alt" VARCHAR(300) NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shop_product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "method" "shipping_method" NOT NULL,
    "countries" CHAR(2)[] DEFAULT ARRAY[]::CHAR(2)[],
    "min_weight_grams" INTEGER NOT NULL DEFAULT 0,
    "max_weight_grams" INTEGER,
    "price_cents" INTEGER NOT NULL,
    "free_from_cents" INTEGER,
    "delay" VARCHAR(80),
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_carts" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "guest_token_hash" CHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'pending_payment',
    "user_id" UUID,
    "email" CITEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "shipping_method" "shipping_method" NOT NULL,
    "shipping_rate_name" VARCHAR(120) NOT NULL,
    "shipping_address" JSONB,
    "billing_address" JSONB NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "shipping_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "refunded_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "carrier" VARCHAR(60),
    "tracking_number" VARCHAR(100),
    "customer_note" VARCHAR(1000),
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "terms_version" VARCHAR(20) NOT NULL,
    "cart_id" UUID,
    "reservation_expires_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "shipped_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "kind" "order_item_kind" NOT NULL DEFAULT 'product',
    "variant_id" UUID,
    "sku" VARCHAR(64),
    "product_name" VARCHAR(160) NOT NULL,
    "variant_label" VARCHAR(80) NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "weight_grams" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "order_status",
    "to_status" "order_status" NOT NULL,
    "actor_id" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotal_cents" INTEGER NOT NULL,
    "shipping_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "vat_mention" VARCHAR(200) NOT NULL,
    "pdf_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_products_slug_key" ON "shop_products"("slug");

-- CreateIndex
CREATE INDEX "shop_products_kind_position_idx" ON "shop_products"("kind", "position");

-- CreateIndex
CREATE INDEX "shop_products_deleted_at_idx" ON "shop_products"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "shop_variants_sku_key" ON "shop_variants"("sku");

-- CreateIndex
CREATE INDEX "shop_variants_product_id_position_idx" ON "shop_variants"("product_id", "position");

-- CreateIndex
CREATE INDEX "shop_stock_movements_variant_id_created_at_idx" ON "shop_stock_movements"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "shop_stock_movements_order_id_idx" ON "shop_stock_movements"("order_id");

-- CreateIndex
CREATE INDEX "shop_kit_items_product_id_position_idx" ON "shop_kit_items"("product_id", "position");

-- CreateIndex
CREATE INDEX "shop_product_images_media_id_idx" ON "shop_product_images"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_product_images_product_id_media_id_key" ON "shop_product_images"("product_id", "media_id");

-- CreateIndex
CREATE INDEX "shipping_rates_active_position_idx" ON "shipping_rates"("active", "position");

-- CreateIndex
CREATE UNIQUE INDEX "shop_carts_user_id_key" ON "shop_carts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_carts_guest_token_hash_key" ON "shop_carts"("guest_token_hash");

-- CreateIndex
CREATE INDEX "shop_carts_expires_at_idx" ON "shop_carts"("expires_at");

-- CreateIndex
CREATE INDEX "shop_cart_items_variant_id_idx" ON "shop_cart_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_cart_items_cart_id_variant_id_key" ON "shop_cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_email_idx" ON "orders"("email");

-- CreateIndex
CREATE INDEX "orders_cart_id_status_idx" ON "orders"("cart_id", "status");

-- CreateIndex
CREATE INDEX "orders_reservation_expires_at_idx" ON "orders"("reservation_expires_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_created_at_idx" ON "order_events"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_reservations_variant_id_idx" ON "stock_reservations"("variant_id");

-- CreateIndex
CREATE INDEX "stock_reservations_expires_at_idx" ON "stock_reservations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_reservations_order_id_variant_id_key" ON "stock_reservations"("order_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_year_sequence_key" ON "invoices"("year", "sequence");

-- AddForeignKey
ALTER TABLE "shop_variants" ADD CONSTRAINT "shop_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_stocks" ADD CONSTRAINT "shop_stocks_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "shop_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_stock_movements" ADD CONSTRAINT "shop_stock_movements_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "shop_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_kit_items" ADD CONSTRAINT "shop_kit_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_images" ADD CONSTRAINT "shop_product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_product_images" ADD CONSTRAINT "shop_product_images_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_carts" ADD CONSTRAINT "shop_carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_cart_items" ADD CONSTRAINT "shop_cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "shop_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_cart_items" ADD CONSTRAINT "shop_cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "shop_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "shop_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contraintes métier (non exprimables dans le schéma Prisma).
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_slug_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_position_chk" CHECK ("position" >= 0);
ALTER TABLE "shop_variants" ADD CONSTRAINT "shop_variants_price_chk" CHECK ("price_cents" >= 0);
ALTER TABLE "shop_variants" ADD CONSTRAINT "shop_variants_weight_chk" CHECK ("weight_grams" BETWEEN 0 AND 100000);
ALTER TABLE "shop_variants" ADD CONSTRAINT "shop_variants_sku_chk" CHECK ("sku" ~ '^[A-Z0-9][A-Z0-9-]*$');
ALTER TABLE "shop_variants" ADD CONSTRAINT "shop_variants_position_chk" CHECK ("position" >= 0);
ALTER TABLE "shop_kit_items" ADD CONSTRAINT "shop_kit_items_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 1000);
ALTER TABLE "shop_product_images" ADD CONSTRAINT "shop_product_images_position_chk" CHECK ("position" >= 0);

-- Stock : jamais négatif, jamais plus de réservé que de disponible (aucune survente possible,
-- même en cas de bogue applicatif : la base refuse l'écriture).
ALTER TABLE "shop_stocks" ADD CONSTRAINT "shop_stocks_on_hand_chk" CHECK ("on_hand" >= 0);
ALTER TABLE "shop_stocks" ADD CONSTRAINT "shop_stocks_reserved_chk" CHECK ("reserved" >= 0 AND "reserved" <= "on_hand");
ALTER TABLE "shop_stocks" ADD CONSTRAINT "shop_stocks_threshold_chk" CHECK ("low_stock_threshold" BETWEEN 0 AND 10000);
ALTER TABLE "shop_stock_movements" ADD CONSTRAINT "shop_stock_movements_delta_chk" CHECK ("delta" <> 0);

ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_price_chk" CHECK ("price_cents" >= 0 AND ("free_from_cents" IS NULL OR "free_from_cents" >= 0));
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_weight_chk" CHECK ("min_weight_grams" >= 0 AND ("max_weight_grams" IS NULL OR "max_weight_grams" >= "min_weight_grams"));
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_countries_chk" CHECK ("method" = 'pickup' OR cardinality("countries") > 0);

ALTER TABLE "shop_cart_items" ADD CONSTRAINT "shop_cart_items_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 99);
ALTER TABLE "shop_carts" ADD CONSTRAINT "shop_carts_owner_chk" CHECK (("user_id" IS NULL) <> ("guest_token_hash" IS NULL));

-- Commandes : montants cohérents, dates d'étape présentes selon le statut.
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_chk" CHECK (
  "subtotal_cents" >= 0 AND "shipping_cents" >= 0
  AND "total_cents" = "subtotal_cents" + "shipping_cents"
  AND "refunded_cents" BETWEEN 0 AND "total_cents"
);
ALTER TABLE "orders" ADD CONSTRAINT "orders_paid_chk" CHECK ("status" IN ('pending_payment', 'cancelled') OR "paid_at" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipped_chk" CHECK ("status" NOT IN ('shipped', 'delivered') OR "shipped_at" IS NOT NULL);
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_chk" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_address_chk" CHECK ("shipping_method" = 'pickup' OR "shipping_address" IS NOT NULL);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_chk" CHECK ("quantity" BETWEEN 1 AND 99);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_chk" CHECK ("unit_price_cents" >= 0 AND "weight_grams" >= 0);
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_quantity_chk" CHECK ("quantity" > 0);
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_state_chk" CHECK ("consumed_at" IS NULL OR "released_at" IS NULL);

-- Factures : numérotation continue par année.
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_chk" CHECK ("year" BETWEEN 2020 AND 2200 AND "last_number" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sequence_chk" CHECK ("sequence" >= 1);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_chk" CHECK ("total_cents" = "subtotal_cents" + "shipping_cents");

-- Factures inaltérables (obligation comptable, conservation 10 ans) : aucune suppression avant
-- 10 ans ; la seule modification admise est l'ajout du PDF, une seule fois, par le worker.
CREATE FUNCTION "invoices_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."pdf_key" IS NULL AND NEW."pdf_key" IS NOT NULL
       AND (to_jsonb(NEW) - 'pdf_key') = (to_jsonb(OLD) - 'pdf_key') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'invoices est inaltérable (seul l''ajout du PDF est permis)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' AND OLD."issued_at" > now() - interval '10 years' THEN
    RAISE EXCEPTION 'invoices : suppression interdite avant 10 ans' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "invoices_immutable"
  BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION "invoices_guard"();

CREATE FUNCTION "invoices_no_truncate"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'invoices est inaltérable (TRUNCATE interdit)' USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "invoices_no_truncate"
  BEFORE TRUNCATE ON "invoices"
  FOR EACH STATEMENT EXECUTE FUNCTION "invoices_no_truncate"();
