<?php
require_once 'config.php';

$db = new Database();
$conn = $db->getConnection();

$userId = verifyToken(); // verifyToken() retourne directement l'user_id (string)

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    // Heartbeat : mettre à jour last_seen pour l'utilisateur courant (offline = quitter l'application)
    $data = json_decode(file_get_contents('php://input'), true);
    $setOffline = is_array($data) && !empty($data['offline']);
    $stmt = $conn->prepare($setOffline
        ? "UPDATE users SET last_seen = NULL WHERE id = :id"
        : "UPDATE users SET last_seen = NOW() WHERE id = :id");
    $stmt->execute([':id' => $userId]);
    sendResponse(true, 'OK');
}

if ($method === 'GET') {
    // Récupérer le statut en ligne de plusieurs utilisateurs
    $rawIds = isset($_GET['user_ids']) ? trim($_GET['user_ids']) : '';
    if (empty($rawIds)) {
        sendResponse(true, 'OK', []);
    }

    // Valider et nettoyer les IDs (uniquement alphanumérique + tirets)
    $ids = [];
    foreach (explode(',', $rawIds) as $id) {
        $id = trim($id);
        if (preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) {
            $ids[] = $id;
        }
    }

    if (empty($ids)) {
        sendResponse(true, 'OK', []);
    }

    // Limiter à 100 IDs par requête
    $ids = array_slice($ids, 0, 100);

    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    // online = last_seen dans les 150 dernières secondes (heartbeat toutes les 60 s) ET privacy_show_online activé.
    // Seuls les amis (demande acceptée) voient le statut ; les autres reçoivent toujours "hors ligne".
    $sql = "
        SELECT u.id,
               CASE
                 WHEN u.last_seen IS NOT NULL
                   AND u.last_seen >= DATE_SUB(NOW(), INTERVAL 150 SECOND)
                   AND COALESCE(p.privacy_show_online, 1) = 1
                   AND (u.id = ? OR EXISTS (
                         SELECT 1 FROM friend_requests fr
                         WHERE fr.status = 'accepted'
                           AND ((fr.sender_id = u.id AND fr.receiver_id = ?)
                             OR (fr.receiver_id = u.id AND fr.sender_id = ?))
                       ))
                 THEN 1
                 ELSE 0
               END AS online
        FROM users u
        LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.id IN ($placeholders)
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute(array_merge([$userId, $userId, $userId], $ids));
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $result = [];
    foreach ($rows as $row) {
        $result[$row['id']] = (bool) $row['online'];
    }

    sendResponse(true, 'OK', $result);
}

sendResponse(false, 'Méthode non supportée', null, 405);
