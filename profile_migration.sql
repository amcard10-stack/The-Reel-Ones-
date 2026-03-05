-- Add profile fields to user table
-- Run after user_table_ddl.sql

ALTER TABLE user ADD COLUMN first_name VARCHAR(100) DEFAULT NULL AFTER password;
ALTER TABLE user ADD COLUMN last_name VARCHAR(100) DEFAULT NULL AFTER first_name;
