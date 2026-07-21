<?php
require_once 'config.php';
require_once 'FCMService.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$userId = verifyToken();
$action = isset($_GET['action']) ? $_GET['action'] : '';

function areUsersMutualFriends(PDO $db, string $userA, string $userB): bool {
    $stmt = $db->prepare(
        "SELECT COUNT(*) as cnt FROM friend_requests
         WHERE ((sender_id = :a1 AND receiver_id = :b1)
            OR (sender_id = :b2 AND receiver_id = :a2))
           AND status = 'accepted'"
    );
    $stmt->bindParam(':a1', $userA);
    $stmt->bindParam(':b1', $userB);
    $stmt->bindParam(':b2', $userB);
    $stmt->bindParam(':a2', $userA);
    $stmt->execute();
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return isset($row['cnt']) && (int)$row['cnt'] > 0;
}

function mapMessageRow(array $row): array {
    return [
        'id' => $row['id'],
        'senderId' => $row['sender_id'],
        'receiverId' => $row['receiver_id'],
        'message' => $row['message'],
        'isEncrypted' => isset($row['is_encrypted']) ? (bool)$row['is_encrypted'] : false,
        'encryptionVersion' => $row['encryption_version'] ?? null,
        'senderCiphertext' => $row['sender_ciphertext'] ?? null,
        'senderNonce' => $row['sender_nonce'] ?? null,
        'senderEphemeralPublicKey' => $row['sender_ephemeral_public_key'] ?? null,
        'receiverCiphertext' => $row['receiver_ciphertext'] ?? null,
        'receiverNonce' => $row['receiver_nonce'] ?? null,
        'receiverEphemeralPublicKey' => $row['receiver_ephemeral_public_key'] ?? null,
        'photoUrl' => $row['photo_url'] ?? null,
        'isRead' => (bool)$row['is_read'],
        'createdAt' => $row['created_at'],
        'senderEmail' => $row['sender_email'] ?? null,
        'receiverEmail' => $row['receiver_email'] ?? null,
        'replyToId' => $row['reply_to_id'] ?? null,
        'replyToMessage' => $row['reply_to_message'] ?? null,
        'replyToSenderId' => $row['reply_to_sender_id'] ?? null,
        'reactions' => [],
    ];
}

try {
    switch ($method) {
        case 'GET':
            if ($action === 'e2ee-key') {
                $targetUserId = isset($_GET['userId']) && !empty($_GET['userId']) ? $_GET['userId'] : $userId;

                if ($targetUserId !== $userId && !areUsersMutualFriends($db, $userId, $targetUserId)) {
                    sendResponse(false, 'Accès refusé', null, 403);
                }

                $keyStmt = $db->prepare("SELECT e2ee_public_key FROM users WHERE id = :id");
                $keyStmt->bindParam(':id', $targetUserId);
                $keyStmt->execute();

                if ($keyStmt->rowCount() === 0) {
                    sendResponse(false, 'Utilisateur introuvable', null, 404);
                }

                $keyRow = $keyStmt->fetch(PDO::FETCH_ASSOC);
                sendResponse(true, 'Clé E2EE récupérée', [
                    'userId' => $targetUserId,
                    'publicKey' => $keyRow['e2ee_public_key'] ?: null,
                ]);
            }

            if ($action === 'conversation') {
                $otherUserId = isset($_GET['otherUserId']) ? $_GET['otherUserId'] : '';
                if (empty($otherUserId)) {
                    sendResponse(false, 'otherUserId requis', null, 400);
                }

                $before = isset($_GET['before']) && !empty($_GET['before']) ? $_GET['before'] : null;

                if ($before !== null) {
                    $stmt = $db->prepare(
                        "SELECT m.*, u1.email as sender_email, u2.email as receiver_email,
                                rm.message as reply_to_message, rm.sender_id as reply_to_sender_id
                         FROM messages m
                         LEFT JOIN users u1 ON m.sender_id = u1.id
                         LEFT JOIN users u2 ON m.receiver_id = u2.id
                         LEFT JOIN messages rm ON m.reply_to_id = rm.id
                         WHERE ((m.sender_id = :user_id1 AND m.receiver_id = :other_id1)
                             OR (m.sender_id = :other_id2 AND m.receiver_id = :user_id2))
                           AND m.created_at < :before
                         ORDER BY m.created_at DESC
                         LIMIT 100"
                    );
                    $stmt->bindParam(':user_id1', $userId);
                    $stmt->bindParam(':other_id1', $otherUserId);
                    $stmt->bindParam(':other_id2', $otherUserId);
                    $stmt->bindParam(':user_id2', $userId);
                    $stmt->bindParam(':before', $before);
                } else {
                    $stmt = $db->prepare(
                        "SELECT m.*, u1.email as sender_email, u2.email as receiver_email,
                                rm.message as reply_to_message, rm.sender_id as reply_to_sender_id
                         FROM messages m
                         LEFT JOIN users u1 ON m.sender_id = u1.id
                         LEFT JOIN users u2 ON m.receiver_id = u2.id
                         LEFT JOIN messages rm ON m.reply_to_id = rm.id
                         WHERE (m.sender_id = :user_id1 AND m.receiver_id = :other_id1)
                            OR (m.sender_id = :other_id2 AND m.receiver_id = :user_id2)
                         ORDER BY m.created_at DESC
                         LIMIT 100"
                    );
                    $stmt->bindParam(':user_id1', $userId);
                    $stmt->bindParam(':other_id1', $otherUserId);
                    $stmt->bindParam(':other_id2', $otherUserId);
                    $stmt->bindParam(':user_id2', $userId);
                }

                $stmt->execute();
                $messages = [];
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $messages[] = mapMessageRow($row);
                }

                if (!empty($messages)) {
                    $msgIds = array_column($messages, 'id');
                    $placeholders = implode(',', array_fill(0, count($msgIds), '?'));
                    $reactionStmt = $db->prepare("SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN ($placeholders)");
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

                $messages = array_reverse($messages);
                sendResponse(true, 'Messages récupérés', $messages);
            }

            if ($action === 'conversations') {
                $stmt = $db->prepare(
                    "SELECT DISTINCT
                        CASE WHEN m.sender_id = :user_id1 THEN m.receiver_id ELSE m.sender_id END as other_user_id,
                        u.email as other_user_email,
                        up.first_name as other_user_first_name,
                        up.last_name as other_user_last_name,
                        up.phone as other_user_phone,
                        (SELECT message FROM messages
                         WHERE (sender_id = :user_id2 AND receiver_id = CASE WHEN m.sender_id = :user_id3 THEN m.receiver_id ELSE m.sender_id END)
                            OR (sender_id = CASE WHEN m.sender_id = :user_id4 THEN m.receiver_id ELSE m.sender_id END AND receiver_id = :user_id5)
                         ORDER BY created_at DESC LIMIT 1) as last_message,
                        (SELECT is_encrypted FROM messages
                         WHERE (sender_id = :user_id2e AND receiver_id = CASE WHEN m.sender_id = :user_id3e THEN m.receiver_id ELSE m.sender_id END)
                            OR (sender_id = CASE WHEN m.sender_id = :user_id4e THEN m.receiver_id ELSE m.sender_id END AND receiver_id = :user_id5e)
                         ORDER BY created_at DESC LIMIT 1) as last_message_is_encrypted,
                        (SELECT photo_url FROM messages
                         WHERE (sender_id = :user_id2p AND receiver_id = CASE WHEN m.sender_id = :user_id3p THEN m.receiver_id ELSE m.sender_id END)
                            OR (sender_id = CASE WHEN m.sender_id = :user_id4p THEN m.receiver_id ELSE m.sender_id END AND receiver_id = :user_id5p)
                         ORDER BY created_at DESC LIMIT 1) as last_photo_url,
                        (SELECT created_at FROM messages
                         WHERE (sender_id = :user_id6 AND receiver_id = CASE WHEN m.sender_id = :user_id7 THEN m.receiver_id ELSE m.sender_id END)
                            OR (sender_id = CASE WHEN m.sender_id = :user_id8 THEN m.receiver_id ELSE m.sender_id END AND receiver_id = :user_id9)
                         ORDER BY created_at DESC LIMIT 1) as last_message_time,
                        (SELECT COUNT(*) FROM messages
                         WHERE sender_id = CASE WHEN m.sender_id = :user_id10 THEN m.receiver_id ELSE m.sender_id END
                           AND receiver_id = :user_id11
                           AND is_read = FALSE) as unread_count,
                        (EXISTS (
                            SELECT 1 FROM friend_requests fr
                            WHERE (
                                (fr.sender_id = :uid_m1 AND fr.receiver_id = CASE WHEN m.sender_id = :uid_m2 THEN m.receiver_id ELSE m.sender_id END)
                                OR (fr.sender_id = CASE WHEN m.sender_id = :uid_m3 THEN m.receiver_id ELSE m.sender_id END AND fr.receiver_id = :uid_m4)
                            ) AND fr.status = 'accepted'
                        )) as is_mutual
                     FROM messages m
                     LEFT JOIN users u ON u.id = CASE WHEN m.sender_id = :user_id12 THEN m.receiver_id ELSE m.sender_id END
                     LEFT JOIN user_profiles up ON u.id = up.user_id
                     WHERE (m.sender_id = :user_id13 OR m.receiver_id = :user_id14)
                     GROUP BY other_user_id
                     ORDER BY last_message_time DESC"
                );

                $stmt->bindParam(':user_id1', $userId);
                $stmt->bindParam(':user_id2', $userId);
                $stmt->bindParam(':user_id3', $userId);
                $stmt->bindParam(':user_id4', $userId);
                $stmt->bindParam(':user_id5', $userId);
                $stmt->bindParam(':user_id2e', $userId);
                $stmt->bindParam(':user_id3e', $userId);
                $stmt->bindParam(':user_id4e', $userId);
                $stmt->bindParam(':user_id5e', $userId);
                $stmt->bindParam(':user_id2p', $userId);
                $stmt->bindParam(':user_id3p', $userId);
                $stmt->bindParam(':user_id4p', $userId);
                $stmt->bindParam(':user_id5p', $userId);
                $stmt->bindParam(':user_id6', $userId);
                $stmt->bindParam(':user_id7', $userId);
                $stmt->bindParam(':user_id8', $userId);
                $stmt->bindParam(':user_id9', $userId);
                $stmt->bindParam(':user_id10', $userId);
                $stmt->bindParam(':user_id11', $userId);
                $stmt->bindParam(':user_id12', $userId);
                $stmt->bindParam(':user_id13', $userId);
                $stmt->bindParam(':user_id14', $userId);
                $stmt->bindParam(':uid_m1', $userId);
                $stmt->bindParam(':uid_m2', $userId);
                $stmt->bindParam(':uid_m3', $userId);
                $stmt->bindParam(':uid_m4', $userId);
                $stmt->execute();

                $conversations = [];
                while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
                    $lastMessage = $row['last_message'];
                    if (isset($row['last_message_is_encrypted']) && (int)$row['last_message_is_encrypted'] === 1) {
                        $lastMessage = 'Message chiffré';
                    } elseif (!empty($row['last_photo_url']) && empty($lastMessage)) {
                        $lastMessage = '📷 Photo';
                    }

                    $conversations[] = [
                        'otherUserId' => $row['other_user_id'],
                        'otherUserEmail' => $row['other_user_email'],
                        'otherUserFirstName' => $row['other_user_first_name'],
                        'otherUserLastName' => $row['other_user_last_name'],
                        'otherUserPhone' => $row['other_user_phone'],
                        'lastMessage' => $lastMessage,
                        'lastMessageTime' => $row['last_message_time'],
                        'unreadCount' => (int)$row['unread_count'],
                        'isMutual' => (bool)$row['is_mutual']
                    ];
                }

                sendResponse(true, 'Conversations récupérées', $conversations);
            }

            if ($action === 'unread-count') {
                $stmt = $db->prepare("SELECT COUNT(*) as total FROM messages WHERE receiver_id = :user_id AND is_read = FALSE");
                $stmt->bindParam(':user_id', $userId);
                $stmt->execute();
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                sendResponse(true, 'Nombre de messages non lus', ['count' => (int)$row['total']]);
            }

            if ($action === 'check-friendship') {
                if (!isset($_GET['otherUserId'])) {
                    sendResponse(false, 'otherUserId requis', null, 400);
                }
                $otherUserId = $_GET['otherUserId'];
                $stmt = $db->prepare(
                    "SELECT COUNT(*) as cnt
                     FROM friend_requests
                     WHERE ((sender_id = :uid1 AND receiver_id = :oid1)
                        OR (sender_id = :oid2 AND receiver_id = :uid2))
                       AND status = 'accepted'"
                );
                $stmt->bindParam(':uid1', $userId);
                $stmt->bindParam(':oid1', $otherUserId);
                $stmt->bindParam(':oid2', $otherUserId);
                $stmt->bindParam(':uid2', $userId);
                $stmt->execute();
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                sendResponse(true, 'Statut ami récupéré', ['isMutual' => (bool)$row['cnt']]);
            }

            sendResponse(false, 'Action non reconnue', null, 400);
            break;

        case 'POST':
            if ($action === 'e2ee-key') {
                if (!isset($data['publicKey']) || empty($data['publicKey'])) {
                    sendResponse(false, 'publicKey requis', null, 400);
                }

                $publicKey = trim($data['publicKey']);
                $decoded = base64_decode($publicKey, true);
                if ($decoded === false || strlen($decoded) !== 32) {
                    sendResponse(false, 'publicKey invalide', null, 400);
                }

                $stmt = $db->prepare("UPDATE users SET e2ee_public_key = :key, updated_at = NOW() WHERE id = :id");
                $stmt->bindParam(':key', $publicKey);
                $stmt->bindParam(':id', $userId);
                $stmt->execute();

                sendResponse(true, 'Clé E2EE enregistrée');
            }

            if ($action === 'send') {
                if (!isset($data['receiverId'])) {
                    sendResponse(false, 'receiverId requis', null, 400);
                }

                $receiverId = $data['receiverId'];
                $isEncrypted = isset($data['encryptionVersion']) && $data['encryptionVersion'] === 'e2ee-v1';
                $message = isset($data['message']) ? trim((string)$data['message']) : '';

                $cipherForReceiver = $data['receiverCiphertext'] ?? null;
                $nonceForReceiver = $data['receiverNonce'] ?? null;
                $ephemeralForReceiver = $data['receiverEphemeralPublicKey'] ?? null;
                $cipherForSender = $data['senderCiphertext'] ?? null;
                $nonceForSender = $data['senderNonce'] ?? null;
                $ephemeralForSender = $data['senderEphemeralPublicKey'] ?? null;
                $encryptionVersion = $isEncrypted ? 'e2ee-v1' : null;

                if ($isEncrypted) {
                    if (empty($cipherForReceiver) || empty($nonceForReceiver) || empty($ephemeralForReceiver) ||
                        empty($cipherForSender) || empty($nonceForSender) || empty($ephemeralForSender)) {
                        sendResponse(false, 'Payload chiffré incomplet', null, 400);
                    }
                    $message = '[Message chiffré]';
                }

                if (!$isEncrypted && empty($message)) {
                    sendResponse(false, 'Le message ne peut pas être vide', null, 400);
                }

                if (!areUsersMutualFriends($db, $userId, $receiverId)) {
                    sendResponse(false, 'Vous ne pouvez envoyer des messages qu\'aux utilisateurs avec qui vous êtes ami. Le contact a peut-être été supprimé.', null, 403);
                }

                $stmt = $db->prepare("SELECT id FROM users WHERE id = :id");
                $stmt->bindParam(':id', $receiverId);
                $stmt->execute();
                if ($stmt->rowCount() === 0) {
                    sendResponse(false, 'Utilisateur destinataire non trouvé', null, 404);
                }

                $replyToId = isset($data['replyToId']) && !empty($data['replyToId']) ? $data['replyToId'] : null;
                $messageId = generateId();

                $stmt = $db->prepare(
                    "INSERT INTO messages (
                        id, sender_id, receiver_id, message, reply_to_id, is_read, created_at,
                        is_encrypted, encryption_version,
                        sender_ciphertext, sender_nonce, sender_ephemeral_public_key,
                        receiver_ciphertext, receiver_nonce, receiver_ephemeral_public_key
                    ) VALUES (
                        :id, :sender_id, :receiver_id, :message, :reply_to_id, FALSE, NOW(),
                        :is_encrypted, :encryption_version,
                        :sender_ciphertext, :sender_nonce, :sender_ephemeral_public_key,
                        :receiver_ciphertext, :receiver_nonce, :receiver_ephemeral_public_key
                    )"
                );

                $stmt->bindParam(':id', $messageId);
                $stmt->bindParam(':sender_id', $userId);
                $stmt->bindParam(':receiver_id', $receiverId);
                $stmt->bindParam(':message', $message);
                $stmt->bindParam(':reply_to_id', $replyToId);
                $encryptedInt = $isEncrypted ? 1 : 0;
                $stmt->bindParam(':is_encrypted', $encryptedInt, PDO::PARAM_INT);
                $stmt->bindParam(':encryption_version', $encryptionVersion);
                $stmt->bindParam(':sender_ciphertext', $cipherForSender);
                $stmt->bindParam(':sender_nonce', $nonceForSender);
                $stmt->bindParam(':sender_ephemeral_public_key', $ephemeralForSender);
                $stmt->bindParam(':receiver_ciphertext', $cipherForReceiver);
                $stmt->bindParam(':receiver_nonce', $nonceForReceiver);
                $stmt->bindParam(':receiver_ephemeral_public_key', $ephemeralForReceiver);

                if (!$stmt->execute()) {
                    sendResponse(false, 'Erreur lors de l\'envoi du message', null, 500);
                }

                $stmt = $db->prepare(
                    "SELECT m.*, u1.email as sender_email, u2.email as receiver_email,
                            up1.first_name as sender_first_name, up1.last_name as sender_last_name
                     FROM messages m
                     LEFT JOIN users u1 ON m.sender_id = u1.id
                     LEFT JOIN users u2 ON m.receiver_id = u2.id
                     LEFT JOIN user_profiles up1 ON u1.id = up1.user_id
                     WHERE m.id = :id"
                );
                $stmt->bindParam(':id', $messageId);
                $stmt->execute();
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

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
                        $isEncrypted ? 'Message chiffré' : $message,
                        $conversationId
                    );
                } catch (Exception $e) {
                    error_log('FCM notification error: ' . $e->getMessage());
                }

                sendResponse(true, 'Message envoyé', mapMessageRow($row), 201);
            }

            if ($action === 'send-photo') {
                if (!isset($data['receiverId']) || !isset($data['photoData']) || !isset($data['mimeType'])) {
                    sendResponse(false, 'receiverId, photoData et mimeType requis', null, 400);
                }

                $receiverId = $data['receiverId'];
                $photoData = $data['photoData'];
                $mimeType = $data['mimeType'];

                $isEncrypted = isset($data['encryptionVersion']) && $data['encryptionVersion'] === 'e2ee-v1';
                $caption = isset($data['caption']) ? trim((string)$data['caption']) : null;
                $cipherForReceiver = $data['receiverCiphertext'] ?? null;
                $nonceForReceiver = $data['receiverNonce'] ?? null;
                $ephemeralForReceiver = $data['receiverEphemeralPublicKey'] ?? null;
                $cipherForSender = $data['senderCiphertext'] ?? null;
                $nonceForSender = $data['senderNonce'] ?? null;
                $ephemeralForSender = $data['senderEphemeralPublicKey'] ?? null;
                $encryptionVersion = $isEncrypted ? 'e2ee-v1' : null;

                if ($isEncrypted) {
                    if (empty($cipherForReceiver) || empty($nonceForReceiver) || empty($ephemeralForReceiver) ||
                        empty($cipherForSender) || empty($nonceForSender) || empty($ephemeralForSender)) {
                        sendResponse(false, 'Payload chiffré incomplet', null, 400);
                    }
                    $caption = '[Message chiffré]';
                }

                if (!areUsersMutualFriends($db, $userId, $receiverId)) {
                    sendResponse(false, 'Vous ne pouvez envoyer des messages qu\'aux amis.', null, 403);
                }

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

                $filename = generateId() . '.' . $ext;
                $filepath = $uploadDir . $filename;
                $imageData = base64_decode($photoData);

                if ($imageData === false || strlen($imageData) < 100) {
                    sendResponse(false, 'Données image invalides', null, 400);
                }

                if (strlen($imageData) > 5 * 1024 * 1024) {
                    sendResponse(false, 'Image trop volumineuse (max 5 Mo)', null, 413);
                }

                if (file_put_contents($filepath, $imageData) === false) {
                    sendResponse(false, 'Erreur lors de la sauvegarde de l\'image', null, 500);
                }

                $baseUrl = 'https://volt-services.fr/DEV/goodfriends/api';
                $photoUrl = $baseUrl . '/uploads/messages/' . $filename;

                $replyToId = isset($data['replyToId']) && !empty($data['replyToId']) ? $data['replyToId'] : null;
                $messageId = generateId();

                $stmt = $db->prepare(
                    "INSERT INTO messages (
                        id, sender_id, receiver_id, message, photo_url, reply_to_id, is_read, created_at,
                        is_encrypted, encryption_version,
                        sender_ciphertext, sender_nonce, sender_ephemeral_public_key,
                        receiver_ciphertext, receiver_nonce, receiver_ephemeral_public_key
                    ) VALUES (
                        :id, :sender_id, :receiver_id, :message, :photo_url, :reply_to_id, FALSE, NOW(),
                        :is_encrypted, :encryption_version,
                        :sender_ciphertext, :sender_nonce, :sender_ephemeral_public_key,
                        :receiver_ciphertext, :receiver_nonce, :receiver_ephemeral_public_key
                    )"
                );

                $stmt->bindParam(':id', $messageId);
                $stmt->bindParam(':sender_id', $userId);
                $stmt->bindParam(':receiver_id', $receiverId);
                $stmt->bindParam(':message', $caption);
                $stmt->bindParam(':photo_url', $photoUrl);
                $stmt->bindParam(':reply_to_id', $replyToId);
                $encryptedInt = $isEncrypted ? 1 : 0;
                $stmt->bindParam(':is_encrypted', $encryptedInt, PDO::PARAM_INT);
                $stmt->bindParam(':encryption_version', $encryptionVersion);
                $stmt->bindParam(':sender_ciphertext', $cipherForSender);
                $stmt->bindParam(':sender_nonce', $nonceForSender);
                $stmt->bindParam(':sender_ephemeral_public_key', $ephemeralForSender);
                $stmt->bindParam(':receiver_ciphertext', $cipherForReceiver);
                $stmt->bindParam(':receiver_nonce', $nonceForReceiver);
                $stmt->bindParam(':receiver_ephemeral_public_key', $ephemeralForReceiver);

                if (!$stmt->execute()) {
                    @unlink($filepath);
                    sendResponse(false, 'Erreur lors de l\'envoi du message', null, 500);
                }

                $stmt = $db->prepare(
                    "SELECT m.*, u1.email as sender_email, u2.email as receiver_email,
                            up1.first_name as sender_first_name, up1.last_name as sender_last_name
                     FROM messages m
                     LEFT JOIN users u1 ON m.sender_id = u1.id
                     LEFT JOIN users u2 ON m.receiver_id = u2.id
                     LEFT JOIN user_profiles up1 ON u1.id = up1.user_id
                     WHERE m.id = :id"
                );
                $stmt->bindParam(':id', $messageId);
                $stmt->execute();
                $row = $stmt->fetch(PDO::FETCH_ASSOC);

                try {
                    $fcmService = new FCMService();
                    $senderFirstName = trim($row['sender_first_name'] ?? '');
                    $senderLastName = trim($row['sender_last_name'] ?? '');
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
                        $isEncrypted ? '📷 Photo chiffrée' : '📷 Photo',
                        $conversationId
                    );
                } catch (Exception $e) {
                    error_log('FCM notification error: ' . $e->getMessage());
                }

                sendResponse(true, 'Photo envoyée', mapMessageRow($row), 201);
            }

            if ($action === 'react') {
                if (!isset($data['messageId']) || !isset($data['emoji'])) {
                    sendResponse(false, 'messageId et emoji requis', null, 400);
                }

                $messageId = $data['messageId'];
                $emoji = mb_substr(trim($data['emoji']), 0, 10);

                $emojiDisplay = [
                    'love' => '❤️',
                    'like' => '👍',
                    'wow' => '😮',
                    'haha' => '😂',
                    'dislike' => '👎',
                    'angry' => '😡',
                ][$emoji] ?? $emoji;

                $checkMsg = $db->prepare('SELECT id FROM messages WHERE id = :mid AND (sender_id = :uid1 OR receiver_id = :uid2)');
                $checkMsg->bindParam(':mid', $messageId);
                $checkMsg->bindParam(':uid1', $userId);
                $checkMsg->bindParam(':uid2', $userId);
                $checkMsg->execute();
                if ($checkMsg->rowCount() === 0) {
                    sendResponse(false, 'Message introuvable ou accès refusé', null, 403);
                }

                $checkStmt = $db->prepare('SELECT id, emoji FROM message_reactions WHERE message_id = :mid AND user_id = :uid');
                $checkStmt->bindParam(':mid', $messageId);
                $checkStmt->bindParam(':uid', $userId);
                $checkStmt->execute();
                $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);

                if ($existing) {
                    if ($existing['emoji'] === $emoji) {
                        $delStmt = $db->prepare('DELETE FROM message_reactions WHERE message_id = :mid AND user_id = :uid');
                        $delStmt->bindParam(':mid', $messageId);
                        $delStmt->bindParam(':uid', $userId);
                        $delStmt->execute();
                        sendResponse(true, 'Réaction supprimée', ['action' => 'removed']);
                    }

                    $updStmt = $db->prepare('UPDATE message_reactions SET emoji = :emoji WHERE message_id = :mid AND user_id = :uid');
                    $updStmt->bindParam(':emoji', $emoji);
                    $updStmt->bindParam(':mid', $messageId);
                    $updStmt->bindParam(':uid', $userId);
                    $updStmt->execute();

                    $authorStmt = $db->prepare('SELECT sender_id, receiver_id, message, is_encrypted FROM messages WHERE id = :mid');
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
                            $preview = ((int)($msgRow['is_encrypted'] ?? 0) === 1)
                                ? 'Message chiffré'
                                : mb_substr($msgRow['message'] ?? '', 0, 50);
                            $fcm->sendNotification(
                                $token,
                                "$reactorName a réagi",
                                $preview ? "$reactorName a réagi $emojiDisplay à \"$preview\"" : "$reactorName a réagi $emojiDisplay à votre message",
                                ['type' => 'reaction', 'messageId' => $messageId, 'emoji' => $emoji, 'reactorId' => (string)$userId],
                                'reaction_' . $messageId
                            );
                        }
                    }

                    sendResponse(true, 'Réaction mise à jour', ['action' => 'updated']);
                }

                $newId = generateId();
                $insStmt = $db->prepare('INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (:id, :mid, :uid, :emoji, NOW())');
                $insStmt->bindParam(':id', $newId);
                $insStmt->bindParam(':mid', $messageId);
                $insStmt->bindParam(':uid', $userId);
                $insStmt->bindParam(':emoji', $emoji);
                $insStmt->execute();

                $authorStmt = $db->prepare('SELECT sender_id, receiver_id, message, is_encrypted FROM messages WHERE id = :mid');
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
                        $preview = ((int)($msgRow['is_encrypted'] ?? 0) === 1)
                            ? 'Message chiffré'
                            : mb_substr($msgRow['message'] ?? '', 0, 50);
                        $fcm->sendNotification(
                            $token,
                            "$reactorName a réagi",
                            $preview ? "$reactorName a réagi $emojiDisplay à \"$preview\"" : "$reactorName a réagi $emojiDisplay à votre message",
                            ['type' => 'reaction', 'messageId' => $messageId, 'emoji' => $emoji, 'reactorId' => (string)$userId],
                            'reaction_' . $messageId
                        );
                    }
                }

                sendResponse(true, 'Réaction ajoutée', ['action' => 'added']);
            }

            sendResponse(false, 'Action non reconnue', null, 400);
            break;

        case 'PUT':
            if ($action === 'mark-read') {
                if (!isset($data['otherUserId'])) {
                    sendResponse(false, 'otherUserId requis', null, 400);
                }

                $otherUserId = $data['otherUserId'];
                $stmt = $db->prepare(
                    "UPDATE messages
                     SET is_read = TRUE
                     WHERE sender_id = :other_id AND receiver_id = :user_id AND is_read = FALSE"
                );
                $stmt->bindParam(':other_id', $otherUserId);
                $stmt->bindParam(':user_id', $userId);

                if ($stmt->execute()) {
                    sendResponse(true, 'Messages marqués comme lus', ['updated' => $stmt->rowCount()]);
                }

                sendResponse(false, 'Erreur lors de la mise à jour', null, 500);
            }

            sendResponse(false, 'Action non reconnue', null, 400);
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
