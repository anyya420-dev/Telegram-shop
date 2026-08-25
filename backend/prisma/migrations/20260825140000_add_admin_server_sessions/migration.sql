-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_security" (
    "id" SERIAL NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_salt" TEXT NOT NULL,
    "password_algo" TEXT NOT NULL DEFAULT 'scrypt',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_security_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "admin_sessions" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admin_sessions_expires_at_revoked_at_idx" ON "admin_sessions"("expires_at", "revoked_at");
