<?php
// Copier ce fichier en config.local.php (non versionné) et renseigner les vraies valeurs.
// Générer JWT_SECRET : php -r "echo bin2hex(random_bytes(32));"
define('DB_HOST', 'localhost');
define('DB_NAME', 'goodfriends');
define('DB_USER', 'goodfriends_app');
define('DB_PASS', '');
define('JWT_SECRET', '');
// Chiffrement des photos : php -r "echo bin2hex(random_bytes(32));" (à conserver : perdue, les photos existantes sont illisibles)
define('PHOTO_ENC_KEY', '');
define('API_BASE_URL', 'https://example.com/goodfriends/api');
