-- CreateTable admin_accounts
CREATE TABLE IF NOT EXISTS "admin_accounts" (
  "id" SERIAL NOT NULL,
  "username" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'admin',
  "password_hash" TEXT NOT NULL,
  "password_salt" TEXT NOT NULL,
  "password_algo" TEXT NOT NULL DEFAULT 'scrypt',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "admin_accounts_username_key" ON "admin_accounts"("username");

-- CreateTable app_settings
CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" SERIAL NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_settings_key_key" ON "app_settings"("key");

-- Extend admin_sessions with account binding
ALTER TABLE "admin_sessions" ADD COLUMN IF NOT EXISTS "admin_account_id" INTEGER;
CREATE INDEX IF NOT EXISTS "admin_sessions_admin_account_id_idx" ON "admin_sessions"("admin_account_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'admin_sessions_admin_account_id_fkey'
      AND table_name = 'admin_sessions'
  ) THEN
    ALTER TABLE "admin_sessions"
      ADD CONSTRAINT "admin_sessions_admin_account_id_fkey"
      FOREIGN KEY ("admin_account_id") REFERENCES "admin_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Bootstrap owner account from legacy admin_security if available
DO $$
DECLARE
  legacy_record RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "admin_accounts" WHERE "role" = 'owner' AND "deleted_at" IS NULL) THEN
    SELECT "password_hash", "password_salt", "password_algo"
    INTO legacy_record
    FROM "admin_security"
    ORDER BY "id" ASC
    LIMIT 1;

    IF legacy_record IS NOT NULL THEN
      INSERT INTO "admin_accounts" ("username", "role", "password_hash", "password_salt", "password_algo", "is_active")
      VALUES ('owner', 'owner', legacy_record."password_hash", legacy_record."password_salt", legacy_record."password_algo", true)
      ON CONFLICT ("username") DO NOTHING;
    END IF;
  END IF;
END $$;

INSERT INTO "app_settings" ("key", "value")
VALUES ('shop_name', 'NARCOS')
ON CONFLICT ("key") DO NOTHING;
