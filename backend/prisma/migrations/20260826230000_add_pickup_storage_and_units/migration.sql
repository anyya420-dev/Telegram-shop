ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "pickup_storage_resolution_required" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "order_items"
  ADD COLUMN IF NOT EXISTS "variant_key" TEXT;

CREATE TABLE IF NOT EXISTS "pickup_storages" (
  "id" SERIAL PRIMARY KEY,
  "product_id" INTEGER NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "product_city_id" INTEGER NOT NULL REFERENCES "product_cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "variant_key" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "photo_url" TEXT,
  "address" TEXT NOT NULL,
  "instructions" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "status" TEXT NOT NULL DEFAULT 'available',
  "assigned_at" TIMESTAMP(3),
  "assigned_order_id" INTEGER REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "assigned_order_item_id" INTEGER UNIQUE REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "pickup_storage_assignments" (
  "id" SERIAL PRIMARY KEY,
  "order_item_id" INTEGER NOT NULL UNIQUE REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "pickup_storage_id" INTEGER NOT NULL UNIQUE REFERENCES "pickup_storages"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "product_name" TEXT NOT NULL,
  "variant_key" TEXT,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "photo_url" TEXT,
  "address" TEXT NOT NULL,
  "instructions" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "pickup_storages_match_idx"
  ON "pickup_storages" ("product_city_id", "variant_key", "quantity", "unit", "is_active", "status");

UPDATE "product_cities"
SET "unit" = CASE
  WHEN LOWER(TRIM("unit")) IN ('шт.', 'шт', 'pcs', 'pc', 'piece') THEN 'шт'
  WHEN LOWER(TRIM("unit")) IN ('kg', 'кг') THEN 'кг'
  WHEN LOWER(TRIM("unit")) IN ('g', 'г') THEN 'г'
  WHEN LOWER(TRIM("unit")) = 'oz' THEN 'oz'
  ELSE "unit"
END;

UPDATE "product_cities"
SET "unit" = 'шт'
WHERE COALESCE(TRIM("unit"), '') = '';

UPDATE "pickup_storages"
SET "status" = CASE
  WHEN COALESCE("assigned_order_item_id", 0) > 0 THEN 'assigned'
  WHEN "is_active" = FALSE THEN 'inactive'
  ELSE 'available'
END
WHERE "status" NOT IN ('available', 'assigned', 'inactive');
