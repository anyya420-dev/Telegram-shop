ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN IF NOT EXISTS "operator_status" TEXT;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "assigned_operator_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "delivery_price" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "delivery_price_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "delivery_price_confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivery_price_confirmed_by_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_assigned_operator_id_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_assigned_operator_id_fkey"
      FOREIGN KEY ("assigned_operator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_delivery_price_confirmed_by_id_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_delivery_price_confirmed_by_id_fkey"
      FOREIGN KEY ("delivery_price_confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "orders_assigned_operator_id_idx" ON "orders"("assigned_operator_id");

CREATE TABLE IF NOT EXISTS "delivery_price_audit" (
  "id" SERIAL PRIMARY KEY,
  "order_id" INTEGER NOT NULL,
  "actor_user_id" INTEGER NOT NULL,
  "previous_price" DOUBLE PRECISION,
  "new_price" DOUBLE PRECISION NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_price_audit_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_price_audit_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "delivery_price_audit_order_id_created_at_idx" ON "delivery_price_audit"("order_id", "created_at");

CREATE TABLE IF NOT EXISTS "telegram_bots" (
  "id" SERIAL PRIMARY KEY,
  "telegram_bot_id" TEXT NOT NULL UNIQUE,
  "username" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "encrypted_token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "web_app_url" TEXT,
  "menu_button_text" TEXT,
  "menu_button_url" TEXT,
  "webhook_url" TEXT,
  "webhook_secret" TEXT,
  "webhook_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "webhook_last_status" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "managed_by_user_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_bots_managed_by_user_id_fkey"
    FOREIGN KEY ("managed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "telegram_bots_status_is_primary_idx" ON "telegram_bots"("status", "is_primary");
