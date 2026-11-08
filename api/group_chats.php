<?php
require_once 'config.php';
require_once 'FCMService.php';
require_once 'attachment_rules.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$action = isset($_GET['action']) ? $_GET['action'] : '';

function signGroupAttachmentAccess($messageId, $expires) {
    return hash_hmac('sha256', 'groupattachment|' . $messageId . '|' . $expires, getJwtSecret());
}

// Un lien signé temporaire (attachment-link) remplace le jeton pour lire ou télécharger une pièce jointe
$signedAttachmentRequest = $method === 'GET' && $action === 'attachment' && isset($_GET['exp'], $_GET['sig']);
$userId = $signedAttachmentRequest ? null : verifyToken();

const GROUP_MAX_MEMBERS = 50;
const GROUP_MAX_TEXT_LENGTH = 5000;
const GROUP_MAX_IMAGE_BASE64_LENGTH = 7000000;

function areMutualFriends(PDO $db, $userA, $userB) {
    $stmt = $db->prepare(
        "SELECT 1 FROM friend_requests
         WHERE ((sender_id = :a1 AND receiver_id = :b1) OR (sender_id = :b2 AND receiver_id = :a2))
           AND status = 'accepted'
         LIMIT 1"
    );
    $stmt->execute([':a1' => $userA, ':b1' => $userB, ':b2' => $userB, ':a2' => $userA]);
    return $stmt->rowCount() > 0;
}

function getUserDisplayName(PDO $db, $userId) {
    $stmt = $db->prepare('SELECT first_name, last_name FROM users WHERE id = :uid');
    $stmt->execute([':uid' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return trim(($row['first_name'] ?? '') . ' ' . ($row['last_name'] ?? ''));
}

function notifyGroupMembers(PDO $db, $groupId, $senderId, $senderName, $preview, $messageId) {
    try {
        $nameStmt = $db->prepare('SELECT name FROM group_chats WHERE id = :gid');
        $nameStmt->execute([':gid' => $groupId]);
        $groupName = (string) $nameStmt->fetchColumn();
        $fcm = new FCMService();
        $fcm->sendGroupMessageNotification($db, $groupId, $groupName, $senderId, $senderName, $preview, $messageId);
    } catch (Exception $e) {
        error_log('FCM group notification error: ' . $e->getMessage());
    }
}

try {
    switch ($method) {

        // ── GET ──────────────────────────────────────────────────────────────────
        case 'GET':
            if ($action === 'attachment') {
                $attachmentId = isset($_GET['id']) ? (string)$_GET['id'] : '';
                if (!preg_match('/^[a-zA-Z0-9]{10,64}$/', $attachmentId)) {
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }

                if ($signedAttachmentRequest) {
                    $expires = (int)$_GET['exp'];
                    if ($expires < time() || !hash_equals(signGroupAttachmentAccess($attachmentId, $expires), (string)$_GET['sig'])) {
                        sendResponse(false, 'Lien expiré', null, 403);
                    }
                    $attStmt = $db->prepare(
                        "SELECT attachment_type, attachment_name FROM group_chat_messages
                         WHERE id = :id AND attachment_type IS NOT NULL"
                    );
                    $attStmt->execute([':id' => $attachmentId]);
                } else {
                    // Membres du groupe uniquement
                    $attStmt = $db->prepare(
                        "SELECT m.attachment_type, m.attachment_name FROM group_chat_messages m
                         INNER JOIN group_chat_members gcm ON gcm.group_id = m.group_id
                         WHERE m.id = :id AND m.attachment_type IS NOT NULL AND gcm.user_id = :uid"
                    );
                    $attStmt->execute([':id' => $attachmentId, ':uid' => $userId]);
                }
                $attRow = $attStmt->fetch(PDO::FETCH_ASSOC);
                $attFile = __DIR__ . '/uploads/group/' . $attachmentId . '.att.enc';
                if (!$attRow || !is_file($attFile)) {
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }
                streamAttachment($attFile, (string)$attRow['attachment_type'], (string)$attRow['attachment_name']);
            }

            if ($action === 'attachment-link') {
                $linkId = isset($_GET['id']) ? (string)$_GET['id'] : '';
                if (!preg_match('/^[a-zA-Z0-9]{10,64}$/', $linkId)) {
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }
                $linkStmt = $db->prepare(
                    "SELECT 1 FROM group_chat_messages m
                     INNER JOIN group_chat_members gcm ON gcm.group_id = m.group_id
                     WHERE m.id = :id AND m.attachment_type IS NOT NULL AND gcm.user_id = :uid"
                );
                $linkStmt->execute([':id' => $linkId, ':uid' => $userId]);
                if ($linkStmt->rowCount() === 0) {
                    sendResponse(false, 'Fichier introuvable', null, 404);
                }
                $expires = time() + 120;
                sendResponse(true, 'Lien généré', [
                    'url' => rtrim(API_BASE_URL, '/') . '/group_chats.php?action=attachment&id=' . $linkId
                        . '&exp=' . $expires . '&sig=' . signGroupAttachmentAccess($linkId, $expires),
                ]);
            }
            if ($action === 'member-keys') {
                // Clés publiques E2EE des membres du groupe (les membres ne sont pas forcément amis entre eux)
                $keysGroupId = isset($_GET['id']) ? (string)$_GET['id'] : '';
                if ($keysGroupId === '') {
                    sendResponse(false, 'id requis', null, 400);
                }
                $keysCheck = $db->prepare("SELECT 1 FROM group_chat_members WHERE group_id = :gid AND user_id = :uid");
                $keysCheck->execute([':gid' => $keysGroupId, ':uid' => $userId]);
                if ($keysCheck->rowCount() === 0) {
                    sendResponse(false, 'Accès refusé', null, 403);
                }
                $keysStmt = $db->prepare(
                    "SELECT u.id AS userId, u.e2ee_public_key AS publicKey
                     FROM group_chat_members gcm
                     INNER JOIN users u ON u.id = gcm.user_id
                     WHERE gcm.group_id = :gid AND u.e2ee_public_key IS NOT NULL AND u.e2ee_public_key <> ''"
                );
                $keysStmt->execute([':gid' => $keysGroupId]);
                sendResponse(true, 'Clés récupérées', $keysStmt->fetchAll(PDO::FETCH_ASSOC));
            }

            if ($action === 'messages') {
                // Récupérer les messages d'un groupe
                $groupId = isset($_GET['id']) ? $_GET['id'] : '';
                if (empty($groupId)) {
                    sendResponse(false, 'id requis', null, 400);
                }

                // Vérifier que l'utilisateur est membre du groupe
                $checkStmt = $db->prepare(
                    "SELECT 1 FROM group_chat_members WHERE group_id = :gid AND user_id = :uid"
                );
                $checkStmt->execute([':gid' => $groupId, ':uid' => $userId]);
                if ($checkStmt->rowCount() === 0) {
                    sendResponse(false, 'Accès refusé', null, 403);
                }

                $stmt = $db->prepare(
                    "SELECT m.id, m.sender_id AS senderId, m.sender_name AS senderName, m.message AS text,
                            m.image_data AS imageBase64, m.image_mime AS imageMime,
                            m.reply_to_id AS replyToId, m.reply_to_text AS replyToText,
                            m.reply_to_sender_name AS replyToSenderName,
                            m.attachment_type AS attachmentType, m.attachment_name AS attachmentName,
                            m.attachment_size AS attachmentSize, m.attachment_duration_ms AS attachmentDurationMs,
                            m.is_encrypted AS isEncrypted, m.encryption_version AS encryptionVersion,
                            p.ciphertext AS ciphertext, p.nonce AS nonce, p.ephemeral_public_key AS ephemeralPublicKey,
                            m.created_at AS createdAt
                     FROM group_chat_messages m
                     LEFT JOIN group_message_payloads p ON p.message_id = m.id AND p.user_id = :uid
                     WHERE m.group_id = :gid
                     ORDER BY m.created_at ASC"
                );
                $stmt->execute([':gid' => $groupId, ':uid' => $userId]);
                $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

                foreach ($messages as &$attMsg) {
                    $attMsg['isEncrypted'] = (int)$attMsg['isEncrypted'] === 1;
                    $attMsg['attachmentSize'] = $attMsg['attachmentSize'] !== null ? (int)$attMsg['attachmentSize'] : null;
                    $attMsg['attachmentDurationMs'] = $attMsg['attachmentDurationMs'] !== null ? (int)$attMsg['attachmentDurationMs'] : null;
                    $attMsg['attachmentUrl'] = !empty($attMsg['attachmentType'])
                        ? rtrim(API_BASE_URL, '/') . '/group_chats.php?action=attachment&id=' . $attMsg['id']
                        : null;
                }
                unset($attMsg);

                // Images chiffrées au repos (les anciennes, en clair, sont renvoyées telles quelles)
                foreach ($messages as &$imgMsg) {
                    if (is_string($imgMsg['imageBase64']) && strpos($imgMsg['imageBase64'], 'enc1:') === 0) {
                        $plain = decryptAtRest(base64_decode(substr($imgMsg['imageBase64'], 5)));
                        $imgMsg['imageBase64'] = $plain === false ? null : $plain;
                    }
                }
                unset($imgMsg);

                // Ajouter les réactions pour chaque message
                if (!empty($messages)) {
                    $msgIds = array_column($messages, 'id');
                    $placeholders = implode(',', array_fill(0, count($msgIds), '?'));
                    $reactStmt = $db->prepare(
                        "SELECT message_id, user_id AS userId, emoji FROM group_message_reactions WHERE message_id IN ($placeholders)"
                    );
                    $reactStmt->execute($msgIds);
                    $reactionsMap = [];
                    while ($r = $reactStmt->fetch(PDO::FETCH_ASSOC)) {
                        $reactionsMap[$r['message_id']][] = ['userId' => $r['userId'], 'emoji' => $r['emoji']];
                    }
                    foreach ($messages as &$msg) {
                        $msg['reactions'] = $reactionsMap[$msg['id']] ?? [];
                    }
                    unset($msg);
                }

                sendResponse(true, 'Messages récupérés', $messages);
            }

            // Lister tous les groupes dont l'utilisateur est membre
            $stmt = $db->prepare(
                "SELECT gc.id, gc.name, gc.created_by, gc.created_at, gc.updated_at
                 FROM group_chats gc
                 INNER JOIN group_chat_members gcm ON gc.id = gcm.group_id
                 WHERE gcm.user_id = :uid
                 ORDER BY gc.updated_at DESC"
            );
            $stmt->execute([':uid' => $userId]);
            $groups = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $result = [];
            foreach ($groups as $g) {
                $gid = $g['id'];

                // Membres
                $mStmt = $db->prepare(
                    "SELECT user_id AS userId, first_name AS firstName, last_name AS lastName, photo
                     FROM group_chat_members WHERE group_id = :gid"
                );
                $mStmt->execute([':gid' => $gid]);
                $members = $mStmt->fetchAll(PDO::FETCH_ASSOC);

                // Dernier message
                $lStmt = $db->prepare(
                    "SELECT id, sender_id AS senderId, sender_name AS senderName,
                            message AS text, created_at AS createdAt
                     FROM group_chat_messages
                     WHERE group_id = :gid
                     ORDER BY created_at DESC LIMIT 1"
                );
                $lStmt->execute([':gid' => $gid]);
                $lastMsg = $lStmt->fetch(PDO::FETCH_ASSOC);

                $result[] = [
                    'id'        => $g['id'],
                    'name'      => $g['name'],
                    'createdBy' => $g['created_by'],
                    'createdAt' => $g['created_at'],
                    'updatedAt' => $g['updated_at'],
                    'members'   => array_map(function($m) {
                        return [
                            'userId'    => $m['userId'],
                            'contactId' => '',           // non stocké en DB, cosmétique
                            'firstName' => $m['firstName'],
                            'lastName'  => $m['lastName'] ?? '',
                            'photo'     => $m['photo'],
                        ];
                    }, $members),
                    'lastMessage' => $lastMsg ?: null,
                    'messages'    => [],   // chargés séparément via ?action=messages
                ];
            }
            sendResponse(true, 'Groupes récupérés', $result);
            break;

        // ── POST ─────────────────────────────────────────────────────────────────
        case 'POST':
            if ($action === 'react') {
                // Ajouter / basculer une réaction sur un message de groupe
                $messageId = $data['messageId'] ?? '';
                $emoji     = $data['emoji'] ?? '';
                if (empty($messageId) || empty($emoji)) {
                    sendResponse(false, 'messageId et emoji requis', null, 400);
                }

                // Correspondance clé → emoji affiché dans les notifications
                $emojiDisplay = [
                    'love'    => '❤️',
                    'like'    => '👍',
                    'wow'     => '😮',
                    'haha'    => '😂',
                    'dislike' => '👎',
                    'angry'   => '😡',
                ][$emoji] ?? $emoji;

                // Vérifier que l'utilisateur est membre du groupe contenant ce message
                $checkStmt = $db->prepare(
                    "SELECT gcm.group_id FROM group_chat_members gcm
                     INNER JOIN group_chat_messages gcmsg ON gcmsg.group_id = gcm.group_id
                     WHERE gcmsg.id = :msgId AND gcm.user_id = :uid"
                );
                $checkStmt->execute([':msgId' => $messageId, ':uid' => $userId]);
                if ($checkStmt->rowCount() === 0) {
                    sendResponse(false, 'Accès refusé', null, 403);
                }

                // Chercher une réaction existante de cet utilisateur
                $existingStmt = $db->prepare(
                    "SELECT id, emoji FROM group_message_reactions WHERE message_id = :mid AND user_id = :uid"
                );
                $existingStmt->execute([':mid' => $messageId, ':uid' => $userId]);
                $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);

                if ($existing) {
                    if ($existing['emoji'] === $emoji) {
                        // Même emoji → supprimer (bascule)
                        $db->prepare("DELETE FROM group_message_reactions WHERE message_id = :mid AND user_id = :uid")
                           ->execute([':mid' => $messageId, ':uid' => $userId]);
                    } else {
                        // Emoji différent → remplacer
                        $db->prepare("UPDATE group_message_reactions SET emoji = :emoji WHERE message_id = :mid AND user_id = :uid")
                           ->execute([':emoji' => $emoji, ':mid' => $messageId, ':uid' => $userId]);

                        // Notifier l'auteur du message (réaction changée)
                        $authorStmt = $db->prepare(
                            "SELECT sender_id, sender_name FROM group_chat_messages WHERE id = :mid"
                        );
                        $authorStmt->execute([':mid' => $messageId]);
                        $msgRow = $authorStmt->fetch(PDO::FETCH_ASSOC);
                        if ($msgRow && $msgRow['sender_id'] !== $userId) {
                            $reactorStmt = $db->prepare("SELECT first_name, last_name FROM users WHERE id = :uid");
                            $reactorStmt->execute([':uid' => $userId]);
                            $reactor = $reactorStmt->fetch(PDO::FETCH_ASSOC);
                            $reactorName = trim(($reactor['first_name'] ?? '') . ' ' . ($reactor['last_name'] ?? '')) ?: 'Quelqu\'un';
                            $fcm = new FCMService();
                            $token = $fcm->getUserToken($db, $msgRow['sender_id']);
                            if ($token && $fcm->isMessageNotificationEnabled($db, $msgRow['sender_id'])) {
                                $fcm->sendNotification(
                                    $token,
                                    "$reactorName a réagi",
                                    "$reactorName a réagi $emojiDisplay à votre message",
                                    ['type' => 'reaction', 'messageId' => $messageId, 'emoji' => $emoji, 'reactorId' => (string)$userId],
                                    'reaction_' . $messageId
                                );
                            }
                        }
                    }
                } else {
                    // Nouvelle réaction
                    $reactionId = uniqid('r', true);
                    $db->prepare("INSERT INTO group_message_reactions (id, message_id, user_id, emoji) VALUES (:id, :mid, :uid, :emoji)")
                       ->execute([':id' => $reactionId, ':mid' => $messageId, ':uid' => $userId, ':emoji' => $emoji]);
                }

                // Retourner la liste à jour des réactions pour ce message
                $reactStmt = $db->prepare("SELECT user_id AS userId, emoji FROM group_message_reactions WHERE message_id = :mid");
                $reactStmt->execute([':mid' => $messageId]);
                $reactions = $reactStmt->fetchAll(PDO::FETCH_ASSOC);

                // Notifier l'auteur du message (sauf si c'est lui-même qui réagit)
                $authorStmt = $db->prepare(
                    "SELECT sender_id, sender_name FROM group_chat_messages WHERE id = :mid"
                );
                $authorStmt->execute([':mid' => $messageId]);
                $msgRow = $authorStmt->fetch(PDO::FETCH_ASSOC);
                if ($msgRow && $msgRow['sender_id'] !== $userId) {
                    // Récupérer le nom de celui qui réagit
                    $reactorStmt = $db->prepare("SELECT first_name, last_name FROM users WHERE id = :uid");
                    $reactorStmt->execute([':uid' => $userId]);
                    $reactor = $reactorStmt->fetch(PDO::FETCH_ASSOC);
                    $reactorName = trim(($reactor['first_name'] ?? '') . ' ' . ($reactor['last_name'] ?? '')) ?: 'Quelqu\'un';
                    $fcm = new FCMService();
                    $token = $fcm->getUserToken($db, $msgRow['sender_id']);
                    if ($token && $fcm->isMessageNotificationEnabled($db, $msgRow['sender_id'])) {
                        $preview = !empty($msgRow['sender_name']) ? $msgRow['sender_name'] : 'votre message';
                        $fcm->sendNotification(
                            $token,
                            "$reactorName a réagi",
                            "$reactorName a réagi $emojiDisplay à votre message",
                            ['type' => 'reaction', 'messageId' => $messageId, 'emoji' => $emoji, 'reactorId' => (string)$userId],
                            'reaction_' . $messageId
                        );
                    }
                }

                sendResponse(true, 'Réaction mise à jour', ['reactions' => $reactions]);
            }

            if ($action === 'message-attachment') {
                // Message vocal ou fichier joint dans un groupe (chiffré au repos, comme en conversation individuelle)
                $groupId = $data['groupId'] ?? '';
                $kind    = $data['kind'] ?? '';
                if (!is_string($groupId) || $groupId === '' || !isset($data['data']) || !is_string($data['data'])
                    || !in_array($kind, ['voice', 'file'], true)) {
                    sendResponse(false, 'groupId, kind et data requis', null, 400);
                }

                $checkStmt = $db->prepare(
                    "SELECT 1 FROM group_chat_members WHERE group_id = :gid AND user_id = :uid"
                );
                $checkStmt->execute([':gid' => $groupId, ':uid' => $userId]);
                if ($checkStmt->rowCount() === 0) {
                    sendResponse(false, 'Accès refusé', null, 403);
                }

                [$binary, $attachmentMime, $attachmentName, $durationMs, $messageText] = parseAttachmentUpload($data, $kind);

                $uploadDir = __DIR__ . '/uploads/group/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0750, true);
                }

                $msgId = generateId();
                $filepath = $uploadDir . $msgId . '.att.enc';
                if (file_put_contents($filepath, encryptAtRest($attachmentMime . "\n" . $binary)) === false) {
                    sendResponse(false, 'Erreur lors de la sauvegarde du fichier', null, 500);
                }

                $senderName        = getUserDisplayName($db, $userId);
                $replyToId         = $data['replyToId'] ?? null;
                $replyToText       = $data['replyToText'] ?? null;
                $replyToSenderName = $data['replyToSenderName'] ?? null;
                $now               = date('Y-m-d H:i:s');
                $attachmentSize    = strlen($binary);

                try {
                    $db->prepare(
                        "INSERT INTO group_chat_messages (
                            id, group_id, sender_id, sender_name, message, reply_to_id, reply_to_text, reply_to_sender_name, created_at,
                            attachment_type, attachment_name, attachment_mime, attachment_size, attachment_duration_ms
                         ) VALUES (
                            :id, :gid, :sid, :sname, :msg, :rId, :rText, :rSender, :now,
                            :atype, :aname, :amime, :asize, :adur
                         )"
                    )->execute([
                        ':id'      => $msgId,
                        ':gid'     => $groupId,
                        ':sid'     => $userId,
                        ':sname'   => $senderName,
                        ':msg'     => $messageText,
                        ':rId'     => $replyToId,
                        ':rText'   => $replyToText,
                        ':rSender' => $replyToSenderName,
                        ':now'     => $now,
                        ':atype'   => $kind,
                        ':aname'   => $attachmentName,
                        ':amime'   => $attachmentMime,
                        ':asize'   => $attachmentSize,
                        ':adur'    => $durationMs,
                    ]);
                } catch (Exception $e) {
                    @unlink($filepath);
                    throw $e;
                }

                $db->prepare("UPDATE group_chats SET updated_at = :now WHERE id = :gid")
                   ->execute([':now' => $now, ':gid' => $groupId]);

                notifyGroupMembers($db, $groupId, $userId, $senderName, $messageText, $msgId);

                sendResponse(true, 'Pièce jointe envoyée', [
                    'id'                   => $msgId,
                    'senderId'             => $userId,
                    'senderName'           => $senderName,
                    'text'                 => $messageText,
                    'attachmentType'       => $kind,
                    'attachmentName'       => $attachmentName,
                    'attachmentSize'       => $attachmentSize,
                    'attachmentDurationMs' => $durationMs,
                    'attachmentUrl'        => rtrim(API_BASE_URL, '/') . '/group_chats.php?action=attachment&id=' . $msgId,
                    'replyToId'            => $replyToId,
                    'replyToText'          => $replyToText,
                    'replyToSenderName'    => $replyToSenderName,
                    'createdAt'            => $now,
                ], 201);
            }

            if ($action === 'message') {
                // Envoyer un message
                $groupId     = $data['groupId'] ?? '';
                $text        = $data['text'] ?? '';
                $imageBase64 = $data['imageBase64'] ?? null;
                $imageMime   = $data['imageMime'] ?? null;
                $isEncrypted = ($data['encryptionVersion'] ?? null) === 'e2ee-v1';
                $payloads    = $data['payloads'] ?? null;
                if ($isEncrypted) {
                    // Le contenu (texte, aperçu de réponse) voyage uniquement dans les charges utiles chiffrées
                    $text = '';
                }
                if (empty($groupId) || (!$isEncrypted && empty($text) && empty($imageBase64))) {
                    sendResponse(false, 'groupId et text ou imageBase64 requis', null, 400);
                }
                if (!is_string($text) || mb_strlen($text) > GROUP_MAX_TEXT_LENGTH) {
                    sendResponse(false, 'Message trop long', null, 400);
                }
                if (!empty($imageBase64)) {
                    if (!is_string($imageBase64) || strlen($imageBase64) > GROUP_MAX_IMAGE_BASE64_LENGTH) {
                        sendResponse(false, 'Image trop volumineuse', null, 413);
                    }
                    if (!in_array($imageMime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
                        sendResponse(false, 'Type de fichier non autorisé', null, 400);
                    }
                }

                // Vérifier membership
                $checkStmt = $db->prepare(
                    "SELECT 1 FROM group_chat_members WHERE group_id = :gid AND user_id = :uid"
                );
                $checkStmt->execute([':gid' => $groupId, ':uid' => $userId]);
                if ($checkStmt->rowCount() === 0) {
                    sendResponse(false, 'Accès refusé', null, 403);
                }

                $validPayloads = [];
                if ($isEncrypted) {
                    if (!is_array($payloads) || count($payloads) === 0 || count($payloads) > GROUP_MAX_MEMBERS + 1) {
                        sendResponse(false, 'Payload chiffré incomplet', null, 400);
                    }
                    $membersStmt = $db->prepare(
                        "SELECT gcm.user_id, u.e2ee_public_key FROM group_chat_members gcm
                         INNER JOIN users u ON u.id = gcm.user_id WHERE gcm.group_id = :gid"
                    );
                    $membersStmt->execute([':gid' => $groupId]);
                    $memberKeys = [];
                    foreach ($membersStmt->fetchAll(PDO::FETCH_ASSOC) as $memberRow) {
                        $memberKeys[$memberRow['user_id']] = !empty($memberRow['e2ee_public_key']);
                    }
                    foreach ($payloads as $payload) {
                        $payloadUser = is_array($payload) ? ($payload['userId'] ?? null) : null;
                        if (!is_string($payloadUser) || !isset($memberKeys[$payloadUser]) || isset($validPayloads[$payloadUser])
                            || empty($payload['ciphertext']) || !is_string($payload['ciphertext'])
                            || empty($payload['nonce']) || !is_string($payload['nonce']) || strlen($payload['nonce']) > 128
                            || empty($payload['ephemeralPublicKey']) || !is_string($payload['ephemeralPublicKey']) || strlen($payload['ephemeralPublicKey']) > 128
                            || strlen($payload['ciphertext']) > 20000) {
                            sendResponse(false, 'Payload chiffré invalide', null, 400);
                        }
                        $validPayloads[$payloadUser] = $payload;
                    }
                    // Tous les membres ayant activé le chiffrement (dont l'expéditeur) doivent pouvoir lire le message
                    foreach ($memberKeys as $memberId => $hasKey) {
                        if (($hasKey || $memberId === $userId) && !isset($validPayloads[$memberId])) {
                            sendResponse(false, 'Payload chiffré incomplet', null, 400);
                        }
                    }
                }

                $msgId           = uniqid('m', true) . bin2hex(random_bytes(4));
                $senderName      = getUserDisplayName($db, $userId);
                $replyToId       = $data['replyToId'] ?? null;
                $replyToText     = $isEncrypted ? null : ($data['replyToText'] ?? null);
                $replyToSenderName = $isEncrypted ? null : ($data['replyToSenderName'] ?? null);
                $now        = date('Y-m-d H:i:s');

                $db->beginTransaction();
                try {
                    $stmt = $db->prepare(
                        "INSERT INTO group_chat_messages (id, group_id, sender_id, sender_name, message, is_encrypted, encryption_version, image_data, image_mime, reply_to_id, reply_to_text, reply_to_sender_name, created_at)
                         VALUES (:id, :gid, :sid, :sname, :msg, :enc, :encv, :imgdata, :imgmime, :rId, :rText, :rSender, :now)"
                    );
                    $stmt->execute([
                        ':id'      => $msgId,
                        ':gid'     => $groupId,
                        ':sid'     => $userId,
                        ':sname'   => $senderName,
                        ':msg'     => $isEncrypted ? '[Message chiffré]' : (!empty($text) ? $text : null),
                        ':enc'     => $isEncrypted ? 1 : 0,
                        ':encv'    => $isEncrypted ? 'e2ee-v1' : null,
                        ':imgdata' => !empty($imageBase64) ? 'enc1:' . base64_encode(encryptAtRest($imageBase64)) : null,
                        ':imgmime' => $imageMime,
                        ':rId'     => $replyToId,
                        ':rText'   => $replyToText,
                        ':rSender' => $replyToSenderName,
                        ':now'     => $now,
                    ]);

                    if ($isEncrypted) {
                        $payloadStmt = $db->prepare(
                            "INSERT INTO group_message_payloads (message_id, user_id, ciphertext, nonce, ephemeral_public_key)
                             VALUES (:mid, :uid, :ct, :nonce, :eph)"
                        );
                        foreach ($validPayloads as $payloadUser => $payload) {
                            $payloadStmt->execute([
                                ':mid'   => $msgId,
                                ':uid'   => $payloadUser,
                                ':ct'    => $payload['ciphertext'],
                                ':nonce' => $payload['nonce'],
                                ':eph'   => $payload['ephemeralPublicKey'],
                            ]);
                        }
                    }
                    $db->commit();
                } catch (Exception $e) {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    throw $e;
                }

                // Mettre à jour updated_at du groupe
                $db->prepare("UPDATE group_chats SET updated_at = :now WHERE id = :gid")
                   ->execute([':now' => $now, ':gid' => $groupId]);

                $notifyPreview = $isEncrypted
                    ? (!empty($imageBase64) ? '📷 Photo' : 'Nouveau message')
                    : (!empty($text) ? $text : '📷 Photo');
                notifyGroupMembers($db, $groupId, $userId, $senderName, $notifyPreview, $msgId);

                sendResponse(true, 'Message envoyé', [
                    'id'               => $msgId,
                    'senderId'         => $userId,
                    'senderName'       => $senderName,
                    'text'             => $isEncrypted ? '' : $text,
                    'isEncrypted'      => $isEncrypted,
                    'imageMime'        => $imageMime,
                    'replyToId'        => $replyToId,
                    'replyToText'      => $replyToText,
                    'replyToSenderName'=> $replyToSenderName,
                    'createdAt'        => $now,
                ]);
            }

            // Créer un groupe
            $name    = $data['name'] ?? '';
            $members = $data['members'] ?? [];
            if (empty($name) || empty($members) || !is_array($members)) {
                sendResponse(false, 'name et members requis', null, 400);
            }
            if (!is_string($name) || mb_strlen($name) > 100) {
                sendResponse(false, 'Nom du groupe invalide', null, 400);
            }

            // Seuls les amis du créateur peuvent être ajoutés (identité relue en base, jamais fournie par le client)
            $memberIds = [];
            foreach (array_slice($members, 0, GROUP_MAX_MEMBERS) as $m) {
                $memberId = is_array($m) ? ($m['userId'] ?? '') : '';
                if (!is_string($memberId) || $memberId === '' || $memberId === $userId || isset($memberIds[$memberId])) {
                    continue;
                }
                if (areMutualFriends($db, $userId, $memberId)) {
                    $memberIds[$memberId] = true;
                }
            }
            $memberIds = array_keys($memberIds);
            if (empty($memberIds)) {
                sendResponse(false, 'Seuls vos amis peuvent être ajoutés à un groupe', null, 400);
            }

            $groupId = uniqid('gc', true);
            $now     = date('Y-m-d H:i:s');

            $db->prepare(
                "INSERT INTO group_chats (id, name, created_by, created_at, updated_at)
                 VALUES (:id, :name, :uid, :now, :now2)"
            )->execute([':id' => $groupId, ':name' => $name, ':uid' => $userId, ':now' => $now, ':now2' => $now]);

            // Ajouter le créateur comme membre
            $db->prepare(
                "INSERT IGNORE INTO group_chat_members (group_id, user_id, first_name, last_name, photo)
                 SELECT :gid, id, first_name, last_name, photo FROM users WHERE id = :uid"
            )->execute([':gid' => $groupId, ':uid' => $userId]);

            // Ajouter les autres membres
            $mStmt = $db->prepare(
                "INSERT IGNORE INTO group_chat_members (group_id, user_id, first_name, last_name, photo)
                 SELECT :gid, id, first_name, last_name, photo FROM users WHERE id = :uid"
            );
            foreach ($memberIds as $memberId) {
                $mStmt->execute([':gid' => $groupId, ':uid' => $memberId]);
            }

            // Récupérer les membres insérés
            $mGet = $db->prepare(
                "SELECT user_id AS userId, first_name AS firstName, last_name AS lastName, photo
                 FROM group_chat_members WHERE group_id = :gid"
            );
            $mGet->execute([':gid' => $groupId]);
            $insertedMembers = $mGet->fetchAll(PDO::FETCH_ASSOC);

            // Envoyer une notification à chaque membre ajouté (sauf le créateur)
            try {
                $fcm = new FCMService();
                $creatorStmt = $db->prepare('SELECT first_name, last_name FROM users WHERE id = :uid');
                $creatorStmt->execute([':uid' => $userId]);
                $creator = $creatorStmt->fetch(PDO::FETCH_ASSOC);
                $creatorName = trim(($creator['first_name'] ?? '') . ' ' . ($creator['last_name'] ?? '')) ?: 'Quelqu\'un';
                foreach ($memberIds as $memberId) {
                    $token = $fcm->getUserToken($db, $memberId);
                    if ($token && $fcm->isMessageNotificationEnabled($db, $memberId)) {
                        $fcm->sendNotification(
                            $token,
                            'Nouveau groupe',
                            "$creatorName vous a ajouté au groupe \"$name\"",
                            ['type' => 'group_added', 'groupId' => $groupId, 'groupName' => $name],
                            'group_added_' . $groupId . '_' . $memberId
                        );
                    }
                }
            } catch (Exception $e) {
                error_log('FCM group notification error: ' . $e->getMessage());
            }

            sendResponse(true, 'Groupe créé', [
                'id'        => $groupId,
                'name'      => $name,
                'createdBy' => $userId,
                'createdAt' => $now,
                'updatedAt' => $now,
                'members'   => array_map(function($m) {
                    return [
                        'userId'    => $m['userId'],
                        'contactId' => '',
                        'firstName' => $m['firstName'],
                        'lastName'  => $m['lastName'] ?? '',
                        'photo'     => $m['photo'],
                    ];
                }, $insertedMembers),
                'messages' => [],
            ], 201);
            break;

        // ── PUT ──────────────────────────────────────────────────────────────────
        case 'PUT':
            // Renommer un groupe (tous les membres peuvent)
            $groupId = $data['id'] ?? '';
            $name    = $data['name'] ?? '';
            if (empty($groupId) || empty($name)) {
                sendResponse(false, 'id et name requis', null, 400);
            }
            $checkStmt = $db->prepare(
                "SELECT 1 FROM group_chat_members WHERE group_id = :gid AND user_id = :uid"
            );
            $checkStmt->execute([':gid' => $groupId, ':uid' => $userId]);
            if ($checkStmt->rowCount() === 0) {
                sendResponse(false, 'Accès refusé', null, 403);
            }
            $db->prepare("UPDATE group_chats SET name = :name, updated_at = NOW() WHERE id = :id")
               ->execute([':name' => $name, ':id' => $groupId]);
            sendResponse(true, 'Groupe renommé');
            break;

        // ── DELETE ───────────────────────────────────────────────────────────────
        case 'DELETE':
            if ($action === 'message') {
                $msgId = $_GET['id'] ?? '';
                if (empty($msgId)) {
                    sendResponse(false, 'id requis', null, 400);
                }
                // Seul l'expéditeur peut supprimer son message (et sa pièce jointe éventuelle)
                $delStmt = $db->prepare(
                    "SELECT attachment_type FROM group_chat_messages WHERE id = :id AND sender_id = :uid"
                );
                $delStmt->execute([':id' => $msgId, ':uid' => $userId]);
                $delRow = $delStmt->fetch(PDO::FETCH_ASSOC);
                if ($delRow && !empty($delRow['attachment_type']) && preg_match('/^[a-zA-Z0-9]{10,64}$/', $msgId)) {
                    @unlink(__DIR__ . '/uploads/group/' . $msgId . '.att.enc');
                }
                $db->prepare(
                    "DELETE FROM group_chat_messages WHERE id = :id AND sender_id = :uid"
                )->execute([':id' => $msgId, ':uid' => $userId]);
                sendResponse(true, 'Message supprimé');
            }

            // Supprimer un groupe — seul le créateur peut le faire
            $groupId = $_GET['id'] ?? '';
            if (empty($groupId)) {
                sendResponse(false, 'id requis', null, 400);
            }
            $check = $db->prepare(
                "SELECT 1 FROM group_chats WHERE id = :id AND created_by = :uid"
            );
            $check->execute([':id' => $groupId, ':uid' => $userId]);
            if ($check->rowCount() === 0) {
                sendResponse(false, 'Seul le créateur peut supprimer ce groupe', null, 403);
            }
            $db->prepare("DELETE FROM group_chats WHERE id = :id")->execute([':id' => $groupId]);
            sendResponse(true, 'Groupe supprimé');
            break;

        default:
            sendResponse(false, 'Méthode non autorisée', null, 405);
    }
} catch (Exception $e) {
    sendServerError($e);
}
