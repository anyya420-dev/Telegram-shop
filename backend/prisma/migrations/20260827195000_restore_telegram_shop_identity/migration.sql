INSERT INTO "app_settings" ("key", "value")
VALUES ('shop_name', 'Telegram Shop')
ON CONFLICT ("key") DO NOTHING;

UPDATE "app_settings"
SET "value" = 'Telegram Shop',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'shop_name'
  AND "value" = 'NARCOS';
