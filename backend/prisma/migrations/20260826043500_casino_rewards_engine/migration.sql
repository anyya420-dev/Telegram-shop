ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "credits_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "credits_price" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "min_credits_required" DOUBLE PRECISION;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "reward_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "casino_credits_used" DOUBLE PRECISION NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'orders_reward_id_fkey'
      AND table_name = 'orders'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_reward_id_fkey"
      FOREIGN KEY ("reward_id") REFERENCES "casino_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_reward_id_key" ON "orders"("reward_id");

ALTER TABLE "casino_balances"
  ADD COLUMN IF NOT EXISTS "lifetime_won" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lifetime_spent" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "casino_rounds"
  ADD COLUMN IF NOT EXISTS "request_id" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS "reward_config_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "reward_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "metadata" TEXT;

ALTER TABLE "casino_rounds"
  ALTER COLUMN "target_value" TYPE TEXT USING "target_value"::TEXT,
  ALTER COLUMN "outcome_value" TYPE TEXT USING "outcome_value"::TEXT;

UPDATE "casino_rounds"
SET "request_id" = CONCAT('legacy-round-', "id")
WHERE "request_id" IS NULL;

ALTER TABLE "casino_rounds"
  ALTER COLUMN "request_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "casino_rounds_request_id_key" ON "casino_rounds"("request_id");
CREATE UNIQUE INDEX IF NOT EXISTS "casino_rounds_reward_id_key" ON "casino_rounds"("reward_id");

CREATE TABLE IF NOT EXISTS "casino_game_configs" (
  "id" SERIAL NOT NULL,
  "game" TEXT NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "min_bet" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "max_bet" DOUBLE PRECISION NOT NULL DEFAULT 500,
  "spin_limit" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "casino_game_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "casino_game_configs_game_key" ON "casino_game_configs"("game");

CREATE TABLE IF NOT EXISTS "casino_reward_configs" (
  "id" SERIAL NOT NULL,
  "game" TEXT NOT NULL,
  "reward_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "result_key" TEXT,
  "discount_percent" DOUBLE PRECISION,
  "credit_amount" DOUBLE PRECISION,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "expires_in_hours" INTEGER,
  "min_order_amount" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "casino_reward_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "casino_reward_configs_discount_limit" CHECK ("discount_percent" IS NULL OR ("discount_percent" >= 0 AND "discount_percent" <= 30)),
  CONSTRAINT "casino_reward_configs_weight_positive" CHECK ("weight" > 0)
);

CREATE INDEX IF NOT EXISTS "casino_reward_configs_game_is_active_idx" ON "casino_reward_configs"("game", "is_active");

CREATE TABLE IF NOT EXISTS "casino_rewards" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "game" TEXT NOT NULL,
  "reward_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'available',
  "discount_percent" DOUBLE PRECISION,
  "credit_amount" DOUBLE PRECISION,
  "min_order_amount" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "used_at" TIMESTAMP(3),
  "order_id" INTEGER,
  CONSTRAINT "casino_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "casino_rewards_discount_limit" CHECK ("discount_percent" IS NULL OR ("discount_percent" >= 0 AND "discount_percent" <= 30))
);

CREATE UNIQUE INDEX IF NOT EXISTS "casino_rewards_order_id_key" ON "casino_rewards"("order_id");
CREATE INDEX IF NOT EXISTS "casino_rewards_user_id_status_expires_at_idx" ON "casino_rewards"("user_id", "status", "expires_at");

CREATE TABLE IF NOT EXISTS "casino_credit_transactions" (
  "id" SERIAL NOT NULL,
  "casino_balance_id" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT,
  "order_id" INTEGER,
  "round_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "casino_credit_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "casino_credit_transactions_casino_balance_id_created_at_idx" ON "casino_credit_transactions"("casino_balance_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'casino_reward_configs_game_fkey'
      AND table_name = 'casino_reward_configs'
  ) THEN
    ALTER TABLE "casino_reward_configs"
      ADD CONSTRAINT "casino_reward_configs_game_fkey"
      FOREIGN KEY ("game") REFERENCES "casino_game_configs"("game") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'casino_rewards_user_id_fkey'
      AND table_name = 'casino_rewards'
  ) THEN
    ALTER TABLE "casino_rewards"
      ADD CONSTRAINT "casino_rewards_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'casino_rewards_order_id_fkey'
      AND table_name = 'casino_rewards'
  ) THEN
    ALTER TABLE "casino_rewards"
      ADD CONSTRAINT "casino_rewards_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'casino_rounds_reward_config_id_fkey'
      AND table_name = 'casino_rounds'
  ) THEN
    ALTER TABLE "casino_rounds"
      ADD CONSTRAINT "casino_rounds_reward_config_id_fkey"
      FOREIGN KEY ("reward_config_id") REFERENCES "casino_reward_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'casino_rounds_reward_id_fkey'
      AND table_name = 'casino_rounds'
  ) THEN
    ALTER TABLE "casino_rounds"
      ADD CONSTRAINT "casino_rounds_reward_id_fkey"
      FOREIGN KEY ("reward_id") REFERENCES "casino_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'casino_credit_transactions_casino_balance_id_fkey'
      AND table_name = 'casino_credit_transactions'
  ) THEN
    ALTER TABLE "casino_credit_transactions"
      ADD CONSTRAINT "casino_credit_transactions_casino_balance_id_fkey"
      FOREIGN KEY ("casino_balance_id") REFERENCES "casino_balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
