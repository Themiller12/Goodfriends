-- Goodfriends - Sauvegarde de la clé E2EE liée au compte + chiffrement de bout en bout des groupes
-- Date: 2026-11-03

START TRANSACTION;

-- 1) Sauvegarde de la clé privée E2EE (chiffrée au repos par le serveur, restituée au seul propriétaire du compte)
--    Permet de retrouver l'historique des messages après une réinstallation ou un changement de téléphone.
ALTER TABLE users
  ADD COLUMN e2ee_key_backup TEXT NULL AFTER e2ee_public_key;

-- 2) Messages de groupe chiffrés : une charge utile par membre (même principe que les messages privés)
ALTER TABLE group_chat_messages
  ADD COLUMN is_encrypted TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN encryption_version VARCHAR(16) NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS group_message_payloads (
    message_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    ciphertext LONGTEXT NOT NULL,
    nonce VARCHAR(128) NOT NULL,
    ephemeral_public_key VARCHAR(128) NOT NULL,
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES group_chat_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_gmp_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

-- Rollback manuel (si besoin):
-- DROP TABLE group_message_payloads;
-- ALTER TABLE group_chat_messages DROP COLUMN encryption_version, DROP COLUMN is_encrypted;
-- ALTER TABLE users DROP COLUMN e2ee_key_backup;
