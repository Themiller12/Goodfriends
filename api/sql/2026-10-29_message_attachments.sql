-- Goodfriends - Migration messages vocaux et fichiers joints
-- Date: 2026-10-29

ALTER TABLE messages
    ADD COLUMN attachment_type VARCHAR(10) NULL DEFAULT NULL,
    ADD COLUMN attachment_name VARCHAR(255) NULL DEFAULT NULL,
    ADD COLUMN attachment_mime VARCHAR(100) NULL DEFAULT NULL,
    ADD COLUMN attachment_size INT UNSIGNED NULL DEFAULT NULL,
    ADD COLUMN attachment_duration_ms INT UNSIGNED NULL DEFAULT NULL;

-- Rollback :
-- ALTER TABLE messages
--     DROP COLUMN attachment_type, DROP COLUMN attachment_name, DROP COLUMN attachment_mime,
--     DROP COLUMN attachment_size, DROP COLUMN attachment_duration_ms;
