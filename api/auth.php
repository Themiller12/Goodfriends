<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$rawData = file_get_contents('php://input');
$data = json_decode($rawData, true);

// Vérifier si les données JSON sont valides
if ($rawData && json_last_error() !== JSON_ERROR_NONE) {
    sendResponse(false, 'JSON invalide: ' . json_last_error_msg(), null, 400);
}

// ─── Fonctions d'envoi d'email ────────────────────────────────────────────────

function sendVerificationEmail($email, $firstName, $code) {
    $subject = 'Votre code de vérification GoodFriends';
    $htmlBody = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f4ea;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#9c6b3c;padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">GoodFriends</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Gardons le contact</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <h2 style="color:#383830;font-size:20px;margin:0 0 12px;">Bonjour ' . htmlspecialchars($firstName) . ' 👋</h2>
        <p style="color:#65655c;font-size:15px;line-height:1.6;margin:0 0 28px;">
          Merci de vous inscrire sur <strong>GoodFriends</strong> ! Entrez le code ci-dessous pour activer votre compte.
        </p>
        <div style="background:#f8f4ea;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px;">
          <p style="margin:0 0 8px;color:#65655c;font-size:13px;text-transform:uppercase;letter-spacing:1px;">Code de vérification</p>
          <p style="margin:0;font-size:42px;font-weight:bold;letter-spacing:10px;color:#9c6b3c;">' . $code . '</p>
        </div>
        <p style="color:#aaa;font-size:13px;margin:0;">Ce code expire dans <strong>30 minutes</strong>. Ne le partagez avec personne.</p>
      </td></tr>
      <tr><td style="background:#f8f4ea;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#aaa;font-size:12px;">&copy; ' . date('Y') . ' GoodFriends</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>';
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: GoodFriends <noreply@goodfriends.app>\r\n";
    $headers .= "Reply-To: noreply@goodfriends.app\r\n";
    return mail($email, $subject, $htmlBody, $headers);
}

function sendWelcomeEmail($email, $firstName) {
    $subject = 'Bienvenue sur GoodFriends ! 🎉';
    $htmlBody = '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f4ea;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#9c6b3c;padding:32px 40px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">GoodFriends</h1>
        <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Gardons le contact</p>
      </td></tr>
      <tr><td style="padding:40px;">
        <h2 style="color:#383830;font-size:22px;margin:0 0 12px;">🎉 Bienvenue, ' . htmlspecialchars($firstName) . ' !</h2>
        <p style="color:#65655c;font-size:15px;line-height:1.6;margin:0 0 20px;">
          Votre compte <strong>GoodFriends</strong> est activé. Connectez-vous et commencez à entretenir vos relations avec ceux qui comptent.
        </p>
        <div style="background:#f8f4ea;border-radius:12px;padding:24px;margin:0 0 28px;">
          <p style="margin:0 0 10px;color:#383830;font-size:15px;font-weight:bold;">Avec GoodFriends vous pouvez :</p>
          <ul style="margin:0;padding-left:20px;color:#65655c;font-size:14px;line-height:2;">
            <li>Organiser vos contacts et ne plus oublier un anniversaire 🎂</li>
            <li>Prendre des nouvelles de vos proches au bon moment 💛</li>
            <li>Envoyer des messages directement depuis l\'app 💬</li>
          </ul>
        </div>
        <p style="color:#aaa;font-size:13px;margin:0;">Besoin d\'aide ? <a href="mailto:support@goodfriends.app" style="color:#9c6b3c;">support@goodfriends.app</a></p>
      </td></tr>
      <tr><td style="background:#f8f4ea;padding:20px 40px;text-align:center;">
        <p style="margin:0;color:#aaa;font-size:12px;">&copy; ' . date('Y') . ' GoodFriends</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>';
    $headers  = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: GoodFriends <noreply@goodfriends.app>\r\n";
    $headers .= "Reply-To: noreply@goodfriends.app\r\n";
    return mail($email, $subject, $htmlBody, $headers);
}

// REGISTER - Créer un nouveau compte
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'register') {
    
    if (!$data || !isset($data['email']) || !isset($data['password']) || 
        !isset($data['firstName']) || !isset($data['lastName'])) {
        sendResponse(false, 'Données manquantes. Reçu: ' . json_encode($data), null, 400);
    }
    
    // Vérifier si l'email existe déjà
    $query = "SELECT id FROM users WHERE email = :email";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $data['email']);
    $stmt->execute();
    
    if ($stmt->rowCount() > 0) {
        sendResponse(false, 'Un compte avec cet email existe déjà', null, 409);
    }
    
    // Générer le code de vérification
    $verificationCode = str_pad(rand(0, 999999), 6, '0', STR_PAD_LEFT);
    
    // Créer le compte
    $userId = generateId();
    $hashedPassword = password_hash($data['password'], PASSWORD_BCRYPT);
    
    $query = "INSERT INTO users (id, email, password, first_name, last_name, verification_code, is_verified) 
              VALUES (:id, :email, :password, :first_name, :last_name, :verification_code, FALSE)";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $userId);
    $stmt->bindParam(':email', $data['email']);
    $stmt->bindParam(':password', $hashedPassword);
    $stmt->bindParam(':first_name', $data['firstName']);
    $stmt->bindParam(':last_name', $data['lastName']);
    $stmt->bindParam(':verification_code', $verificationCode);
    
    if ($stmt->execute()) {
        // Envoyer le mail de vérification réel
        sendVerificationEmail($data['email'], $data['firstName'], $verificationCode);

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
    
    $query = "SELECT * FROM users WHERE email = :email";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $data['email']);
    $stmt->execute();
    
    if ($stmt->rowCount() === 0) {
        sendResponse(false, 'Email incorrect', null, 401);
    }
    
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!password_verify($data['password'], $user['password'])) {
        sendResponse(false, 'Mot de passe incorrect', null, 401);
    }
    
    if (!$user['is_verified']) {
        sendResponse(false, 'UNVERIFIED', ['verificationCode' => $user['verification_code']], 403);
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
    
    if (!isset($data['email']) || !isset($data['code'])) {
        sendResponse(false, 'Email et code requis', null, 400);
    }
    
    $query = "SELECT id FROM users WHERE email = :email AND verification_code = :code";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':email', $data['email']);
    $stmt->bindParam(':code', $data['code']);
    $stmt->execute();
    
    if ($stmt->rowCount() === 0) {
        sendResponse(false, 'Code de vérification incorrect', null, 401);
    }
    
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // Marquer comme vérifié
    $updateQuery = "UPDATE users SET is_verified = TRUE, verification_code = NULL WHERE id = :id";
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
    
    if (!isset($data['email'])) {
        sendResponse(false, 'Email requis', null, 400);
    }
    
    $newCode = str_pad(rand(0, 999999), 6, '0', STR_PAD_LEFT);
    
    $query = "UPDATE users SET verification_code = :code WHERE email = :email AND is_verified = FALSE";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':code', $newCode);
    $stmt->bindParam(':email', $data['email']);
    
    if ($stmt->execute() && $stmt->rowCount() > 0) {
        // Récupérer le prénom pour l'email
        $nameQuery = "SELECT first_name FROM users WHERE email = :email";
        $nameStmt = $db->prepare($nameQuery);
        $nameStmt->bindParam(':email', $data['email']);
        $nameStmt->execute();
        $row = $nameStmt->fetch(PDO::FETCH_ASSOC);
        $firstName = $row ? $row['first_name'] : '';

        sendVerificationEmail($data['email'], $firstName, $newCode);
        sendResponse(true, 'Nouveau code envoyé par email');
    } else {
        sendResponse(false, 'Erreur lors de l\'envoi du code', null, 500);
    }
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

// Debug: afficher ce qui a été reçu
sendResponse(false, 'Action non reconnue. Method: ' . $method . ', Action: ' . (isset($_GET['action']) ? $_GET['action'] : 'NON DEFINI'), [
    'method' => $method,
    'action' => isset($_GET['action']) ? $_GET['action'] : null,
    'data' => $data
], 400);
?>
