-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('stripe', 'paypal');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'succeeded', 'failed', 'abandoned', 'refunded', 'partially_refunded', 'disputed');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "webhook_event_status" AS ENUM ('received', 'processed', 'ignored', 'failed');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "amount_cents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "provider_session_id" VARCHAR(255),
    "provider_payment_id" VARCHAR(255),
    "redirect_url" VARCHAR(2048),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "succeeded_at" TIMESTAMPTZ(3),
    "refunded_cents" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "status" "refund_status" NOT NULL DEFAULT 'pending',
    "provider_refund_id" VARCHAR(255),
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "actor_id" UUID,
    "failure_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "status" "webhook_event_status" NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(500),
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_session_id_key" ON "payments"("provider_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_order_id_created_at_idx" ON "payments"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_provider_status_created_at_idx" ON "payments"("provider", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_provider_refund_id_key" ON "refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "webhook_events_status_received_at_idx" ON "webhook_events"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contraintes métier (non exprimables dans le schéma Prisma).
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("amount_cents" > 0 AND "refunded_cents" BETWEEN 0 AND "amount_cents");
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_chk" CHECK ("currency" = 'EUR');
ALTER TABLE "payments" ADD CONSTRAINT "payments_succeeded_chk" CHECK (
  "status" IN ('pending', 'failed', 'abandoned') OR "succeeded_at" IS NOT NULL
);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_chk" CHECK ("amount_cents" > 0);
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_attempts_chk" CHECK ("attempts" >= 0);
