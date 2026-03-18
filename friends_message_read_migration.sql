-- Adds unread tracking to friend messaging.
-- Run after friends_feature_migration.sql.
--
-- Command:
--   mysql -h <DB_HOST> -u <DB_USER> -p <DB_PASSWORD> <DB_NAME> < friends_message_read_migration.sql

ALTER TABLE message
  ADD COLUMN read_at TIMESTAMP NULL DEFAULT NULL;

