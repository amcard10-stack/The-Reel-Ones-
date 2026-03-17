-- Add profile columns to user table (for Find Friends search)
-- Run this ONLY if your user table doesn't have first_name, last_name, etc.
-- If you get "Duplicate column name" errors, your table already has these - stop.
--
-- Run: mysql -u YOUR_USER -p YOUR_DATABASE < user_profile_columns.sql

ALTER TABLE user ADD COLUMN first_name VARCHAR(100) DEFAULT NULL;
ALTER TABLE user ADD COLUMN last_name VARCHAR(100) DEFAULT NULL;
ALTER TABLE user ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL;
ALTER TABLE user ADD COLUMN username VARCHAR(50) DEFAULT NULL;
ALTER TABLE user ADD COLUMN bio TEXT DEFAULT NULL;
ALTER TABLE user ADD UNIQUE KEY username_unique (username);
