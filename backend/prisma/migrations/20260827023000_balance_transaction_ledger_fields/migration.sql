-- AlterTable: add ledger fields to balance_transactions
ALTER TABLE "balance_transactions" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE "balance_transactions" ADD COLUMN IF NOT EXISTS "source" TEXT;
ALTER TABLE "balance_transactions" ADD COLUMN IF NOT EXISTS "admin_id" INTEGER;
ALTER TABLE "balance_transactions" ADD COLUMN IF NOT EXISTS "reference_id" INTEGER;
