-- Migration v2: invitation accept flow + added_by tracking
-- Run: mysql -h 107.180.1.16 -u cis440sprc26team2 -pcis440sprc26team2 cis440sprc26team2 < watchlist_collab_v2_migration.sql

-- Track who added each item to a list
ALTER TABLE list_item
    ADD COLUMN IF NOT EXISTS added_by_email VARCHAR(255);

-- Invitation table: friend must accept before they become a collaborator
CREATE TABLE IF NOT EXISTS list_invitation (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    list_id         INT NOT NULL,
    invited_email   VARCHAR(255) NOT NULL,
    invited_by_email VARCHAR(255) NOT NULL,
    status          ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES list(id) ON DELETE CASCADE,
    UNIQUE KEY unique_invite (list_id, invited_email)
);
