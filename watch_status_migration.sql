-- Create watch_status table (for My Statuses on dashboard)
-- Run if you get "Table watch_status doesn't exist"

CREATE TABLE IF NOT EXISTS watch_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    type ENUM('movie','show') NOT NULL DEFAULT 'movie',
    status ENUM('watching','completed','want_to_watch') NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_title (user_email, title),
    FOREIGN KEY (user_email) REFERENCES user(email) ON DELETE CASCADE
);
