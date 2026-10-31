<?php
// Les secrets ne sont pas versionnés : ils viennent de config.local.php (modèle : config.local.example.php)
// ou de variables d'environnement.
if (file_exists(__DIR__ . '/config.local.php')) {
    require_once __DIR__ . '/config.local.php';
}

function defineFromConfig($name, $default = null) {
    if (defined($name)) {
        return;
    }
    $env = getenv($name);
    define($name, ($env !== false && $env !== '') ? $env : $default);
}

defineFromConfig('DB_HOST', 'localhost');
defineFromConfig('DB_NAME', 'goodfriends');
defineFromConfig('DB_USER', 'root');
defineFromConfig('DB_PASS');
defineFromConfig('JWT_SECRET');
defineFromConfig('PHOTO_ENC_KEY');
defineFromConfig('API_BASE_URL', 'https://volt-services.fr/DEV/goodfriends/api');
define('API_VERSION', '1.0');

// Pas de CORS : l'API n'est appelée que par l'application mobile.
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');

// Gérer les requêtes OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Connexion à la base de données
class Database {
    private $conn;
    
    public function getConnection() {
        $this->conn = null;
        
        try {
            if (DB_PASS === null) {
                throw new Exception('DB_PASS non configuré');
            }
            $this->conn = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME,
                DB_USER,
                DB_PASS
            );
            $this->conn->exec("set names utf8mb4");
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch(Exception $e) {
            error_log('[API] Connexion base de données impossible: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Service temporairement indisponible'
            ]);
            exit();
        }
        
        return $this->conn;
    }
}

// Fonction pour générer un ID unique
function generateId() {
    return uniqid() . bin2hex(random_bytes(8));
}

// Fonction pour envoyer une réponse JSON
function sendResponse($success, $message, $data = null, $code = 200) {
    http_response_code($code);
    $response = [
        'success' => $success,
        'message' => $message
    ];
    
    if ($data !== null) {
        $response['data'] = $data;
    }
    
    echo json_encode($response);
    exit();
}

// Réponse 500 générique : le détail de l'exception reste dans les logs serveur.
function sendServerError($e, $message = 'Erreur serveur') {
    error_log('[API] ' . get_class($e) . ': ' . $e->getMessage());
    sendResponse(false, $message, null, 500);
}

// Chiffrement au repos (AES-256-GCM) des photos : la clé PHOTO_ENC_KEY (64 caractères hexadécimaux) reste hors du dépôt.
function getPhotoEncryptionKey() {
    if (!is_string(PHOTO_ENC_KEY) || !preg_match('/^[0-9a-fA-F]{64}$/', PHOTO_ENC_KEY)) {
        error_log('[API] PHOTO_ENC_KEY absent ou invalide (64 caractères hexadécimaux attendus)');
        sendResponse(false, 'Service temporairement indisponible', null, 500);
    }
    return hex2bin(PHOTO_ENC_KEY);
}

function encryptAtRest($plain) {
    $iv = random_bytes(12);
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', getPhotoEncryptionKey(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        throw new RuntimeException('Chiffrement impossible');
    }
    return $iv . $tag . $cipher;
}

// Retourne false si le contenu est altéré ou la clé incorrecte
function decryptAtRest($blob) {
    if (strlen($blob) < 29) {
        return false;
    }
    return openssl_decrypt(substr($blob, 28), 'aes-256-gcm', getPhotoEncryptionKey(), OPENSSL_RAW_DATA, substr($blob, 0, 12), substr($blob, 12, 16));
}

function base64UrlEncode($value) {
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64UrlDecode($value) {
    return base64_decode(strtr($value, '-_', '+/'), true);
}

function getJwtSecret() {
    if (!is_string(JWT_SECRET) || strlen(JWT_SECRET) < 32) {
        error_log('[API] JWT_SECRET absent ou trop court (32 caractères minimum)');
        sendResponse(false, 'Service temporairement indisponible', null, 500);
    }
    return JWT_SECRET;
}

function getAuthorizationHeader() {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return $_SERVER['HTTP_AUTHORIZATION'];
    }
    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                return $value;
            }
        }
    }
    return null;
}

// Vérifie la signature HS256 et l'expiration du token, retourne l'id utilisateur
function verifyToken() {
    $header = getAuthorizationHeader();
    
    if ($header === null) {
        sendResponse(false, 'Token manquant', null, 401);
    }
    
    $token = trim(preg_replace('/^Bearer\s+/i', '', $header));
    
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        sendResponse(false, 'Token invalide', null, 401);
    }
    
    $expected = base64UrlEncode(hash_hmac('sha256', "$parts[0].$parts[1]", getJwtSecret(), true));
    if (!hash_equals($expected, $parts[2])) {
        sendResponse(false, 'Token invalide', null, 401);
    }
    
    $jwtHeader = json_decode((string)base64UrlDecode($parts[0]), true);
    $payload = json_decode((string)base64UrlDecode($parts[1]), true);
    
    if (!is_array($jwtHeader) || ($jwtHeader['alg'] ?? '') !== 'HS256'
        || !is_array($payload) || !isset($payload['user_id']) || !isset($payload['exp'])) {
        sendResponse(false, 'Token invalide', null, 401);
    }
    
    if ($payload['exp'] < time()) {
        sendResponse(false, 'Token expiré', null, 401);
    }
    
    return $payload['user_id'];
}

// Fonction pour créer un token JWT (HS256)
function createToken($userId) {
    $header = base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    
    $payload = base64UrlEncode(json_encode([
        'user_id' => $userId,
        'exp' => time() + (30 * 24 * 60 * 60) // 30 jours
    ]));
    
    $signature = base64UrlEncode(hash_hmac('sha256', "$header.$payload", getJwtSecret(), true));
    
    return "$header.$payload.$signature";
}
?>
