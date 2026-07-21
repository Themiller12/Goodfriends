-- Goodfriends - Migration E2EE Phase 2 (1-to-1)
-- Date: 2026-07-21
-- Objectif: stocker la clé publique E2EE par utilisateur
--           et les payloads chiffrés des messages 1-to-1.

START TRANSACTION;

-- 1) Clé publique E2EE (X25519) par utilisateur
ALTER TABLE users
  ADD COLUMN e2ee_public_key TEXT NULL AFTER photo;

-- 2) Métadonnées de chiffrement côté messages
ALTER TABLE messages
  ADD COLUMN is_encrypted TINYINT(1) NOT NULL DEFAULT 0 AFTER message,
  ADD COLUMN encryption_version VARCHAR(16) NULL AFTER is_encrypted,
  ADD COLUMN sender_ciphertext LONGTEXT NULL AFTER encryption_version,
  ADD COLUMN sender_nonce VARCHAR(128) NULL AFTER sender_ciphertext,
  ADD COLUMN sender_ephemeral_public_key VARCHAR(128) NULL AFTER sender_nonce,
  ADD COLUMN receiver_ciphertext LONGTEXT NULL AFTER sender_ephemeral_public_key,
  ADD COLUMN receiver_nonce VARCHAR(128) NULL AFTER receiver_ciphertext,
  ADD COLUMN receiver_ephemeral_public_key VARCHAR(128) NULL AFTER receiver_nonce;

-- 3) Index utile pour filtrer rapidement les messages chiffrés (optionnel)
CREATE INDEX idx_messages_is_encrypted ON messages (is_encrypted);

COMMIT;

-- Rollback manuel (si besoin):
-- ALTER TABLE messages
--   DROP COLUMN receiver_ephemeral_public_key,
--   DROP COLUMN receiver_nonce,
--   DROP COLUMN receiver_ciphertext,
--   DROP COLUMN sender_ephemeral_public_key,
--   DROP COLUMN sender_nonce,
--   DROP COLUMN sender_ciphertext,
--   DROP COLUMN encryption_version,
--   DROP COLUMN is_encrypted;
-- DROP INDEX idx_messages_is_encrypted ON messages;
-- ALTER TABLE users DROP COLUMN e2ee_public_key;
