<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$userId = verifyToken();

// GET - Préférences de notification de l'utilisateur
if ($method === 'GET') {
    $stmt = $db->prepare("SELECT notify_messages FROM user_profiles WHERE user_id = :user_id");
    $stmt->bindParam(':user_id', $userId);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    sendResponse(true, 'Préférences récupérées', [
        'messageNotificationsEnabled' => $row ? (bool) $row['notify_messages'] : true,
    ]);
}

// PUT - Mettre à jour les préférences de notification
if ($method === 'PUT') {
    if (!is_array($data) || !isset($data['messageNotificationsEnabled'])) {
        sendResponse(false, 'messageNotificationsEnabled requis', null, 400);
    }

    $enabled = (int) (bool) $data['messageNotificationsEnabled'];

    $stmt = $db->prepare(
        "INSERT INTO user_profiles (user_id, notify_messages)
         VALUES (:user_id, :enabled)
         ON DUPLICATE KEY UPDATE notify_messages = :enabled2, updated_at = CURRENT_TIMESTAMP"
    );
    $stmt->bindParam(':user_id', $userId);
    $stmt->bindParam(':enabled', $enabled, PDO::PARAM_INT);
    $stmt->bindParam(':enabled2', $enabled, PDO::PARAM_INT);

    if (!$stmt->execute()) {
        sendResponse(false, 'Erreur lors de la mise à jour', null, 500);
    }

    sendResponse(true, 'Préférences mises à jour', [
        'messageNotificationsEnabled' => (bool) $enabled,
    ]);
}

sendResponse(false, 'Méthode non autorisée', null, 405);
