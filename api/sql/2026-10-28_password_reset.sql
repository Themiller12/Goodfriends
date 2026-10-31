-- Goodfriends - Migration comptes : réinitialisation du mot de passe + durcissement du code de vérification
-- Date: 2026-10-28
-- Objectif: stocker le code de réinitialisation (haché), son expiration et le nombre d'essais,
--           et limiter durée de vie / essais du code de vérification d'inscription.

ALTER TABLE users
  ADD COLUMN reset_code_hash VARCHAR(255) NULL AFTER verification_code,
  ADD COLUMN reset_code_expires_at DATETIME NULL AFTER reset_code_hash,
  ADD COLUMN reset_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER reset_code_expires_at,
  ADD COLUMN verification_expires_at DATETIME NULL AFTER reset_attempts,
  ADD COLUMN verification_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER verification_expires_at;

-- Rollback :
-- ALTER TABLE users
--   DROP COLUMN verification_attempts,
--   DROP COLUMN verification_expires_at,
--   DROP COLUMN reset_attempts,
--   DROP COLUMN reset_code_expires_at,
--   DROP COLUMN reset_code_hash;
