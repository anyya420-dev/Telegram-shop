ALTER TABLE "payment_methods"
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_mode" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_key" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_config" TEXT,
  ADD COLUMN IF NOT EXISTS "asset" TEXT,
  ADD COLUMN IF NOT EXISTS "display_name" TEXT,
  ADD COLUMN IF NOT EXISTS "instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "is_ton_connect_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "payment_methods"
SET
  "provider" = CASE WHEN "type" = 'card' THEN COALESCE("provider", 'manual') ELSE "provider" END,
  "provider_mode" = CASE WHEN "type" = 'card' THEN COALESCE("provider_mode", 'test') ELSE "provider_mode" END,
  "asset" = CASE WHEN "type" IN ('crypto', 'ton') THEN COALESCE("asset", COALESCE("currency", CASE WHEN "type" = 'ton' THEN 'TON' END)) ELSE "asset" END,
  "network" = CASE WHEN "type" = 'ton' AND "network" IS NULL THEN 'TON' ELSE "network" END,
  "display_name" = COALESCE("display_name", "title"),
  "instructions" = COALESCE("instructions", ''),
  "sort_order" = COALESCE("sort_order", "id"),
  "is_ton_connect_enabled" = CASE WHEN "type" = 'ton' THEN true ELSE "is_ton_connect_enabled" END,
  "type" = CASE WHEN "type" = 'ton' THEN 'crypto' ELSE "type" END,
  "card_number" = NULL,
  "cardholder_name" = NULL;

CREATE TABLE IF NOT EXISTS "payments" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "payment_method_id" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT,
  "asset" TEXT,
  "network" TEXT,
  "provider" TEXT,
  "provider_payment_id" TEXT,
  "provider_session_id" TEXT,
  "checkout_url" TEXT,
  "recipient" TEXT,
  "sender_address" TEXT,
  "transaction_hash" TEXT,
  "reference_code" TEXT,
  "metadata" TEXT,
  "failure_reason" TEXT,
  "paid_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_payment_id_key" ON "payments"("provider_payment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_session_id_key" ON "payments"("provider_session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_transaction_hash_key" ON "payments"("transaction_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_reference_code_key" ON "payments"("reference_code");
CREATE INDEX IF NOT EXISTS "payments_order_id_created_at_idx" ON "payments"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "payments_status_expires_at_idx" ON "payments"("status", "expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_order_id_fkey'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'payments_payment_method_id_fkey'
      AND table_name = 'payments'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_payment_method_id_fkey"
      FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
