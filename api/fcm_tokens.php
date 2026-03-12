<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$userId = verifyToken();

// POST - Enregistrer ou mettre à jour un token FCM
if ($method === 'POST') {
    
    if (!isset($data['token'])) {
        sendResponse(false, 'Token FCM requis', null, 400);
    }
    
    $token = $data['token'];
    $platform = $data['platform'] ?? 'android';
    
    // Vérifier si le token existe déjà pour cet utilisateur
    $checkQuery = "SELECT id FROM user_fcm_tokens WHERE user_id = :user_id AND platform = :platform";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':user_id', $userId);
    $checkStmt->bindParam(':platform', $platform);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() > 0) {
        // Mettre à jour le token existant
        $query = "UPDATE user_fcm_tokens SET token = :token, updated_at = NOW() 
                  WHERE user_id = :user_id AND platform = :platform";
    } else {
        // Insérer un nouveau token
        $query = "INSERT INTO user_fcm_tokens (user_id, token, platform) 
                  VALUES (:user_id, :token, :platform)";
    }
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $userId);
    $stmt->bindParam(':token', $token);
    $stmt->bindParam(':platform', $platform);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Token FCM enregistré avec succès');
    } else {
        sendResponse(false, 'Erreur lors de l\'enregistrement du token', null, 500);
    }
}

// DELETE - Supprimer le token FCM (déconnexion)
if ($method === 'DELETE') {
    
    $platform = $_GET['platform'] ?? 'android';
    
    $query = "DELETE FROM user_fcm_tokens WHERE user_id = :user_id AND platform = :platform";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $userId);
    $stmt->bindParam(':platform', $platform);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Token FCM supprimé avec succès');
    } else {
        sendResponse(false, 'Erreur lors de la suppression du token', null, 500);
    }
}
