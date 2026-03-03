-- Add type (movie/show) to rating table for standardized ratings
ALTER TABLE rating ADD COLUMN type ENUM('movie', 'show') NOT NULL DEFAULT 'movie' AFTER title;
