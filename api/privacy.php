<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$userId = verifyToken();

// GET - Récupérer les paramètres de confidentialité
if ($method === 'GET') {
    $query = "SELECT 
                privacy_profile_public,
                privacy_show_online,
                privacy_allow_search_email,
                privacy_allow_search_phone
              FROM user_profiles
              WHERE user_id = :user_id";

    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $userId);
    $stmt->execute();

    if ($stmt->rowCount() === 0) {
        // Profil inexistant : renvoyer les valeurs par défaut
        sendResponse(true, 'Paramètres par défaut', [
            'isProfilePublic'     => true,
            'showOnlineStatus'    => true,
            'allowSearchByEmail'  => true,
            'allowSearchByPhone'  => true,
        ]);
    }

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    sendResponse(true, 'Paramètres récupérés', [
        'isProfilePublic'     => (bool) $row['privacy_profile_public'],
        'showOnlineStatus'    => (bool) $row['privacy_show_online'],
        'allowSearchByEmail'  => (bool) $row['privacy_allow_search_email'],
        'allowSearchByPhone'  => (bool) $row['privacy_allow_search_phone'],
    ]);
}

// PUT - Mettre à jour les paramètres de confidentialité
if ($method === 'PUT') {
    if (!is_array($data)) {
        sendResponse(false, 'Données invalides', null, 400);
    }

    // Valider les champs attendus
    $isProfilePublic    = isset($data['isProfilePublic'])    ? (int)(bool)$data['isProfilePublic']    : 1;
    $showOnlineStatus   = isset($data['showOnlineStatus'])   ? (int)(bool)$data['showOnlineStatus']   : 1;
    $allowSearchEmail   = isset($data['allowSearchByEmail']) ? (int)(bool)$data['allowSearchByEmail'] : 1;
    $allowSearchPhone   = isset($data['allowSearchByPhone']) ? (int)(bool)$data['allowSearchByPhone'] : 1;

    // Upsert : mettre à jour si existe, insérer sinon
    $query = "INSERT INTO user_profiles 
                (user_id, privacy_profile_public, privacy_show_online, privacy_allow_search_email, privacy_allow_search_phone)
              VALUES 
                (:user_id, :profile_public, :show_online, :search_email, :search_phone)
              ON DUPLICATE KEY UPDATE
                privacy_profile_public    = :profile_public,
                privacy_show_online       = :show_online,
                privacy_allow_search_email = :search_email,
                privacy_allow_search_phone = :search_phone,
                updated_at = CURRENT_TIMESTAMP";

    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id',       $userId);
    $stmt->bindParam(':profile_public', $isProfilePublic, PDO::PARAM_INT);
    $stmt->bindParam(':show_online',    $showOnlineStatus, PDO::PARAM_INT);
    $stmt->bindParam(':search_email',   $allowSearchEmail, PDO::PARAM_INT);
    $stmt->bindParam(':search_phone',   $allowSearchPhone, PDO::PARAM_INT);

    if (!$stmt->execute()) {
        sendResponse(false, 'Erreur lors de la mise à jour', null, 500);
    }

    sendResponse(true, 'Paramètres de confidentialité mis à jour', [
        'isProfilePublic'     => (bool) $isProfilePublic,
        'showOnlineStatus'    => (bool) $showOnlineStatus,
        'allowSearchByEmail'  => (bool) $allowSearchEmail,
        'allowSearchByPhone'  => (bool) $allowSearchPhone,
    ]);
}

sendResponse(false, 'Méthode non autorisée', null, 405);
