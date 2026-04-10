<?php
require_once 'config.php';
require_once 'FCMService.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$userId = verifyToken();

$action = isset($_GET['action']) ? $_GET['action'] : '';

try {
    switch ($method) {
        case 'GET':
            if ($action === 'conversation') {
                // Récupérer l'historique des messages avec un utilisateur
                $otherUserId = isset($_GET['otherUserId']) ? $_GET['otherUserId'] : '';
                
                if (empty($otherUserId)) {
                    sendResponse(false, 'otherUserId requis', null, 400);
                }

                // Pagination : charger les 100 derniers, ou les 100 avant une date donnée
                $before = isset($_GET['before']) && !empty($_GET['before']) ? $_GET['before'] : null;

                if ($before !== null) {
                    $stmt = $db->prepare("
                        SELECT m.*, 
                               u1.email as sender_email,
                               u2.email as receiver_email,
                               rm.message as reply_to_message,
                               rm.sender_id as reply_to_sender_id
                        FROM messages m
                        LEFT JOIN users u1 ON m.sender_id = u1.id
                        LEFT JOIN users u2 ON m.receiver_id = u2.id
                        LEFT JOIN messages rm ON m.reply_to_id = rm.id
                        WHERE ((m.sender_id = :user_id1 AND m.receiver_id = :other_id1)
                            OR (m.sender_id = :other_id2 AND m.receiver_id = :user_id2))
                          AND m.created_at < :before
                        ORDER BY m.created_at DESC
                        LIMIT 100
                    ");
                    $stmt->bindParam(':user_id1', $userId);
                    $stmt->bindParam(':other_id1', $otherUserId);
                    $stmt->bindParam(':other_id2', $otherUserId);
                    $stmt->bindParam(':user_id2', $userId);
                    $stmt->bindParam(':before', $before);
                } else {
                    $stmt = $db->prepare("
                        SELECT m.*, 
                               u1.email as sender_email,
                               u2.email as receiver_email,
                               rm.message as reply_to_message,
                               rm.sender_id as reply_to_sender_id
                        FROM messages m
                        LEFT JOIN users u1 ON m.sender_id = u1.id
                        LEFT JOIN users u2 ON m.receiver_id = u2.id
                        LEFT JOIN messages rm ON m.reply_to_id = rm.id
                        WHERE (m.sender_id = :user_id1 AND m.receiver_id = :other_id1)
                           OR (m.sender_id = :other_id2 AND m.receiver_id = :user_id2)
                        ORDER BY m.created_at DESC
                        LIMIT 100
                    ");
                    $stmt->bindParam(':user_id1', $userId);
                    $stmt->bindParam(':other_id1', $otherUserId);
                    $stmt->bindParam(':other_id2', $otherUserId);
                    $stmt->bindParam(':user_id2', $userId);
                }
                $stmt->execute();
                
                $messages = [];
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $messages[] = [
                        'id' => $row['id'],
                        'senderId' => $row['sender_id'],
                        'receiverId' => $row['receiver_id'],
                        'message' => $row['message'],
                        'photoUrl' => $row['photo_url'] ?? null,
                        'isRead' => (bool)$row['is_read'],
                        'createdAt' => $row['created_at'],
                        'senderEmail' => $row['sender_email'],
                        'receiverEmail' => $row['receiver_email'],
                        'replyToId' => $row['reply_to_id'] ?? null,
                        'replyToMessage' => $row['reply_to_message'] ?? null,
                        'replyToSenderId' => $row['reply_to_sender_id'] ?? null,
                        'reactions' => [],
                    ];
                }

                // Attacher les réactions
                if (!empty($messages)) {
                    $msgIds = array_column($messages, 'id');
                    $placeholders = implode(',', array_fill(0, count($msgIds), '?'));
                    $reactionStmt = $db->prepare(
                        "SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN ($placeholders)"
                    );
                    $reactionStmt->execute($msgIds);
                    $reactionsMap = [];
                    while ($r = $reactionStmt->fetch(PDO::FETCH_ASSOC)) {
                        $reactionsMap[$r['message_id']][] = ['emoji' => $r['emoji'], 'userId' => $r['user_id']];
                    }
                    foreach ($messages as &$msg) {
                        $msg['reactions'] = $reactionsMap[$msg['id']] ?? [];
                    }
                    unset($msg);
                }

                // Remettre dans l'ordre chronologique (on a fetchés en DESC)
                $messages = array_reverse($messages);

                sendResponse(true, 'Messages récupérés', $messages);
                
            } elseif ($action === 'conversations') {
                // Récupérer la liste des conversations avec dernier message et nombre de non-lus
                // Ne récupérer que les conversations avec des amis actifs (status = 'accepted')
                $stmt = $db->prepare("
                    SELECT DISTINCT
                        CASE 
                            WHEN m.sender_id = :user_id1 THEN m.receiver_id
                            ELSE m.sender_id
                        END as other_user_id,
                        u.email as other_user_email,
                        up.first_name as other_user_first_name,
                        up.last_name as other_user_last_name,
                        up.phone as other_user_phone,
                        (SELECT message FROM messages 
                         WHERE (sender_id = :user_id2 AND receiver_id = CASE WHEN m.sender_id = :user_id3 THEN m.receiver_id ELSE m.sender_id END) 
                            OR (sender_id = CASE WHEN m.sender_id = :user_id4 THEN m.receiver_id ELSE m.sender_id END AND receiver_id = :user_id5)
                         ORDER BY created_at DESC LIMIT 1) as last_message,
                        (SELECT created_at FROM messages 
                         WHERE (sender_id = :user_id6 AND receiver_id = CASE WHEN m.sender_id = :user_id7 THEN m.receiver_id ELSE m.sender_id END) 
                            OR (sender_id = CASE WHEN m.sender_id = :user_id8 THEN m.receiver_id ELSE m.sender_id END AND receiver_id = :user_id9)
                         ORDER BY created_at DESC LIMIT 1) as last_message_time,
                        (SELECT COUNT(*) FROM messages 
                         WHERE sender_id = CASE WHEN m.sender_id = :user_id10 THEN m.receiver_id ELSE m.sender_id END
                           AND receiver_id = :user_id11
                           AND is_read = FALSE) as unread_count
                    FROM messages m
                    LEFT JOIN users u ON u.id = CASE 
                        WHEN m.sender_id = :user_id12 THEN m.receiver_id
                        ELSE m.sender_id
                    END
                    LEFT JOIN user_profiles up ON u.id = up.user_id
                    WHERE (m.sender_id = :user_id13 OR m.receiver_id = :user_id14)
                    AND EXISTS (
                        SELECT 1 FROM friend_requests fr
                        WHERE (
                            (fr.sender_id = :user_id15 AND fr.receiver_id = CASE WHEN m.sender_id = :user_id16 THEN m.receiver_id ELSE m.sender_id END)
                            OR (fr.sender_id = CASE WHEN m.sender_id = :user_id17 THEN m.receiver_id ELSE m.sender_id END AND fr.receiver_id = :user_id18)
                        )
                        AND fr.status = 'accepted'
                    )
                    GROUP BY other_user_id
                    ORDER BY last_message_time DESC
                ");
                $stmt->bindParam(':user_id1', $userId);
                $stmt->bindParam(':user_id2', $userId);
                $stmt->bindParam(':user_id3', $userId);
                $stmt->bindParam(':user_id4', $userId);
                $stmt->bindParam(':user_id5', $userId);
                $stmt->bindParam(':user_id6', $userId);
                $stmt->bindParam(':user_id7', $userId);
                $stmt->bindParam(':user_id8', $userId);
                $stmt->bindParam(':user_id9', $userId);
                $stmt->bindParam(':user_id10', $userId);
                $stmt->bindParam(':user_id11', $userId);
                $stmt->bindParam(':user_id12', $userId);
                $stmt->bindParam(':user_id13', $userId);
                $stmt->bindParam(':user_id14', $userId);
                $stmt->bindParam(':user_id15', $userId);
                $stmt->bindParam(':user_id16', $userId);
                $stmt->bindParam(':user_id17', $userId);
                $stmt->bindParam(':user_id18', $userId);
                $stmt->execute();
                
                $conversations = [];
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $conversations[] = [
                        'otherUserId' => $row['other_user_id'],
                        'otherUserEmail' => $row['other_user_email'],
                        'otherUserFirstName' => $row['other_user_first_name'],
                        'otherUserLastName' => $row['other_user_last_name'],
                        'otherUserPhone' => $row['other_user_phone'],
                        'lastMessage' => $row['last_message'],
                        'lastMessageTime' => $row['last_message_time'],
                        'unreadCount' => (int)$row['unread_count']
                    ];
                }
                
                sendResponse(true, 'Conversations récupérées', $conversations);
                
            } elseif ($action === 'unread-count') {
                // Récupérer le nombre total de messages non lus
                $stmt = $db->prepare("
                    SELECT COUNT(*) as total
                    FROM messages
                    WHERE receiver_id = :user_id AND is_read = FALSE
                ");
                $stmt->bindParam(':user_id', $userId);
                $stmt->execute();
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                
                sendResponse(true, 'Nombre de messages non lus', ['count' => (int)$row['total']]);
                
            } else {
                sendResponse(false, 'Action non reconnue', null, 400);
            }
            break;
            
        case 'POST':
            if ($action === 'send') {
                // Envoyer un message
                if (!isset($data['receiverId']) || !isset($data['message'])) {
                    sendResponse(false, 'receiverId et message requis', null, 400);
                }
                
                $receiverId = $data['receiverId'];
                $message = trim($data['message']);
                
                if (empty($message)) {
                    sendResponse(false, 'Le message ne peut pas être vide', null, 400);
                }
                
                // Vérifier que les deux utilisateurs sont amis
                $checkFriendship = "SELECT id FROM friend_requests 
                                   WHERE ((sender_id = :user_id1 AND receiver_id = :receiver_id1) 
                                   OR (sender_id = :receiver_id2 AND receiver_id = :user_id2)) 
                                   AND status = 'accepted'";
                $friendStmt = $db->prepare($checkFriendship);
                $friendStmt->bindParam(':user_id1', $userId);
                $friendStmt->bindParam(':receiver_id1', $receiverId);
                $friendStmt->bindParam(':receiver_id2', $receiverId);
                $friendStmt->bindParam(':user_id2', $userId);
                $friendStmt->execute();
                
                if ($friendStmt->rowCount() === 0) {
                    sendResponse(false, 'Vous ne pouvez envoyer des messages qu\'aux utilisateurs avec qui vous êtes ami. Le contact a peut-être été supprimé.', null, 403);
                }
                
                // Vérifier que le destinataire existe
                $stmt = $db->prepare("SELECT id FROM users WHERE id = :id");
                $stmt->bindParam(':id', $receiverId);
                $stmt->execute();
                
                if ($stmt->rowCount() === 0) {
                    sendResponse(false, 'Utilisateur destinataire non trouvé', null, 404);
                }
                
                // Insérer le message
                $replyToId = isset($data['replyToId']) && !empty($data['replyToId']) ? $data['replyToId'] : null;
                $messageId = generateId();
                $stmt = $db->prepare("
                    INSERT INTO messages (id, sender_id, receiver_id, message, reply_to_id, is_read, created_at)
                    VALUES (:id, :sender_id, :receiver_id, :message, :reply_to_id, FALSE, NOW())
                ");
                $stmt->bindParam(':id', $messageId);
                $stmt->bindParam(':sender_id', $userId);
                $stmt->bindParam(':receiver_id', $receiverId);
                $stmt->bindParam(':message', $message);
                $stmt->bindParam(':reply_to_id', $replyToId);
                
                if ($stmt->execute()) {
                    // Récupérer le message créé
                    $stmt = $db->prepare("
                        SELECT m.*, u1.email as sender_email, u2.email as receiver_email,
                               up1.first_name as sender_first_name, up1.last_name as sender_last_name
                        FROM messages m
                        LEFT JOIN users u1 ON m.sender_id = u1.id
                        LEFT JOIN users u2 ON m.receiver_id = u2.id
                        LEFT JOIN user_profiles up1 ON u1.id = up1.user_id
                        WHERE m.id = :id
                    ");
                    $stmt->bindParam(':id', $messageId);
                    $stmt->execute();
                    $row = $stmt->fetch(PDO::FETCH_ASSOC);
                    
                    // Envoyer une notification push au destinataire
                    try {
                        $fcmService = new FCMService();
                        $senderFirstName = trim($row['sender_first_name'] ?? '');
                        $senderLastName  = trim($row['sender_last_name'] ?? '');
                        $senderName = $senderFirstName || $senderLastName
                            ? trim("$senderFirstName $senderLastName")
                            : $row['sender_email'];
                        $conversationId = min($userId, $receiverId) . '_' . max($userId, $receiverId);
                        
                        $fcmService->sendMessageNotification(
                            $db,
                            $receiverId,
                            $userId,
                            $senderFirstName,
                            $senderLastName,
                            $senderName,
                            $message,
                            $conversationId
                        );
                    } catch (Exception $e) {
                        error_log('FCM notification error: ' . $e->getMessage());
                        // Ne pas bloquer l'envoi du message si la notification échoue
                    }
                    
                    sendResponse(true, 'Message envoyé', [
                        'id' => $row['id'],
                        'senderId' => $row['sender_id'],
                        'receiverId' => $row['receiver_id'],
                        'message' => $row['message'],
                        'photoUrl' => $row['photo_url'] ?? null,
                        'isRead' => (bool)$row['is_read'],
                        'createdAt' => $row['created_at'],
                        'senderEmail' => $row['sender_email'],
                        'receiverEmail' => $row['receiver_email'],
                        'replyToId' => $row['reply_to_id'] ?? null,
                        'reactions' => [],
                    ], 201);
                } else {
                    sendResponse(false, 'Erreur lors de l\'envoi du message', null, 500);
                }

            } elseif ($action === 'send-photo') {
                // Envoyer une photo dans un message
                if (!isset($data['receiverId']) || !isset($data['photoData']) || !isset($data['mimeType'])) {
                    sendResponse(false, 'receiverId, photoData et mimeType requis', null, 400);
                }

                $receiverId = $data['receiverId'];
                $photoData  = $data['photoData']; // base64 sans préfixe data:...
                $mimeType   = $data['mimeType'];  // image/jpeg | image/png | image/webp
                $caption    = isset($data['caption']) ? trim($data['caption']) : null;

                // Vérifier l'amitié
                $checkFriendship = "SELECT id FROM friend_requests
                                   WHERE ((sender_id = :user_id1 AND receiver_id = :receiver_id1)
                                   OR (sender_id = :receiver_id2 AND receiver_id = :user_id2))
                                   AND status = 'accepted'";
                $friendStmt = $db->prepare($checkFriendship);
                $friendStmt->bindParam(':user_id1', $userId);
                $friendStmt->bindParam(':receiver_id1', $receiverId);
                $friendStmt->bindParam(':receiver_id2', $receiverId);
                $friendStmt->bindParam(':user_id2', $userId);
                $friendStmt->execute();

                if ($friendStmt->rowCount() === 0) {
                    sendResponse(false, 'Vous ne pouvez envoyer des messages qu\'aux amis.', null, 403);
                }

                // Décoder et sauvegarder l'image
                $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if (!in_array($mimeType, $allowedMimes)) {
                    sendResponse(false, 'Type de fichier non autorisé', null, 400);
                }

                $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
                $ext = $extensions[$mimeType];

                $uploadDir = __DIR__ . '/uploads/messages/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0755, true);
                }

                $filename  = generateId() . '.' . $ext;
                $filepath  = $uploadDir . $filename;
                $imageData = base64_decode($photoData);

                if ($imageData === false || strlen($imageData) < 100) {
                    sendResponse(false, 'Données image invalides', null, 400);
                }

                // Limiter à 5 Mo
                if (strlen($imageData) > 5 * 1024 * 1024) {
                    sendResponse(false, 'Image trop volumineuse (max 5 Mo)', null, 413);
                }

                if (file_put_contents($filepath, $imageData) === false) {
                    sendResponse(false, 'Erreur lors de la sauvegarde de l\'image', null, 500);
                }

                // URL publique de la photo
                $baseUrl  = 'https://volt-services.fr/DEV/goodfriends/api';
                $photoUrl = $baseUrl . '/uploads/messages/' . $filename;

                // Insérer le message
                $replyToId = isset($data['replyToId']) && !empty($data['replyToId']) ? $data['replyToId'] : null;
                $messageId = generateId();
                $stmt = $db->prepare("
                    INSERT INTO messages (id, sender_id, receiver_id, message, photo_url, reply_to_id, is_read, created_at)
                    VALUES (:id, :sender_id, :receiver_id, :message, :photo_url, :reply_to_id, FALSE, NOW())
                ");
                $stmt->bindParam(':id', $messageId);
                $stmt->bindParam(':sender_id', $userId);
                $stmt->bindParam(':receiver_id', $receiverId);
                $stmt->bindParam(':message', $caption);
                $stmt->bindParam(':photo_url', $photoUrl);
                $stmt->bindParam(':reply_to_id', $replyToId);

                if ($stmt->execute()) {
                    // Récupérer le message créé
                    $stmt = $db->prepare("
                        SELECT m.*, u1.email as sender_email, u2.email as receiver_email,
                               up1.first_name as sender_first_name, up1.last_name as sender_last_name
                        FROM messages m
                        LEFT JOIN users u1 ON m.sender_id = u1.id
                        LEFT JOIN users u2 ON m.receiver_id = u2.id
                        LEFT JOIN user_profiles up1 ON u1.id = up1.user_id
                        WHERE m.id = :id
                    ");
                    $stmt->bindParam(':id', $messageId);
                    $stmt->execute();
                    $row = $stmt->fetch(PDO::FETCH_ASSOC);

                    // Notification push
                    try {
                        $fcmService = new FCMService();
                        $senderFirstName = trim($row['sender_first_name'] ?? '');
                        $senderLastName  = trim($row['sender_last_name'] ?? '');
                        $senderName = $senderFirstName || $senderLastName
                            ? trim("$senderFirstName $senderLastName")
                            : $row['sender_email'];
                        $conversationId = min($userId, $receiverId) . '_' . max($userId, $receiverId);
                        $fcmService->sendMessageNotification($db, $receiverId, $userId, $senderFirstName, $senderLastName, $senderName, '📷 Photo', $conversationId);
                    } catch (Exception $e) {
                        error_log('FCM notification error: ' . $e->getMessage());
                    }

                    sendResponse(true, 'Photo envoyée', [
                        'id'           => $row['id'],
                        'senderId'     => $row['sender_id'],
                        'receiverId'   => $row['receiver_id'],
                        'message'      => $row['message'],
                        'photoUrl'     => $row['photo_url'],
                        'isRead'       => (bool)$row['is_read'],
                        'createdAt'    => $row['created_at'],
                        'senderEmail'  => $row['sender_email'],
                        'receiverEmail'=> $row['receiver_email'],
                        'replyToId'    => $row['reply_to_id'] ?? null,
                        'reactions'    => [],
                    ], 201);
                } else {
                    // Supprimer le fichier uploadé en cas d'erreur DB
                    @unlink($filepath);
                    sendResponse(false, 'Erreur lors de l\'envoi du message', null, 500);
                }

            } elseif ($action === 'react') {
                // Ajouter / basculer une réaction à un message
                if (!isset($data['messageId']) || !isset($data['emoji'])) {
                    sendResponse(false, 'messageId et emoji requis', null, 400);
                }

                $messageId = $data['messageId'];
                $emoji = mb_substr(trim($data['emoji']), 0, 10); // sécurité longueur

                // Vérifier que le message appartient à une conversation de l'utilisateur
                $checkMsg = $db->prepare(
                    'SELECT id FROM messages WHERE id = :mid AND (sender_id = :uid1 OR receiver_id = :uid2)'
                );
                $checkMsg->bindParam(':mid', $messageId);
                $checkMsg->bindParam(':uid1', $userId);
                $checkMsg->bindParam(':uid2', $userId);
                $checkMsg->execute();
                if ($checkMsg->rowCount() === 0) {
                    sendResponse(false, 'Message introuvable ou accès refusé', null, 403);
                }

                // Vérifier si l'utilisateur a déjà réagi
                $checkStmt = $db->prepare(
                    'SELECT id, emoji FROM message_reactions WHERE message_id = :mid AND user_id = :uid'
                );
                $checkStmt->bindParam(':mid', $messageId);
                $checkStmt->bindParam(':uid', $userId);
                $checkStmt->execute();
                $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

                if ($existing) {
                    if ($existing['emoji'] === $emoji) {
                        // Même emoji : retirer la réaction
                        $delStmt = $db->prepare(
                            'DELETE FROM message_reactions WHERE message_id = :mid AND user_id = :uid'
                        );
                        $delStmt->bindParam(':mid', $messageId);
                        $delStmt->bindParam(':uid', $userId);
                        $delStmt->execute();
                        sendResponse(true, 'Réaction supprimée', ['action' => 'removed']);
                    } else {
                        // Emoji différent : mettre à jour
                        $updStmt = $db->prepare(
                            'UPDATE message_reactions SET emoji = :emoji WHERE message_id = :mid AND user_id = :uid'
                        );
                        $updStmt->bindParam(':emoji', $emoji);
                        $updStmt->bindParam(':mid', $messageId);
                        $updStmt->bindParam(':uid', $userId);
                        $updStmt->execute();
                        sendResponse(true, 'Réaction mise à jour', ['action' => 'updated']);
                    }
                } else {
                    // Nouvelle réaction
                    $newId = generateId();
                    $insStmt = $db->prepare(
                        'INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (:id, :mid, :uid, :emoji, NOW())'
                    );
                    $insStmt->bindParam(':id', $newId);
                    $insStmt->bindParam(':mid', $messageId);
                    $insStmt->bindParam(':uid', $userId);
                    $insStmt->bindParam(':emoji', $emoji);
                    $insStmt->execute();

                    // Notifier l'auteur du message (sauf si c'est lui-même qui réagit)
                    $authorStmt = $db->prepare(
                        'SELECT sender_id, receiver_id, message FROM messages WHERE id = :mid'
                    );
                    $authorStmt->execute([':mid' => $messageId]);
                    $msgRow = $authorStmt->fetch(PDO::FETCH_ASSOC);
                    if ($msgRow && $msgRow['sender_id'] !== $userId) {
                        $reactorStmt = $db->prepare('SELECT first_name, last_name FROM users WHERE id = :uid');
                        $reactorStmt->execute([':uid' => $userId]);
                        $reactor = $reactorStmt->fetch(PDO::FETCH_ASSOC);
                        $reactorName = trim(($reactor['first_name'] ?? '') . ' ' . ($reactor['last_name'] ?? '')) ?: "Quelqu'un";
                        $fcm = new FCMService();
                        $token = $fcm->getUserToken($db, $msgRow['sender_id']);
                        if ($token) {
                            $preview = mb_substr($msgRow['message'] ?? '', 0, 50);
                            $fcm->sendNotification(
                                $token,
                                "$reactorName a réagi",
                                $preview ? "$reactorName a réagi $emoji à \"$preview\"" : "$reactorName a réagi $emoji à votre message",
                                ['type' => 'reaction', 'messageId' => $messageId, 'emoji' => $emoji, 'reactorId' => (string)$userId],
                                'reaction_' . $messageId
                            );
                        }
                    }

                    sendResponse(true, 'Réaction ajoutée', ['action' => 'added']);
                }

            } else {
                sendResponse(false, 'Action non reconnue', null, 400);
            }
            break;

        case 'PUT':
            if ($action === 'mark-read') {
                // Marquer les messages comme lus
                if (!isset($data['otherUserId'])) {
                    sendResponse(false, 'otherUserId requis', null, 400);
                }
                
                $otherUserId = $data['otherUserId'];
                
                // Marquer tous les messages de cet utilisateur comme lus
                $stmt = $db->prepare("
                    UPDATE messages 
                    SET is_read = TRUE 
                    WHERE sender_id = :other_id AND receiver_id = :user_id AND is_read = FALSE
                ");
                $stmt->bindParam(':other_id', $otherUserId);
                $stmt->bindParam(':user_id', $userId);
                
                if ($stmt->execute()) {
                    sendResponse(true, 'Messages marqués comme lus', ['updated' => $stmt->rowCount()]);
                } else {
                    sendResponse(false, 'Erreur lors de la mise à jour', null, 500);
                }
                
            } else {
                sendResponse(false, 'Action non reconnue', null, 400);
            }
            break;
            
        default:
            sendResponse(false, 'Méthode non autorisée', null, 405);
            break;
    }
} catch (Exception $e) {
    sendResponse(false, 'Erreur serveur: ' . $e->getMessage(), null, 500);
}

sendResponse(false, 'Action non reconnue', null, 400);
?>
