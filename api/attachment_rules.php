<?php
// Règles et utilitaires communs aux pièces jointes (messages vocaux et fichiers) des conversations
// individuelles (messages.php) et de groupe (group_chats.php).

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

/**
 * Valide une pièce jointe envoyée par le client (kind = 'voice' ou 'file') et répond en erreur si elle est refusée.
 *
 * @return array [binaire, type MIME, nom, durée en ms (voice) ou null, texte du message]
 */
function parseAttachmentUpload(array $data, string $kind): array {
    $binary = base64_decode((string)($data['data'] ?? ''), true);
    if ($binary === false || strlen($binary) < 1) {
        sendResponse(false, 'Données invalides', null, 400);
    }
    if (strlen($binary) > ATTACHMENT_MAX_BYTES) {
        sendResponse(false, 'Fichier trop volumineux (max 5 Mo)', null, 413);
    }

    if ($kind === 'voice') {
        // Enregistrement AAC dans un conteneur MP4 (.m4a)
        if (class_exists('finfo')
            && !in_array((new finfo(FILEINFO_MIME_TYPE))->buffer($binary), ['audio/mp4', 'video/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg'], true)) {
            sendResponse(false, 'Format audio non autorisé', null, 400);
        }
        $durationMs = max(0, min(VOICE_MAX_DURATION_MS, (int)($data['durationMs'] ?? 0)));
        return [$binary, 'audio/mp4', 'Message vocal.m4a', $durationMs, '🎤 Message vocal'];
    }

    $rawName = isset($data['fileName']) && is_string($data['fileName']) ? trim($data['fileName']) : '';
    $attachmentName = mb_substr(preg_replace('/[\x00-\x1F\x7F\\\\\/:*?"<>|]+/u', '_', $rawName), 0, 150);
    $extension = strtolower(pathinfo($attachmentName, PATHINFO_EXTENSION));
    if ($attachmentName === '' || !isset(ATTACHMENT_EXTENSIONS[$extension])) {
        sendResponse(false, 'Type de fichier non autorisé', null, 400);
    }
    return [$binary, ATTACHMENT_EXTENSIONS[$extension], $attachmentName, null, '📎 ' . $attachmentName];
}

/**
 * Déchiffre et sert une pièce jointe stockée au repos (avec lecture partielle pour le lecteur audio d'Android).
 */
function streamAttachment(string $file, string $attachmentType, string $attachmentName): void {
    $decrypted = decryptAtRest(file_get_contents($file));
    $separator = $decrypted === false ? false : strpos($decrypted, "\n");
    if ($separator === false) {
        error_log('[API] Pièce jointe illisible ou altérée : ' . basename($file));
        sendResponse(false, 'Fichier introuvable', null, 404);
    }
    $attMime = substr($decrypted, 0, $separator);
    $body = substr($decrypted, $separator + 1);
    $total = strlen($body);
    $start = 0;
    $end = $total - 1;

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

    $isVoice = $attachmentType === 'voice';
    $safeName = preg_replace('/[^A-Za-z0-9._-]+/', '_', $attachmentName);
    header('Content-Type: ' . $attMime);
    header('Content-Disposition: ' . ($isVoice ? 'inline' : 'attachment')
        . '; filename="' . $safeName . '"; filename*=UTF-8\'\'' . rawurlencode($attachmentName));
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . ($end - $start + 1));
    header('Cache-Control: private, max-age=86400');
    echo substr($body, $start, $end - $start + 1);
    exit();
}
