<?php
require_once 'config.php';
require_once 'Mailer.php';  // PHPMailer SMTP — configurer les credentials dans Mailer.php
require_once 'rate_limit.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$rawData = file_get_contents('php://input');
$data = json_decode($rawData, true);

// Vérifier si les données JSON sont valides
if ($rawData && json_last_error() !== JSON_ERROR_NONE) {
    sendResponse(false, 'JSON invalide: ' . json_last_error_msg(), null, 400);
}

// ─── Les fonctions sendVerificationEmail() et sendWelcomeEmail() sont définies dans Mailer.php ──

const PASSWORD_RESET_TTL_MINUTES = 15;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const VERIFICATION_TTL_MINUTES = 30;
const VERIFICATION_MAX_ATTEMPTS = 5;

// Politique de mot de passe : 8 caractères minimum avec lettre, chiffre et caractère spécial.
function validatePasswordStrength($password) {
    if (!is_string($password) || strlen($password) < 8) {
        return 'Le mot de passe doit contenir au moins 8 caractères';
    }
    if (strlen($password) > 72) {
        return 'Le mot de passe ne doit pas dépasser 72 caractères';
    }
    if (!preg_match('/\p{L}/u', $password)) {
        return 'Le mot de passe doit contenir au moins une lettre';
    }
    if (!preg_match('/\d/', $password)) {
        return 'Le mot de passe doit contenir au moins un chiffre';
    }
    if (!preg_match('/[^\p{L}\p{N}\s]/u', $password)) {
        return 'Le mot de passe doit contenir au moins un caractère spécial';
    }
    return null;
}

// REGISTER - Créer un nouveau compte
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'register') {
    
    if (!$data || !isset($data['email']) || !isset($data['password']) || 
        !isset($data['firstName']) || !isset($data['lastName'])) {
        sendResponse(false, 'Données manquantes', null, 400);
    }

    $passwordError = validatePasswordStrength($data['password']);
    if ($passwordError !== null) {
        sendResponse(false, $passwordError, null, 400);
    }
    
    // Chaque inscription envoie un email : limiter par IP et par adresse
    rateLimitConsume($db, 'register-ip', clientIp(), 5, 3600);
    rateLimitConsume($db, 'register-email', (string)$data['email'], 3, 3600);
    
    // Vérifier si l'email existe déjà
    $query = "SELECT id FROM users WHERE email = :email";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $data['email']);
    $stmt->execute();
    
    if ($stmt->rowCount() > 0) {
        sendResponse(false, 'Un compte avec cet email existe déjà', null, 409);
    }
    
    // Générer le code de vérification
    $verificationCode = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    
    // Créer le compte
    $userId = generateId();
    $hashedPassword = password_hash($data['password'], PASSWORD_BCRYPT);
    
    $query = "INSERT INTO users (id, email, password, first_name, last_name, verification_code, verification_expires_at, verification_attempts, is_verified) 
              VALUES (:id, :email, :password, :first_name, :last_name, :verification_code,
                      DATE_ADD(NOW(), INTERVAL " . VERIFICATION_TTL_MINUTES . " MINUTE), 0, FALSE)";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $userId);
    $stmt->bindParam(':email', $data['email']);
    $stmt->bindParam(':password', $hashedPassword);
    $stmt->bindParam(':first_name', $data['firstName']);
    $stmt->bindParam(':last_name', $data['lastName']);
    $stmt->bindParam(':verification_code', $verificationCode);
    
    if ($stmt->execute()) {
        // Envoyer le mail de vérification réel
        $emailSent = sendVerificationEmail($data['email'], $data['firstName'], $verificationCode);
        if (!$emailSent) {
            // Éviter les comptes non vérifiables si l'email ne part pas.
            $cleanupQuery = "DELETE FROM users WHERE id = :id";
            $cleanupStmt = $db->prepare($cleanupQuery);
            $cleanupStmt->bindParam(':id', $userId);
            $cleanupStmt->execute();

            sendResponse(
                false,
                'Impossible d\'envoyer l\'email de vérification. Veuillez réessayer plus tard.',
                null,
                500
            );
        }

        sendResponse(true, 'Compte créé. Un email de vérification a été envoyé.', [
            'userId' => $userId,
            'email'  => $data['email'],
        ], 201);
    } else {
        sendResponse(false, 'Erreur lors de la création du compte', null, 500);
    }
}

// LOGIN - Se connecter
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'login') {
    
    if (!isset($data['email']) || !isset($data['password'])) {
        sendResponse(false, 'Email et mot de passe requis', null, 400);
    }
    
    $loginEmail = is_string($data['email']) ? trim($data['email']) : '';
    rateLimitCheck($db, 'login-ip', clientIp(), 30, 900);
    rateLimitCheck($db, 'login-email', $loginEmail, 8, 900);
    
    $query = "SELECT * FROM users WHERE email = :email";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $loginEmail);
    $stmt->execute();
    
    // Message identique pour un email inconnu et un mot de passe erroné (pas d'énumération de comptes)
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user || !is_string($data['password']) || !password_verify($data['password'], $user['password'])) {
        rateLimitHit($db, 'login-ip', clientIp());
        rateLimitHit($db, 'login-email', $loginEmail);
        sendResponse(false, 'Email ou mot de passe incorrect', null, 401);
    }
    
    rateLimitReset($db, 'login-email', $loginEmail);
    
    if (!$user['is_verified']) {
        sendResponse(false, 'UNVERIFIED', null, 403);
    }
    
    // Mettre à jour last_login
    $updateQuery = "UPDATE users SET last_login = NOW() WHERE id = :id";
    $updateStmt = $db->prepare($updateQuery);
    $updateStmt->bindParam(':id', $user['id']);
    $updateStmt->execute();
    
    // Créer le token
    $token = createToken($user['id']);
    
    sendResponse(true, 'Connexion réussie', [
        'token' => $token,
        'user' => [
            'id' => $user['id'],
            'email' => $user['email'],
            'firstName' => $user['first_name'],
            'lastName' => $user['last_name'],
            'phone' => $user['phone'],
            'dateOfBirth' => $user['date_of_birth'],
            'bio' => $user['bio'],
            'photo' => $user['photo']
        ]
    ]);
}

// VERIFY - Vérifier le code
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'verify') {
    
    if (!isset($data['email'], $data['code']) || !is_string($data['email']) || !is_string($data['code'])) {
        sendResponse(false, 'Email et code requis', null, 400);
    }
    
    // Limite par IP en plus du nombre d'essais par compte
    rateLimitConsume($db, 'verify-ip', clientIp(), 30, 900);
    
    $query = "SELECT id, verification_code, verification_attempts,
                     (verification_expires_at IS NOT NULL AND verification_expires_at > NOW()) AS code_valid
              FROM users WHERE email = :email AND is_verified = FALSE";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $data['email']);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // 400 (et non 401) : ApiClient déconnecte l'utilisateur sur 401
    $invalidMessage = 'Code de vérification invalide ou expiré';
    if (!$user || empty($user['verification_code']) || !$user['code_valid']
        || (int)$user['verification_attempts'] >= VERIFICATION_MAX_ATTEMPTS) {
        sendResponse(false, $invalidMessage, null, 400);
    }
    
    if (!hash_equals($user['verification_code'], trim($data['code']))) {
        $attempts = $db->prepare("UPDATE users SET verification_attempts = verification_attempts + 1 WHERE id = :id");
        $attempts->bindParam(':id', $user['id']);
        $attempts->execute();
        sendResponse(false, $invalidMessage, null, 400);
    }
    
    // Marquer comme vérifié
    $updateQuery = "UPDATE users SET is_verified = TRUE, verification_code = NULL,
                    verification_expires_at = NULL, verification_attempts = 0 WHERE id = :id";
    $updateStmt = $db->prepare($updateQuery);
    $updateStmt->bindParam(':id', $user['id']);
    $updateStmt->execute();

    // Envoyer l'email de bienvenue
    $profileQuery = "SELECT first_name, email FROM users WHERE id = :id";
    $profileStmt = $db->prepare($profileQuery);
    $profileStmt->bindParam(':id', $user['id']);
    $profileStmt->execute();
    $profile = $profileStmt->fetch(PDO::FETCH_ASSOC);
    if ($profile) {
        sendWelcomeEmail($profile['email'], $profile['first_name']);
    }

    $token = createToken($user['id']);

    sendResponse(true, 'Compte vérifié avec succès', ['token' => $token]);
}

// RESEND CODE - Renvoyer le code de vérification
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'resend') {
    
    if (!isset($data['email']) || !is_string($data['email'])) {
        sendResponse(false, 'Email requis', null, 400);
    }
    
    rateLimitConsume($db, 'resend-ip', clientIp(), 10, 3600);
    rateLimitConsume($db, 'resend-email', $data['email'], 5, 3600);
    
    // Réponse identique que le compte existe ou non ; un code par minute au maximum
    $nameStmt = $db->prepare(
        "SELECT id, first_name,
                (verification_expires_at IS NOT NULL
                 AND verification_expires_at > DATE_ADD(NOW(), INTERVAL " . (VERIFICATION_TTL_MINUTES - 1) . " MINUTE)) AS recently_sent
         FROM users WHERE email = :email AND is_verified = FALSE"
    );
    $nameStmt->bindParam(':email', $data['email']);
    $nameStmt->execute();
    $row = $nameStmt->fetch(PDO::FETCH_ASSOC);

    if ($row && !$row['recently_sent']) {
        $newCode = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $stmt = $db->prepare(
            "UPDATE users
             SET verification_code = :code,
                 verification_expires_at = DATE_ADD(NOW(), INTERVAL " . VERIFICATION_TTL_MINUTES . " MINUTE),
                 verification_attempts = 0
             WHERE id = :id"
        );
        $stmt->bindParam(':code', $newCode);
        $stmt->bindParam(':id', $row['id']);
        $stmt->execute();

        if (!sendVerificationEmail($data['email'], $row['first_name'], $newCode)) {
            error_log('resend: envoi impossible: ' . getLastMailerError());
            sendResponse(false, 'Impossible d\'envoyer le code de vérification. Veuillez réessayer plus tard.', null, 500);
        }
    }

    sendResponse(true, 'Si le compte existe, un nouveau code a été envoyé par email');
}

// FORGOT PASSWORD - Envoyer un code de réinitialisation par email
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'forgot-password') {

    if (!isset($data['email']) || !is_string($data['email']) || trim($data['email']) === '') {
        sendResponse(false, 'Email requis', null, 400);
    }

    $email = trim($data['email']);
    rateLimitConsume($db, 'forgot-ip', clientIp(), 5, 3600);
    rateLimitConsume($db, 'forgot-email', $email, 3, 3600);
    $stmt = $db->prepare(
        "SELECT id, first_name,
                (reset_code_expires_at IS NOT NULL
                 AND reset_code_expires_at > DATE_ADD(NOW(), INTERVAL " . (PASSWORD_RESET_TTL_MINUTES - 1) . " MINUTE)) AS recently_sent
         FROM users WHERE email = :email"
    );
    $stmt->bindParam(':email', $email);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // Un code par minute au maximum ; réponse identique que le compte existe ou non.
    if ($user && !$user['recently_sent']) {
        $resetCode = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $resetHash = password_hash($resetCode, PASSWORD_BCRYPT);

        $update = $db->prepare(
            "UPDATE users
             SET reset_code_hash = :hash,
                 reset_code_expires_at = DATE_ADD(NOW(), INTERVAL " . PASSWORD_RESET_TTL_MINUTES . " MINUTE),
                 reset_attempts = 0
             WHERE id = :id"
        );
        $update->bindParam(':hash', $resetHash);
        $update->bindParam(':id', $user['id']);
        $update->execute();

        if (!sendPasswordResetEmail($email, $user['first_name'], $resetCode, PASSWORD_RESET_TTL_MINUTES)) {
            error_log('forgot-password: envoi impossible: ' . getLastMailerError());
        }
    }

    sendResponse(true, 'Si un compte existe pour cet email, un code de réinitialisation vient d\'être envoyé.');
}

// RESET PASSWORD - Définir un nouveau mot de passe avec le code reçu par email
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'reset-password') {

    if (!isset($data['email'], $data['code'], $data['newPassword'])
        || !is_string($data['email']) || !is_string($data['code']) || !is_string($data['newPassword'])) {
        sendResponse(false, 'Email, code et nouveau mot de passe requis', null, 400);
    }

    $passwordError = validatePasswordStrength($data['newPassword']);
    if ($passwordError !== null) {
        sendResponse(false, $passwordError, null, 400);
    }

    $email = trim($data['email']);
    rateLimitConsume($db, 'reset-ip', clientIp(), 20, 900);
    $stmt = $db->prepare(
        "SELECT id, reset_code_hash, reset_attempts,
                (reset_code_expires_at IS NOT NULL AND reset_code_expires_at > NOW()) AS code_valid
         FROM users WHERE email = :email"
    );
    $stmt->bindParam(':email', $email);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // 400 (et non 401) : ApiClient déconnecte l'utilisateur sur 401
    $invalidMessage = 'Code invalide ou expiré';
    if (!$user || empty($user['reset_code_hash']) || !$user['code_valid']
        || (int)$user['reset_attempts'] >= PASSWORD_RESET_MAX_ATTEMPTS) {
        sendResponse(false, $invalidMessage, null, 400);
    }

    if (!password_verify(trim($data['code']), $user['reset_code_hash'])) {
        $attempts = $db->prepare("UPDATE users SET reset_attempts = reset_attempts + 1 WHERE id = :id");
        $attempts->bindParam(':id', $user['id']);
        $attempts->execute();
        sendResponse(false, $invalidMessage, null, 400);
    }

    $newHash = password_hash($data['newPassword'], PASSWORD_BCRYPT);
    $update = $db->prepare(
        "UPDATE users
         SET password = :password, reset_code_hash = NULL, reset_code_expires_at = NULL,
             reset_attempts = 0, updated_at = NOW()
         WHERE id = :id"
    );
    $update->bindParam(':password', $newHash);
    $update->bindParam(':id', $user['id']);
    $update->execute();

    sendResponse(true, 'Mot de passe modifié avec succès');
}

// CHANGE PASSWORD - Modifier le mot de passe depuis le profil (utilisateur connecté)
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'change-password') {

    $userId = verifyToken();

    if (!isset($data['currentPassword'], $data['newPassword'])
        || !is_string($data['currentPassword']) || !is_string($data['newPassword'])) {
        sendResponse(false, 'Mot de passe actuel et nouveau mot de passe requis', null, 400);
    }

    $passwordError = validatePasswordStrength($data['newPassword']);
    if ($passwordError !== null) {
        sendResponse(false, $passwordError, null, 400);
    }

    $stmt = $db->prepare("SELECT password FROM users WHERE id = :id");
    $stmt->bindParam(':id', $userId);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // 400 (et non 401) : ApiClient déconnecte l'utilisateur sur 401
    rateLimitCheck($db, 'change-password-user', $userId, 5, 900);
    if (!$user || !password_verify($data['currentPassword'], $user['password'])) {
        rateLimitHit($db, 'change-password-user', $userId);
        sendResponse(false, 'Mot de passe actuel incorrect', null, 400);
    }

    if (hash_equals($data['currentPassword'], $data['newPassword'])) {
        sendResponse(false, 'Le nouveau mot de passe doit être différent de l\'actuel', null, 400);
    }

    $newHash = password_hash($data['newPassword'], PASSWORD_BCRYPT);
    $update = $db->prepare("UPDATE users SET password = :password, updated_at = NOW() WHERE id = :id");
    $update->bindParam(':password', $newHash);
    $update->bindParam(':id', $userId);
    $update->execute();

    sendResponse(true, 'Mot de passe modifié avec succès');
}

// GET PROFILE - Obtenir le profil de l'utilisateur connecté
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'profile') {
    
    $userId = verifyToken();
    
    $query = "SELECT * FROM users WHERE id = :id";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $userId);
    $stmt->execute();
    
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    sendResponse(true, 'Profil récupéré', [
        'id' => $user['id'],
        'email' => $user['email'],
        'firstName' => $user['first_name'],
        'lastName' => $user['last_name'],
        'phone' => $user['phone'],
        'dateOfBirth' => $user['date_of_birth'],
        'bio' => $user['bio'],
        'photo' => $user['photo']
    ]);
}

// UPDATE PROFILE - Mettre à jour le profil
if ($method === 'PUT' && isset($_GET['action']) && $_GET['action'] === 'profile') {
    
    $userId = verifyToken();
    
    // Convertir la date ISO en format MySQL si présente
    $dateOfBirth = null;
    if (isset($data['dateOfBirth']) && !empty($data['dateOfBirth'])) {
        try {
            $date = new DateTime($data['dateOfBirth']);
            $dateOfBirth = $date->format('Y-m-d');
        } catch (Exception $e) {
            // Si la conversion échoue, on laisse null
            $dateOfBirth = null;
        }
    }
    
    $query = "UPDATE users SET 
              first_name = :first_name,
              last_name = :last_name,
              phone = :phone,
              date_of_birth = :date_of_birth,
              bio = :bio,
              photo = :photo,
              updated_at = NOW()
              WHERE id = :id";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':first_name', $data['firstName']);
    $stmt->bindParam(':last_name', $data['lastName']);
    $stmt->bindParam(':phone', $data['phone']);
    $stmt->bindParam(':date_of_birth', $dateOfBirth);
    $stmt->bindParam(':bio', $data['bio']);
    $stmt->bindParam(':photo', $data['photo']);
    $stmt->bindParam(':id', $userId);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Profil mis à jour avec succès');
    } else {
        sendResponse(false, 'Erreur lors de la mise à jour', null, 500);
    }
}

sendResponse(false, 'Action non reconnue', null, 400);
?>
