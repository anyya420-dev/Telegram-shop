CREATE TABLE IF NOT EXISTS "casino_balances" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "credits" DOUBLE PRECISION NOT NULL DEFAULT 1000,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "casino_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "casino_balances_user_id_key" ON "casino_balances"("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'casino_balances_user_id_fkey'
      AND table_name = 'casino_balances'
  ) THEN
    ALTER TABLE "casino_balances"
      ADD CONSTRAINT "casino_balances_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "casino_rounds" (
  "id" SERIAL NOT NULL,
  "casino_balance_id" INTEGER NOT NULL,
  "game" TEXT NOT NULL DEFAULT 'dice',
  "bet_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "target_value" INTEGER NOT NULL DEFAULT 0,
  "outcome_value" INTEGER NOT NULL DEFAULT 0,
  "payout_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "net_change" DOUBLE PRECISION NOT NULL,
  "is_win" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "casino_rounds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "casino_rounds_casino_balance_id_created_at_idx" ON "casino_rounds"("casino_balance_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'casino_rounds_casino_balance_id_fkey'
      AND table_name = 'casino_rounds'
  ) THEN
    ALTER TABLE "casino_rounds"
      ADD CONSTRAINT "casino_rounds_casino_balance_id_fkey"
      FOREIGN KEY ("casino_balance_id") REFERENCES "casino_balances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "casino_balances" ("user_id", "credits", "created_at", "updated_at")
SELECT
  b."user_id",
  GREATEST(COALESCE(SUM(bt."amount"), 0), 0),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "balances" b
JOIN "balance_transactions" bt
  ON bt."balance_id" = b."id"
 AND bt."type" IN ('casino_win', 'casino_loss')
LEFT JOIN "casino_balances" cb
  ON cb."user_id" = b."user_id"
WHERE cb."id" IS NULL
GROUP BY b."user_id";

INSERT INTO "casino_rounds" (
  "casino_balance_id",
  "game",
  "bet_amount",
  "target_value",
  "outcome_value",
  "payout_amount",
  "net_change",
  "is_win",
  "created_at"
)
SELECT
  cb."id",
  'dice',
  0,
  0,
  0,
  CASE WHEN bt."amount" > 0 THEN bt."amount" ELSE 0 END,
  bt."amount",
  bt."amount" > 0,
  bt."created_at"
FROM "balance_transactions" bt
JOIN "balances" b
  ON b."id" = bt."balance_id"
JOIN "casino_balances" cb
  ON cb."user_id" = b."user_id"
LEFT JOIN "casino_rounds" cr
  ON cr."casino_balance_id" = cb."id"
 AND cr."created_at" = bt."created_at"
 AND cr."net_change" = bt."amount"
WHERE bt."type" IN ('casino_win', 'casino_loss')
  AND cr."id" IS NULL;

UPDATE "balances" b
SET "amount" = b."amount" - legacy."casino_delta"
FROM (
  SELECT "balance_id", COALESCE(SUM("amount"), 0) AS "casino_delta"
  FROM "balance_transactions"
  WHERE "type" IN ('casino_win', 'casino_loss')
  GROUP BY "balance_id"
) legacy
WHERE legacy."balance_id" = b."id"
  AND NOT EXISTS (
    SELECT 1
    FROM "balance_transactions" bt2
    WHERE bt2."balance_id" = b."id"
      AND bt2."type" = 'casino_migration_applied'
  );

INSERT INTO "balance_transactions" ("balance_id", "type", "amount", "comment", "created_at")
SELECT
  legacy."balance_id",
  'casino_migration_applied',
  0,
  'Casino credits moved to dedicated casino balance',
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "balance_id"
  FROM "balance_transactions"
  WHERE "type" IN ('casino_win', 'casino_loss')
) legacy
WHERE NOT EXISTS (
  SELECT 1
  FROM "balance_transactions" bt
  WHERE bt."balance_id" = legacy."balance_id"
    AND bt."type" = 'casino_migration_applied'
);
