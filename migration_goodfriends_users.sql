-- Migration pour ajouter les fonctionnalités GoodFriends
-- Date: 2026-01-28

-- Ajouter la table des profils utilisateurs
CREATE TABLE IF NOT EXISTS user_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    date_of_birth DATE,
    bio TEXT,
    photo TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ajouter la table des demandes d'amis
CREATE TABLE IF NOT EXISTS friend_requests (
    id VARCHAR(50) PRIMARY KEY,
    sender_id VARCHAR(50) NOT NULL,
    receiver_id VARCHAR(50) NOT NULL,
    status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_sender (sender_id),
    INDEX idx_receiver (receiver_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ajouter les colonnes pour marquer les utilisateurs GoodFriends dans la table contacts
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS is_goodfriends_user BOOLEAN DEFAULT FALSE AFTER photo,
ADD COLUMN IF NOT EXISTS goodfriends_user_id VARCHAR(50) AFTER is_goodfriends_user,
ADD INDEX idx_goodfriends_user_id (goodfriends_user_id);

-- Ajouter la contrainte de clé étrangère si elle n'existe pas
ALTER TABLE contacts
ADD CONSTRAINT fk_goodfriends_user_id 
FOREIGN KEY (goodfriends_user_id) 
REFERENCES users(id) 
ON DELETE SET NULL;

-- Migrer les données existantes de users vers user_profiles
INSERT INTO user_profiles (user_id, first_name, last_name, phone, date_of_birth, bio, photo)
SELECT id, first_name, last_name, phone, date_of_birth, bio, photo
FROM users
WHERE id NOT IN (SELECT user_id FROM user_profiles);

-- Note: Après cette migration, vous pouvez optionnellement supprimer les colonnes
-- first_name, last_name, phone, date_of_birth, bio, photo de la table users
-- si vous souhaitez nettoyer la structure, mais ce n'est pas obligatoire.

-- Afficher le résultat
SELECT 'Migration terminée avec succès!' as status;
