-- Migration : table des réactions aux messages
-- À exécuter une seule fois sur la base de données

CREATE TABLE IF NOT EXISTS message_reactions (
    id VARCHAR(50) PRIMARY KEY,
    message_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    emoji VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_message (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_message_id (message_id),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
