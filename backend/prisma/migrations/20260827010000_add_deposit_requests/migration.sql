-- CreateTable
CREATE TABLE "deposit_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount_usdt" DOUBLE PRECISION NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'USDT',
    "wallet_address" TEXT NOT NULL,
    "tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "credited_amount" DOUBLE PRECISION,
    "commission_pct" DOUBLE PRECISION,
    "admin_note" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deposit_requests_tx_hash_key" ON "deposit_requests"("tx_hash");

-- CreateIndex
CREATE INDEX "deposit_requests_user_id_idx" ON "deposit_requests"("user_id");

-- CreateIndex
CREATE INDEX "deposit_requests_status_idx" ON "deposit_requests"("status");

-- AddForeignKey
ALTER TABLE "deposit_requests" ADD CONSTRAINT "deposit_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
