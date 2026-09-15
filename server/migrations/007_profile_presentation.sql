ALTER TABLE users ADD COLUMN display_name text CHECK (char_length(display_name) BETWEEN 1 AND 80);
ALTER TABLE users ADD COLUMN avatar_url text CHECK (char_length(avatar_url) <= 2048);
