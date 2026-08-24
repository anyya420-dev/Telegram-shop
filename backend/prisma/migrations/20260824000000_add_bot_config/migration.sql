-- CreateTable
CREATE TABLE "bot_configs" (
    "id" SERIAL NOT NULL,
    "bot_id" TEXT NOT NULL,
    "bot_username" TEXT NOT NULL,
    "bot_first_name" TEXT NOT NULL,
    "encrypted_token" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_validated_at" TIMESTAMP(3),

    CONSTRAINT "bot_configs_pkey" PRIMARY KEY ("id")
);
