-- Base de données Goodfriends
-- Création des tables pour l'application de gestion de contacts

-- Supprimer les tables existantes si elles existent
DROP TABLE IF EXISTS relationships;
DROP TABLE IF EXISTS children;
DROP TABLE IF EXISTS contact_groups;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS users;

-- Table des utilisateurs (comptes)
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    date_of_birth DATE,
    bio TEXT,
    photo LONGTEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    last_seen TIMESTAMP NULL,
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des groupes
CREATE TABLE groups (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('family', 'friends', 'work', 'other') DEFAULT 'other',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des contacts
CREATE TABLE contacts (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    date_of_birth DATE,
    age INT,
    address TEXT,
    notes TEXT,
    gender ENUM('male', 'female', 'other'),
    allergies TEXT,
    travels TEXT,
    photo LONGTEXT,
    is_goodfriends_user BOOLEAN DEFAULT FALSE,
    goodfriends_user_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (goodfriends_user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_name (first_name, last_name),
    INDEX idx_goodfriends_user_id (goodfriends_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table de liaison contacts-groupes (many-to-many)
CREATE TABLE contact_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id VARCHAR(50) NOT NULL,
    group_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    UNIQUE KEY unique_contact_group (contact_id, group_id),
    INDEX idx_contact_id (contact_id),
    INDEX idx_group_id (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des enfants (non-contacts)
DROP TABLE IF EXISTS family_members;
CREATE TABLE family_members (
    id VARCHAR(50) PRIMARY KEY,
    contact_id VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender ENUM('male', 'female', 'other'),
    relation_type ENUM('spouse', 'child', 'parent', 'father', 'mother', 'sibling', 'cousin', 'stepmother', 'stepfather') NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_contact_id (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des enfants (non-contacts)
CREATE TABLE children (
    id VARCHAR(50) PRIMARY KEY,
    contact_id VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender ENUM('male', 'female', 'other'),
    notes TEXT,
    gifts TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_contact_id (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des relations entre contacts
CREATE TABLE relationships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id VARCHAR(50) NOT NULL,
    related_contact_id VARCHAR(50) NOT NULL,
    relation_type ENUM('spouse', 'child', 'parent', 'father', 'mother', 'sibling', 'cousin', 'stepmother', 'stepfather', 'friend', 'colleague', 'other') NOT NULL,
    custom_relation_label VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (related_contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_contact_id (contact_id),
    INDEX idx_related_contact_id (related_contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des profils utilisateurs (séparée de users pour plus de flexibilité)
CREATE TABLE user_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    date_of_birth DATE,
    bio TEXT,
    photo TEXT,
    -- Paramètres de confidentialité
    privacy_profile_public      TINYINT(1) NOT NULL DEFAULT 1,
    privacy_show_online         TINYINT(1) NOT NULL DEFAULT 1,
    privacy_allow_search_email  TINYINT(1) NOT NULL DEFAULT 1,
    privacy_allow_search_phone  TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des demandes d'amis entre utilisateurs GoodFriends
CREATE TABLE friend_requests (
    id VARCHAR(50) PRIMARY KEY,
    sender_id VARCHAR(50) NOT NULL,
    receiver_id VARCHAR(50) NOT NULL,
    status ENUM('pending', 'accepted', 'rejected', 'deleted') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sender (sender_id),
    INDEX idx_receiver (receiver_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table des groupes de conversation (messagerie)
CREATE TABLE group_chats (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Membres des groupes de conversation
CREATE TABLE group_chat_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    photo LONGTEXT,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_member (group_id, user_id),
    INDEX idx_group_id (group_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Messages des groupes de conversation
CREATE TABLE group_chat_messages (
    id VARCHAR(100) PRIMARY KEY,
    group_id VARCHAR(50) NOT NULL,
    sender_id VARCHAR(50) NOT NULL,
    sender_name VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES group_chats(id) ON DELETE CASCADE,
    INDEX idx_group_created (group_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Données de test (optionnel)
-- Décommentez pour créer un compte de test

/*
INSERT INTO users (id, email, password, first_name, last_name, is_verified)
VALUES ('test_user_1', 'test@goodfriends.com', MD5('password123'), 'Jean', 'Dupont', TRUE);

INSERT INTO groups (id, user_id, name, type)
VALUES 
    ('group_1', 'test_user_1', 'Famille', 'family'),
    ('group_2', 'test_user_1', 'Amis', 'friends'),
    ('group_3', 'test_user_1', 'Travail', 'work');
*/

-- ─── Migration : ajout des colonnes de confidentialité à user_profiles ────────
-- À exécuter sur une base existante (ne pas relancer si DROP TABLE ci-dessus)
-- ALTER TABLE user_profiles
--   ADD COLUMN privacy_profile_public      TINYINT(1) NOT NULL DEFAULT 1 AFTER photo,
--   ADD COLUMN privacy_show_online         TINYINT(1) NOT NULL DEFAULT 1 AFTER privacy_profile_public,
--   ADD COLUMN privacy_allow_search_email  TINYINT(1) NOT NULL DEFAULT 1 AFTER privacy_show_online,
--   ADD COLUMN privacy_allow_search_phone  TINYINT(1) NOT NULL DEFAULT 1 AFTER privacy_allow_search_email;

-- ─── Migration : ajout du statut en ligne dans users ──────────────────────────
le statut en ligne (dans les options de confide,tialité) est affiché où si activé ?