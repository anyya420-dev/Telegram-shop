ALTER TABLE "delivery_price_audit"
  ALTER COLUMN "actor_user_id" DROP NOT NULL;

ALTER TABLE "delivery_price_audit"
  ADD COLUMN IF NOT EXISTS "actor_admin_session_id" INTEGER;

CREATE INDEX IF NOT EXISTS "delivery_price_audit_actor_admin_session_id_idx"
  ON "delivery_price_audit"("actor_admin_session_id");
