-- CreateTable operators
CREATE TABLE IF NOT EXISTS "operators" (
    "id" SERIAL NOT NULL,
    "telegram_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "username" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "operators_telegram_id_key" ON "operators"("telegram_id");

-- CreateTable telegram_bots
CREATE TABLE IF NOT EXISTS "telegram_bots" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "web_app_url" TEXT,
    "menu_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_bots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_bots_token_key" ON "telegram_bots"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_bots_bot_id_key" ON "telegram_bots"("bot_id");

-- AlterTable orders: add operator fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'operator_id'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "operator_id" INTEGER;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'operator_delivery_price'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "operator_delivery_price" DOUBLE PRECISION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivery_price_confirmed'
  ) THEN
    ALTER TABLE "orders" ADD COLUMN "delivery_price_confirmed" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- AddForeignKey orders.operator_id -> operators.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_operator_id_fkey'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_operator_id_fkey"
      FOREIGN KEY ("operator_id") REFERENCES "operators"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
