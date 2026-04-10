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

        // ── GET ──────────────────────────────────────────────────────────────────
        case 'GET':
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
                    "SELECT id, sender_id AS senderId, sender_name AS senderName, message AS text,
                            image_data AS imageBase64, image_mime AS imageMime,
                            reply_to_id AS replyToId, reply_to_text AS replyToText,
                            reply_to_sender_name AS replyToSenderName,
                            created_at AS createdAt
                     FROM group_chat_messages
                     WHERE group_id = :gid
                     ORDER BY created_at ASC"
                );
                $stmt->execute([':gid' => $groupId]);
                $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

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
                    if ($token) {
                        $preview = !empty($msgRow['sender_name']) ? $msgRow['sender_name'] : 'votre message';
                        $fcm->sendNotification(
                            $token,
                            "$reactorName a réagi",
                            "$reactorName a réagi $emoji à votre message",
                            ['type' => 'reaction', 'messageId' => $messageId, 'emoji' => $emoji, 'reactorId' => (string)$userId],
                            'reaction_' . $messageId
                        );
                    }
                }

                sendResponse(true, 'Réaction mise à jour', ['reactions' => $reactions]);
            }

            if ($action === 'message') {
                // Envoyer un message
                $groupId     = $data['groupId'] ?? '';
                $text        = $data['text'] ?? '';
                $imageBase64 = $data['imageBase64'] ?? null;
                $imageMime   = $data['imageMime'] ?? null;
                if (empty($groupId) || (empty($text) && empty($imageBase64))) {
                    sendResponse(false, 'groupId et text ou imageBase64 requis', null, 400);
                }

                // Vérifier membership
                $checkStmt = $db->prepare(
                    "SELECT 1 FROM group_chat_members WHERE group_id = :gid AND user_id = :uid"
                );
                $checkStmt->execute([':gid' => $groupId, ':uid' => $userId]);
                if ($checkStmt->rowCount() === 0) {
                    sendResponse(false, 'Accès refusé', null, 403);
                }

                $msgId           = uniqid('m', true) . bin2hex(random_bytes(4));
                $senderName      = $data['senderName'] ?? '';
                $replyToId       = $data['replyToId'] ?? null;
                $replyToText     = $data['replyToText'] ?? null;
                $replyToSenderName = $data['replyToSenderName'] ?? null;
                $now        = date('Y-m-d H:i:s');

                $stmt = $db->prepare(
                    "INSERT INTO group_chat_messages (id, group_id, sender_id, sender_name, message, image_data, image_mime, reply_to_id, reply_to_text, reply_to_sender_name, created_at)
                     VALUES (:id, :gid, :sid, :sname, :msg, :imgdata, :imgmime, :rId, :rText, :rSender, :now)"
                );
                $stmt->execute([
                    ':id'      => $msgId,
                    ':gid'     => $groupId,
                    ':sid'     => $userId,
                    ':sname'   => $senderName,
                    ':msg'     => !empty($text) ? $text : null,
                    ':imgdata' => $imageBase64,
                    ':imgmime' => $imageMime,
                    ':rId'     => $replyToId,
                    ':rText'   => $replyToText,
                    ':rSender' => $replyToSenderName,
                    ':now'     => $now,
                ]);

                // Mettre à jour updated_at du groupe
                $db->prepare("UPDATE group_chats SET updated_at = :now WHERE id = :gid")
                   ->execute([':now' => $now, ':gid' => $groupId]);

                sendResponse(true, 'Message envoyé', [
                    'id'               => $msgId,
                    'senderId'         => $userId,
                    'senderName'       => $senderName,
                    'text'             => $text,
                    'imageBase64'      => $imageBase64,
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
            if (empty($name) || empty($members)) {
                sendResponse(false, 'name et members requis', null, 400);
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
                 VALUES (:gid, :uid, :fn, :ln, :photo)"
            );
            foreach ($members as $m) {
                if (empty($m['userId'])) continue;
                $mStmt->execute([
                    ':gid'   => $groupId,
                    ':uid'   => $m['userId'],
                    ':fn'    => $m['firstName'] ?? '',
                    ':ln'    => $m['lastName'] ?? '',
                    ':photo' => $m['photo'] ?? null,
                ]);
            }

            // Récupérer les membres insérés
            $mGet = $db->prepare(
                "SELECT user_id AS userId, first_name AS firstName, last_name AS lastName, photo
                 FROM group_chat_members WHERE group_id = :gid"
            );
            $mGet->execute([':gid' => $groupId]);
            $insertedMembers = $mGet->fetchAll(PDO::FETCH_ASSOC);

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
                // Seul l'expéditeur peut supprimer son message
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
    sendResponse(false, 'Erreur serveur : ' . $e->getMessage(), null, 500);
}
