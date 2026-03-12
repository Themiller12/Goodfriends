-- Migration: Ajout de la colonne photo_url dans la table messages
-- Permet l'envoi de photos dans les messages privés

ALTER TABLE messages ADD COLUMN photo_url VARCHAR(500) NULL AFTER message;

-- Rendre le champ message nullable (un message photo n'a pas forcément de texte)
ALTER TABLE messages MODIFY COLUMN message TEXT NULL;
