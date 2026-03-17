-- Friends feature migration
-- Run this to enable Find Friends, friend requests, and messaging.
-- Requires: user table and dashboard tables (list, list_item, rating) to exist.
--
-- Run: mysql -u YOUR_USER -p YOUR_DATABASE < friends_feature_migration.sql

-- ============================================
-- 1. FRIEND_REQUEST TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS friend_request (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_email VARCHAR(255) NOT NULL,
    receiver_email VARCHAR(255) NOT NULL,
    status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_email) REFERENCES user(email) ON DELETE CASCADE,
    FOREIGN KEY (receiver_email) REFERENCES user(email) ON DELETE CASCADE
);

-- ============================================
-- 2. MESSAGE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS message (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_email VARCHAR(255) NOT NULL,
    receiver_email VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_email) REFERENCES user(email) ON DELETE CASCADE,
    FOREIGN KEY (receiver_email) REFERENCES user(email) ON DELETE CASCADE
);

-- ============================================
-- 3. USER TABLE: Add profile columns (OPTIONAL)
-- ============================================
-- Run this section ONLY if your user table doesn't have these columns.
-- If you get "Duplicate column name" errors, skip this section.
--
-- ALTER TABLE user ADD COLUMN first_name VARCHAR(100) DEFAULT NULL;
-- ALTER TABLE user ADD COLUMN last_name VARCHAR(100) DEFAULT NULL;
-- ALTER TABLE user ADD COLUMN profile_picture VARCHAR(255) DEFAULT NULL;
-- ALTER TABLE user ADD COLUMN username VARCHAR(50) DEFAULT NULL;
-- ALTER TABLE user ADD COLUMN bio TEXT DEFAULT NULL;
-- ALTER TABLE user ADD UNIQUE KEY username_unique (username);
