-- Friends table for user connections
-- Run after user_table_ddl.sql and dashboard_tables.sql

CREATE TABLE IF NOT EXISTS friend (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    friend_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_friendship (user_email, friend_email),
    FOREIGN KEY (user_email) REFERENCES user(email) ON DELETE CASCADE,
    FOREIGN KEY (friend_email) REFERENCES user(email) ON DELETE CASCADE
);
