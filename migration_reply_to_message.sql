-- Migration : ajout de la colonne reply_to_id dans messages
-- À exécuter une seule fois sur la base de données

ALTER TABLE messages
  ADD COLUMN reply_to_id VARCHAR(50) NULL DEFAULT NULL,
  ADD CONSTRAINT fk_messages_reply_to
    FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
  ADD INDEX idx_reply_to_id (reply_to_id);
