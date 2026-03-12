-- Migration pour augmenter la taille de la colonne photo
-- Les images en base64 nécessitent plus d'espace que TEXT (65KB)
-- LONGTEXT supporte jusqu'à 4GB

USE goodfriends;

-- Modifier la colonne photo dans la table users
ALTER TABLE users MODIFY COLUMN photo LONGTEXT;

-- Modifier la colonne photo dans la table contacts
ALTER TABLE contacts MODIFY COLUMN photo LONGTEXT;

-- Vérifier les changements
DESCRIBE users;
DESCRIBE contacts;
