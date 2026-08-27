ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "telegram_id" TEXT;
ALTER TABLE "admin_accounts" ADD COLUMN IF NOT EXISTS "permissions" TEXT NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS "admin_accounts_telegram_id_key" ON "admin_accounts"("telegram_id");
