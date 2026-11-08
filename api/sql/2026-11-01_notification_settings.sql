-- Goodfriends - Réglage "Notifications de messages" appliqué côté serveur
-- Date: 2026-11-01

ALTER TABLE user_profiles
    ADD COLUMN notify_messages TINYINT(1) NOT NULL DEFAULT 1 AFTER privacy_allow_search_phone;

-- Rollback :
-- ALTER TABLE user_profiles DROP COLUMN notify_messages;
