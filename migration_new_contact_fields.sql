-- Migration: Nouveaux champs contacts et relations
-- À exécuter dans phpMyAdmin sur la base de données goodfriends

-- 1. Ajout des champs gender, allergies, travels dans la table contacts
ALTER TABLE contacts
    ADD COLUMN gender ENUM('male', 'female', 'other') AFTER notes,
    ADD COLUMN allergies TEXT AFTER gender,
    ADD COLUMN travels TEXT AFTER allergies;

-- 2. Extension de l'ENUM relation_type dans relationships (ajout des nouveaux types)
ALTER TABLE relationships
    MODIFY COLUMN relation_type ENUM(
        'spouse', 'child', 'parent', 'father', 'mother',
        'sibling', 'cousin', 'stepmother', 'stepfather',
        'friend', 'colleague', 'other'
    ) NOT NULL;

-- 3. Ajout du champ custom_relation_label dans relationships
ALTER TABLE relationships
    ADD COLUMN custom_relation_label VARCHAR(255) NULL AFTER relation_type;
