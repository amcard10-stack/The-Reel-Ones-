-- Run once if saving "Want to watch" fails with a DB / truncation error.
-- Older deployments may have created watch_status before want_to_watch existed in the ENUM.
-- CREATE TABLE IF NOT EXISTS does not add new ENUM members to an existing table.

ALTER TABLE watch_status
  MODIFY COLUMN status ENUM('watching','completed','want_to_watch') NOT NULL;
