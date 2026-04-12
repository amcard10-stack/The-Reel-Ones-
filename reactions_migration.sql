USE cis440sprc26team2;

DROP TABLE IF EXISTS rating_reaction;

CREATE TABLE rating_reaction (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    rating_id   INT NOT NULL,
    user_email  VARCHAR(255) NOT NULL,
    emoji       VARCHAR(10)  NOT NULL,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_reaction_user_rating (rating_id, user_email),
    INDEX idx_rr_rating_id (rating_id),
    INDEX idx_rr_user_email (user_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;