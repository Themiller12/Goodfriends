<?php
require_once 'config.php';
require_once 'FCMService.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$action = isset($_GET['action']) ? $_GET['action'] : '';

function signPhotoAccess($messageId, $expires) {
    return hash_hmac('sha256', 'photo|' . $messageId . '|' . $expires, getJwtSecret());
}

function signAttachmentAccess($messageId, $expires) {
    return hash_hmac('sha256', 'attachment|' . $messageId . '|' . $expires, getJwtSecret());
}

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const VOICE_MAX_DURATION_MS = 600000;

// Extensions autorisées pour les fichiers joints ; le type MIME est déduit de l'extension, jamais du client
const ATTACHMENT_EXTENSIONS = [
    'pdf' => 'application/pdf',
    'txt' => 'text/plain',
    'csv' => 'text/csv',
    'rtf' => 'application/rtf',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt' => 'application/vnd.ms-powerpoint',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'odt' => 'application/vnd.oasis.opendocument.text',
    'ods' => 'application/vnd.oasis.opendocument.spreadsheet',
    'odp' => 'application/vnd.oasis.opendocument.presentation',
    'zip' => 'application/zip',
    'mp3' => 'audio/mpeg',
    'm4a' => 'audio/mp4',
    'wav' => 'audio/wav',
    'mp4' => 'video/mp4',
];

// Un lien signé temporaire (photo-link / attachment-link) remplace le jeton pour télécharger un média
$signedMediaRequest = $method === 'GET' && in_array($action, ['photo', 'attachment'], true) && isset($_GET['exp'], $_GET['sig']);
$signedPhotoRequest = $signedMediaRequest;
$userId = $signedMediaRequest ? null : verifyToken();

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
        'attachmentType' => $row['attachment_type'] ?? null,
        'attachmentName' => $row['attachment_name'] ?? null,
        'attachmentMime' => $row['attachment_mime'] ?? null,
        'attachmentSize' => isset($row['attachment_size']) ? (int)$row['attachment_size'] : null,
        'attachmentDurationMs' => isset($row['attachment_duration_ms']) ? (int)$row['attachment_duration_ms'] : null,
        'attachmentUrl' => !empty($row['attachment_type'])
            ? rtrim(API_BASE_URL, '/') . '/messages.php?action=attachment&id=' . $row['id']
            : null,
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

            if ($action === 'photo') {
                $photoMessageId = isset($_GET['id']) ? (string)$_GET['id'] : '';
                if (!preg_match('/^[a-zA-Z0-9]{10,64}$/', $photoMessageId)) {
                    sendResponse(false, 'Photo introuvable', null, 404);
                }

                // Seuls l'expéditeur et le destinataire peuvent lire la photo (ou un lien signé valide)
                if ($signedPhotoRequest) {
                    $expires = (int)$_GET['exp'];
                    if ($expires < time() || !hash_equals(signPhotoAccess($photoMessageId, $expires), (string)$_GET['sig'])) {
                        sendResponse(false, 'Lien expiré', null, 403);
                    }
                    $photoStmt = $db->prepare("SELECT 1 FROM messages WHERE id = :id");
                    $photoStmt->execute([':id' => $photoMessageId]);
                } else {
                    $photoStmt = $db->prepare(
                        "SELECT 1 FROM messages WHERE id = :id AND (sender_id = :uid1 OR receiver_id = :uid2)"
                    );
                    $photoStmt->execute([':id' => $photoMessageId, ':uid1' => $userId, ':uid2' => $userId]);
                }
                $photoFile = __DIR__ . '/uploads/messages/' . $photoMessageId . '.enc';
                if ($photoStmt->rowCount() === 0 || !is_file($photoFile)) {
                    sendResponse(false, 'Photo introuvable', null, 404);
                }

                $decrypted = decryptAtRest(file_get_contents($photoFile));
                $separator = $decrypted === false ? false : strpos($decrypted, "\n");
                $photoMime = $separator === false ? '' : substr($decrypted, 0, $separator);
                if (!in_array($photoMime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
                    error_log('[API] Photo illisible ou altérée : ' . $photoMessageId);
                    sendResponse(false, 'Photo introuvable', null, 404);
                }

                header('Content-Type: ' . $photoMime);
                header('Cache-Control: private, max-age=86400');
                echo substr($decrypted, $separator + 1);
                exit();
            }

            if ($action === 'photo-link') {
                $linkMessageId = isset($_GET['id']) ? (string)$_GET['id'] : '';
                if (!preg_match('/^[a-zA-Z0-9]{10,64}$/', $linkMessageId)) {
                    sendResponse(false, 'Photo introuvable', null, 404);
                }
                $linkStmt = $db->prepare(
                    "SELECT 1 FROM messages WHERE id = :id AND (sender_id = :uid1 OR receiver_id = :uid2)"
                );
                $linkStmt->execute([':id' => $linkMessageId, ':uid1' => $userId, ':uid2' => $userId]);
                if ($linkStmt->rowCount() === 0) {
                    sendResponse(false, 'Photo introuvable', null, 404);
                }
                $expires = time() + 120;
                sendResponse(true, 'Lien généré', [
                    'url' => rtrim(API_BASE_URL, '/') . '/messages.php?action=photo&id=' . $linkMessageId
                        . '&exp=' . $expires . '&sig=' . signPhotoAccess($linkMessageId, $expires),
                ]);
            }

            if ($action === 'attachment') {
                $attachmentId = isset($_GET['id']) ? (string)$_GET['id'] : '';
                if (!preg_match('/^[a-zA-Z0-9]{10,64}$/', $attachmentId)) {
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }

                // Participants de la conversation uniquement (ou lien signé valide)
                if ($signedMediaRequest) {
                    $expires = (int)$_GET['exp'];
                    if ($expires < time() || !hash_equals(signAttachmentAccess($attachmentId, $expires), (string)$_GET['sig'])) {
                        sendResponse(false, 'Lien expiré', null, 403);
                    }
                    $attStmt = $db->prepare("SELECT attachment_type, attachment_name FROM messages WHERE id = :id AND attachment_type IS NOT NULL");
                    $attStmt->execute([':id' => $attachmentId]);
                } else {
                    $attStmt = $db->prepare(
                        "SELECT attachment_type, attachment_name FROM messages
                         WHERE id = :id AND attachment_type IS NOT NULL AND (sender_id = :uid1 OR receiver_id = :uid2)"
                    );
                    $attStmt->execute([':id' => $attachmentId, ':uid1' => $userId, ':uid2' => $userId]);
                }
                $attRow = $attStmt->fetch(PDO::FETCH_ASSOC);
                $attFile = __DIR__ . '/uploads/messages/' . $attachmentId . '.att.enc';
                if (!$attRow || !is_file($attFile)) {
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }

                $decrypted = decryptAtRest(file_get_contents($attFile));
                $separator = $decrypted === false ? false : strpos($decrypted, "\n");
                if ($separator === false) {
                    error_log('[API] Pièce jointe illisible ou altérée : ' . $attachmentId);
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }
                $attMime = substr($decrypted, 0, $separator);
                $body = substr($decrypted, $separator + 1);
                $total = strlen($body);
                $start = 0;
                $end = $total - 1;

                // Lecture partielle (nécessaire au lecteur audio d'Android)
                if (isset($_SERVER['HTTP_RANGE']) && preg_match('/^bytes=(\d*)-(\d*)$/', $_SERVER['HTTP_RANGE'], $range)) {
                    if ($range[1] !== '') {
                        $start = (int)$range[1];
                        if ($range[2] !== '') {
                            $end = min((int)$range[2], $total - 1);
                        }
                    } elseif ($range[2] !== '') {
                        $start = max(0, $total - (int)$range[2]);
                    }
                    if ($start > $end || $start >= $total) {
                        http_response_code(416);
                        header('Content-Range: bytes */' . $total);
                        exit();
                    }
                    http_response_code(206);
                    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $total);
                }

                $isVoice = $attRow['attachment_type'] === 'voice';
                $safeName = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string)$attRow['attachment_name']);
                header('Content-Type: ' . $attMime);
                header('Content-Disposition: ' . ($isVoice ? 'inline' : 'attachment')
                    . '; filename="' . $safeName . '"; filename*=UTF-8\'\'' . rawurlencode((string)$attRow['attachment_name']));
                header('Accept-Ranges: bytes');
                header('Content-Length: ' . ($end - $start + 1));
                header('Cache-Control: private, max-age=86400');
                echo substr($body, $start, $end - $start + 1);
                exit();
            }

            if ($action === 'attachment-link') {
                $linkAttachmentId = isset($_GET['id']) ? (string)$_GET['id'] : '';
                if (!preg_match('/^[a-zA-Z0-9]{10,64}$/', $linkAttachmentId)) {
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }
                $linkStmt = $db->prepare(
                    "SELECT 1 FROM messages WHERE id = :id AND attachment_type IS NOT NULL AND (sender_id = :uid1 OR receiver_id = :uid2)"
                );
                $linkStmt->execute([':id' => $linkAttachmentId, ':uid1' => $userId, ':uid2' => $userId]);
                if ($linkStmt->rowCount() === 0) {
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }
                $expires = time() + 120;
                sendResponse(true, 'Lien généré', [
                    'url' => rtrim(API_BASE_URL, '/') . '/messages.php?action=attachment&id=' . $linkAttachmentId
                        . '&exp=' . $expires . '&sig=' . signAttachmentAccess($linkAttachmentId, $expires),
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

                $uploadDir = __DIR__ . '/uploads/messages/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0750, true);
                }

                $messageId = generateId();
                $filepath = $uploadDir . $messageId . '.enc';
                $imageData = base64_decode($photoData, true);

                if ($imageData === false || strlen($imageData) < 100) {
                    sendResponse(false, 'Données image invalides', null, 400);
                }

                if (strlen($imageData) > 5 * 1024 * 1024) {
                    sendResponse(false, 'Image trop volumineuse (max 5 Mo)', null, 413);
                }

                // Le contenu réel doit correspondre au type déclaré
                if (class_exists('finfo') && (new finfo(FILEINFO_MIME_TYPE))->buffer($imageData) !== $mimeType) {
                    sendResponse(false, 'Type de fichier non autorisé', null, 400);
                }

                // Fichier chiffré au repos : type MIME + contenu, jamais servi directement par le serveur web
                if (file_put_contents($filepath, encryptAtRest($mimeType . "\n" . $imageData)) === false) {
                    sendResponse(false, 'Erreur lors de la sauvegarde de l\'image', null, 500);
                }

                $photoUrl = rtrim(API_BASE_URL, '/') . '/messages.php?action=photo&id=' . $messageId;

                $replyToId = isset($data['replyToId']) && !empty($data['replyToId']) ? $data['replyToId'] : null;

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

            if ($action === 'send-attachment') {
                if (!isset($data['receiverId'], $data['kind'], $data['data']) || !is_string($data['receiverId'])
                    || !is_string($data['kind']) || !is_string($data['data'])) {
                    sendResponse(false, 'receiverId, kind et data requis', null, 400);
                }

                $receiverId = $data['receiverId'];
                $kind = $data['kind'];
                if (!in_array($kind, ['voice', 'file'], true)) {
                    sendResponse(false, 'Type de pièce jointe invalide', null, 400);
                }

                if (!areUsersMutualFriends($db, $userId, $receiverId)) {
                    sendResponse(false, 'Vous ne pouvez envoyer des messages qu\'aux amis.', null, 403);
                }

                $binary = base64_decode($data['data'], true);
                if ($binary === false || strlen($binary) < 1) {
                    sendResponse(false, 'Données invalides', null, 400);
                }
                if (strlen($binary) > ATTACHMENT_MAX_BYTES) {
                    sendResponse(false, 'Fichier trop volumineux (max 5 Mo)', null, 413);
                }

                $durationMs = null;
                if ($kind === 'voice') {
                    // Enregistrement AAC dans un conteneur MP4 (.m4a)
                    if (class_exists('finfo')
                        && !in_array((new finfo(FILEINFO_MIME_TYPE))->buffer($binary), ['audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg'], true)) {
                        sendResponse(false, 'Format audio non autorisé', null, 400);
                    }
                    $attachmentMime = 'audio/mp4';
                    $attachmentName = 'Message vocal.m4a';
                    $durationMs = max(0, min(VOICE_MAX_DURATION_MS, (int)($data['durationMs'] ?? 0)));
                    $messageText = '🎤 Message vocal';
                } else {
                    $rawName = isset($data['fileName']) && is_string($data['fileName']) ? trim($data['fileName']) : '';
                    $attachmentName = mb_substr(preg_replace('/[\x00-\x1F\x7F\\\\\/:*?"<>|]+/u', '_', $rawName), 0, 150);
                    $extension = strtolower(pathinfo($attachmentName, PATHINFO_EXTENSION));
                    if ($attachmentName === '' || !isset(ATTACHMENT_EXTENSIONS[$extension])) {
                        sendResponse(false, 'Type de fichier non autorisé', null, 400);
                    }
                    $attachmentMime = ATTACHMENT_EXTENSIONS[$extension];
                    $messageText = '📎 ' . $attachmentName;
                }

                $uploadDir = __DIR__ . '/uploads/messages/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0750, true);
                }

                $messageId = generateId();
                $filepath = $uploadDir . $messageId . '.att.enc';
                if (file_put_contents($filepath, encryptAtRest($attachmentMime . "\n" . $binary)) === false) {
                    sendResponse(false, 'Erreur lors de la sauvegarde du fichier', null, 500);
                }

                $replyToId = isset($data['replyToId']) && !empty($data['replyToId']) ? $data['replyToId'] : null;
                $attachmentSize = strlen($binary);

                $stmt = $db->prepare(
                    "INSERT INTO messages (
                        id, sender_id, receiver_id, message, reply_to_id, is_read, created_at, is_encrypted,
                        attachment_type, attachment_name, attachment_mime, attachment_size, attachment_duration_ms
                    ) VALUES (
                        :id, :sender_id, :receiver_id, :message, :reply_to_id, FALSE, NOW(), 0,
                        :attachment_type, :attachment_name, :attachment_mime, :attachment_size, :attachment_duration_ms
                    )"
                );
                try {
                    $stmt->execute([
                        ':id' => $messageId,
                        ':sender_id' => $userId,
                        ':receiver_id' => $receiverId,
                        ':message' => $messageText,
                        ':reply_to_id' => $replyToId,
                        ':attachment_type' => $kind,
                        ':attachment_name' => $attachmentName,
                        ':attachment_mime' => $attachmentMime,
                        ':attachment_size' => $attachmentSize,
                        ':attachment_duration_ms' => $durationMs,
                    ]);
                } catch (Exception $e) {
                    @unlink($filepath);
                    throw $e;
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
                        $kind === 'voice' ? '🎤 Message vocal' : '📎 Fichier',
                        $conversationId
                    );
                } catch (Exception $e) {
                    error_log('FCM notification error: ' . $e->getMessage());
                }

                sendResponse(true, 'Pièce jointe envoyée', mapMessageRow($row), 201);
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
    sendServerError($e);
}

sendResponse(false, 'Action non reconnue', null, 400);
?>
