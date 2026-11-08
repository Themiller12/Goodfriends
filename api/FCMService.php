<?php
// Service pour envoyer des notifications via Firebase Cloud Messaging HTTP v1 API

class FCMService {
    private $fcmUrl;
    private $serviceAccountPath;

    public function __construct() {
        // Chemin vers le fichier de compte de service Firebase
        // Téléchargez-le depuis Firebase Console > Paramètres du projet > Comptes de service > Générer une nouvelle clé privée
        $this->serviceAccountPath = __DIR__ . '/firebase-service-account.json';

        if (!file_exists($this->serviceAccountPath)) {
            error_log('[FCMService] Fichier firebase-service-account.json introuvable dans api/');
            return;
        }

        $serviceAccount = json_decode(file_get_contents($this->serviceAccountPath), true);
        $projectId = $serviceAccount['project_id'] ?? '';
        $this->fcmUrl = "https://fcm.googleapis.com/v1/projects/{$projectId}/messages:send";
    }

    /**
     * Encodage base64 URL-safe pour JWT
     */
    private function base64urlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Obtenir un access token OAuth 2.0 via le compte de service Firebase
     */
    private $cachedAccessToken = null;

    private function getAccessToken(): string {
        // Un seul échange OAuth par requête (utile pour les envois à plusieurs membres d'un groupe)
        if ($this->cachedAccessToken !== null) {
            return $this->cachedAccessToken;
        }
        $serviceAccount = json_decode(file_get_contents($this->serviceAccountPath), true);

        $now = time();
        $header  = $this->base64urlEncode(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $payload = $this->base64urlEncode(json_encode([
            'iss'   => $serviceAccount['client_email'],
            'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
            'aud'   => 'https://oauth2.googleapis.com/token',
            'iat'   => $now,
            'exp'   => $now + 3600,
        ]));

        $signingInput = "$header.$payload";
        $privateKey   = openssl_pkey_get_private($serviceAccount['private_key']);

        if (!$privateKey) {
            throw new Exception('[FCMService] Impossible de charger la clé privée du compte de service');
        }

        openssl_sign($signingInput, $signature, $privateKey, 'SHA256');
        $jwt = "$signingInput." . $this->base64urlEncode($signature);

        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        $result = json_decode(curl_exec($ch), true);
        curl_close($ch);

        if (!isset($result['access_token'])) {
            error_log('[FCMService] Erreur auth: ' . json_encode($result));
            throw new Exception('[FCMService] Impossible d\'obtenir l\'access token');
        }

        return $this->cachedAccessToken = $result['access_token'];
    }

    /**
     * Envoyer une notification push à un utilisateur
     *
     * @param string $token Token FCM de l'appareil
     * @param string $title Titre de la notification
     * @param string $body  Corps de la notification
     * @param array  $data  Données supplémentaires (toutes les valeurs doivent être des strings)
     * @return bool
     */
    public function sendNotification($token, $title, $body, $data = [], $tag = null, $dataOnly = false) {
        if (!file_exists($this->serviceAccountPath)) {
            error_log('[FCMService] Envoi annulé : fichier de compte de service manquant');
            return false;
        }

        try {
            $accessToken = $this->getAccessToken();
        } catch (Exception $e) {
            error_log($e->getMessage());
            return false;
        }

        // FCM v1 exige que toutes les valeurs de data soient des chaînes
        $stringData = array_map('strval', $data);

        // Déterminer le bon canal Android depuis les données (pour le son/vibration)
        $channelId = isset($data['type']) ? ($data['type'] === 'friend_request' ? 'friend-requests-channel' : 'messages-channel') : 'messages-channel';

        $androidNotification = [
            'sound'                  => 'default',
            'channel_id'             => $channelId,
            'default_sound'          => true,
            'default_vibrate_timings' => true,
            'notification_priority'  => 'PRIORITY_HIGH',
            'visibility'             => 'PUBLIC',
        ];
        if ($tag !== null) {
            // Même tag = remplace la notification existante sur l'appareil
            $androidNotification['tag'] = $tag;
        }

        $message = [
            'message' => [
                'token'        => $token,
                'notification' => [
                    'title' => $title,
                    'body'  => $body,
                ],
                'data'    => $stringData,
                'android' => [
                    'priority'     => 'high',
                    'notification' => $androidNotification,
                ],
                'apns' => [
                    'payload' => [
                        'aps' => [
                            'sound' => 'default',
                            'badge' => 1,
                        ],
                    ],
                ],
            ],
        ];

        if ($dataOnly) {
            // Message de données seul : l'appareil déchiffre le contenu et affiche lui-même la notification
            unset($message['message']['notification'], $message['message']['apns']);
            $message['message']['android'] = ['priority' => 'high'];
        }

        $headers = [
            'Authorization: Bearer ' . $accessToken,
            'Content-Type: application/json',
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->fcmUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($message));

        $result   = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            error_log('[FCMService] cURL error: ' . curl_error($ch));
            curl_close($ch);
            return 'error';
        }

        curl_close($ch);
        error_log('[FCMService] Response (' . $httpCode . '): ' . $result);

        if ($httpCode === 200) return 'ok';

        // 404 = token invalide/expiré (UNREGISTERED) — à supprimer de la DB
        $decoded = json_decode($result, true);
        $status  = $decoded['error']['status'] ?? '';
        if ($httpCode === 404 && $status === 'NOT_FOUND') return 'token_invalid';

        return 'error';
    }

    /**
     * Supprimer un token FCM invalide/expiré de la DB
     */
    private function deleteInvalidToken($db, $token) {
        try {
            $stmt = $db->prepare("DELETE FROM user_fcm_tokens WHERE token = :token");
            $stmt->bindParam(':token', $token);
            $stmt->execute();
            error_log("[FCMService] Token invalide supprimé: " . substr($token, 0, 20) . "...");
        } catch (Exception $e) {
            error_log("[FCMService] Erreur suppression token: " . $e->getMessage());
        }
    }

    /**
     * Récupérer le token FCM d'un utilisateur
     *
     * @param PDO    $db     Connexion database
     * @param string $userId ID de l'utilisateur
     * @return string|null
     */
    public function getUserToken($db, $userId) {
        $info = $this->getUserTokenInfo($db, $userId);
        return $info ? $info['token'] : null;
    }

    /**
     * Récupérer le token FCM le plus récent d'un utilisateur avec sa plateforme
     *
     * @return array|null ['token' => string, 'platform' => string]
     */
    public function getUserTokenInfo($db, $userId) {
        $query = "SELECT token, platform FROM user_fcm_tokens
                  WHERE user_id = :user_id
                  ORDER BY updated_at DESC
                  LIMIT 1";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * Le destinataire a-t-il activé les notifications de messages (messages, réactions, groupes) ?
     * En cas d'erreur (ex. migration non appliquée), on notifie par défaut.
     */
    public function isMessageNotificationEnabled($db, $userId) {
        try {
            $stmt = $db->prepare("SELECT notify_messages FROM user_profiles WHERE user_id = :user_id");
            $stmt->bindParam(':user_id', $userId);
            $stmt->execute();
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ? (int) $row['notify_messages'] === 1 : true;
        } catch (Exception $e) {
            return true;
        }
    }

    /**
     * Envoyer une notification de nouveau message
     *
     * @param PDO    $db               Connexion database
     * @param string $recipientUserId  ID du destinataire
     * @param string $senderId         ID de l'expéditeur
     * @param string $senderName       Nom de l'expéditeur
     * @param string $messagePreview   Aperçu du message (en clair, vide si le message est chiffré)
     * @param string $conversationId   ID de la conversation
     * @param array|null $encrypted    Message chiffré de bout en bout : receiverCiphertext, receiverNonce,
     *                                 receiverEphemeralPublicKey, messageId, hasPhoto. Le serveur ne pouvant pas
     *                                 le lire, l'appareil le déchiffre et affiche lui-même la notification.
     * @return bool
     */
    public function sendMessageNotification($db, $recipientUserId, $senderId, $senderFirstName, $senderLastName, $senderName, $messagePreview, $conversationId, $encrypted = null, $messageId = null) {
        $tokenInfo = $this->getUserTokenInfo($db, $recipientUserId);

        if (!$tokenInfo) {
            error_log("[FCMService] Aucun token FCM pour l'utilisateur: $recipientUserId");
            return false;
        }

        if (!$this->isMessageNotificationEnabled($db, $recipientUserId)) {
            return true;
        }
        $token = $tokenInfo['token'];

        // Compter les messages non lus de cet expéditeur et récupérer les aperçus
        $unreadStmt = $db->prepare(
            "SELECT message, photo_url, attachment_type, is_encrypted, created_at
             FROM messages
             WHERE sender_id = :sender_id AND receiver_id = :recipient_id AND is_read = FALSE
             ORDER BY created_at ASC"
        );
        $unreadStmt->bindParam(':sender_id', $senderId);
        $unreadStmt->bindParam(':recipient_id', $recipientUserId);
        $unreadStmt->execute();
        $unreadRows = $unreadStmt->fetchAll(PDO::FETCH_ASSOC);

        $unreadCount = count($unreadRows);

        $data = [
            'type'            => 'message',
            'conversationId'  => $conversationId,
            'senderId'        => (string) $senderId,
            'senderName'      => $senderName,
            'senderFirstName' => $senderFirstName,
            'senderLastName'  => $senderLastName,
            'recipientId'     => (string) $recipientUserId,
            'messageId'       => (string) ($messageId ?? ''),
            'unreadCount'     => (string) max(1, $unreadCount),
        ];

        // Limite FCM de 4 Ko pour les données : au-delà, on retombe sur une notification générique
        $canDeliverEncrypted = $encrypted !== null
            && ($tokenInfo['platform'] ?? 'android') === 'android'
            && strlen($encrypted['receiverCiphertext'] . $encrypted['receiverNonce'] . $encrypted['receiverEphemeralPublicKey']) <= 2500;

        if ($canDeliverEncrypted) {
            $data += [
                'encrypted'          => '1',
                'hasPhoto'           => !empty($encrypted['hasPhoto']) ? '1' : '0',
                'ciphertext'         => $encrypted['receiverCiphertext'],
                'nonce'              => $encrypted['receiverNonce'],
                'ephemeralPublicKey' => $encrypted['receiverEphemeralPublicKey'],
            ];
            $result = $this->sendNotification($token, '', '', $data, 'msg_' . $conversationId, true);
            if ($result === 'token_invalid') {
                $this->deleteInvalidToken($db, $token);
            }
            return $result === 'ok';
        }

        if ($encrypted !== null) {
            $messagePreview = !empty($encrypted['hasPhoto']) ? '📷 Photo' : 'Nouveau message';
        }

        if ($unreadCount <= 1) {
            $title = "Nouveau message de $senderName";
            $body  = mb_substr($messagePreview, 0, 100);
        } else {
            $title = "$senderName ($unreadCount nouveaux messages)";
            // Construire un aperçu des derniers messages (max 3)
            $previews = [];
            foreach (array_slice($unreadRows, -3) as $row) {
                $text = !empty($row['message']) ? $row['message'] : '📷 Photo';
                if ((int) ($row['is_encrypted'] ?? 0) === 1) {
                    $text = !empty($row['photo_url']) ? '📷 Photo' : 'Nouveau message';
                }
                if ($row['attachment_type'] === 'voice') {
                    $text = '🎤 Message vocal';
                } elseif ($row['attachment_type'] === 'file') {
                    $text = '📎 Fichier';
                }
                $previews[] = mb_substr($text, 0, 60);
            }
            $body = implode("\n", $previews);
        }

        $result = $this->sendNotification($token, $title, $body, $data, 'msg_' . $conversationId);
        if ($result === 'token_invalid') {
            $this->deleteInvalidToken($db, $token);
        }
        return $result === 'ok';
    }

    /**
     * Envoyer une notification de nouveau message de groupe à tous les membres sauf l'expéditeur
     * (même canal, même réglage "Notifications de messages" et même mécanique que les messages privés).
     */
    public function sendGroupMessageNotification($db, $groupId, $groupName, $senderId, $senderName, $messagePreview, $messageId = null) {
        $stmt = $db->prepare("SELECT user_id FROM group_chat_members WHERE group_id = :gid AND user_id <> :sid");
        $stmt->execute([':gid' => $groupId, ':sid' => $senderId]);
        $memberIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $title = $groupName !== '' ? $groupName : 'Nouveau message de groupe';
        $body  = mb_substr(($senderName !== '' ? $senderName . ' : ' : '') . $messagePreview, 0, 120);

        foreach ($memberIds as $memberId) {
            try {
                if (!$this->isMessageNotificationEnabled($db, $memberId)) {
                    continue;
                }
                $token = $this->getUserToken($db, $memberId);
                if (!$token) {
                    continue;
                }
                $result = $this->sendNotification($token, $title, $body, [
                    'type'        => 'group_message',
                    'groupId'     => (string) $groupId,
                    'groupName'   => (string) $groupName,
                    'senderId'    => (string) $senderId,
                    'senderName'  => (string) $senderName,
                    'recipientId' => (string) $memberId,
                    'messageId'   => (string) ($messageId ?? ''),
                ], 'group_' . $groupId);
                if ($result === 'token_invalid') {
                    $this->deleteInvalidToken($db, $token);
                }
            } catch (Exception $e) {
                error_log('[FCMService] Notification de groupe : ' . $e->getMessage());
            }
        }
    }

    /**
     * Envoyer une notification de demande d'ami
     */
    public function sendFriendRequestNotification($db, $recipientUserId, $senderId, $senderName, $senderEmail) {
        $token = $this->getUserToken($db, $recipientUserId);

        if (!$token) {
            error_log("[FCMService] Aucun token FCM pour l'utilisateur: $recipientUserId");
            return false;
        }

        $title = "👋 Nouvelle demande d'ami";
        $body  = "$senderName souhaite vous ajouter en ami";

        $data = [
            'type'        => 'friend_request',
            'senderId'    => (string) $senderId,
            'senderName'  => $senderName,
            'senderEmail' => $senderEmail,
        ];

        $result = $this->sendNotification($token, $title, $body, $data, 'fr_' . $senderId);
        if ($result === 'token_invalid') {
            $this->deleteInvalidToken($db, $token);
        }
        return $result === 'ok';
    }
}
