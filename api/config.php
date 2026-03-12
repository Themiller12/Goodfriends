<?php
// Configuration de la base de données
define('DB_HOST', 'localhost');
define('DB_NAME', 'goodfriends');
define('DB_USER', 'root');
define('DB_PASS', 'NSsu2J5CVeCMHUXhkP6p');

// Configuration de l'API
define('API_VERSION', '1.0');
define('JWT_SECRET', 'your_secret_key_change_this_in_production'); // Changez ceci en production

// Configuration CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=UTF-8');

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
            $this->conn = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME,
                DB_USER,
                DB_PASS
            );
            $this->conn->exec("set names utf8mb4");
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch(PDOException $e) {
            echo json_encode([
                'success' => false,
                'message' => 'Erreur de connexion: ' . $e->getMessage()
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

// Fonction pour vérifier le token JWT (simple)
function verifyToken() {
    $headers = apache_request_headers();
    
    if (!isset($headers['Authorization'])) {
        sendResponse(false, 'Token manquant', null, 401);
    }
    
    $token = str_replace('Bearer ', '', $headers['Authorization']);
    
    // Vérification simple du token (en production, utilisez une vraie bibliothèque JWT)
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        sendResponse(false, 'Token invalide', null, 401);
    }
    
    try {
        $payload = json_decode(base64_decode($parts[1]), true);
        
        if (!isset($payload['user_id']) || !isset($payload['exp'])) {
            sendResponse(false, 'Token invalide', null, 401);
        }
        
        if ($payload['exp'] < time()) {
            sendResponse(false, 'Token expiré', null, 401);
        }
        
        return $payload['user_id'];
    } catch (Exception $e) {
        sendResponse(false, 'Token invalide', null, 401);
    }
}

// Fonction pour créer un token JWT (simple)
function createToken($userId) {
    $header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
    $header = rtrim(strtr(base64_encode($header), '+/', '-_'), '=');
    
    $payload = json_encode([
        'user_id' => $userId,
        'exp' => time() + (30 * 24 * 60 * 60) // 30 jours
    ]);
    $payload = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
    
    $signature = hash_hmac('sha256', "$header.$payload", JWT_SECRET, true);
    $signature = rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');
    
    return "$header.$payload.$signature";
}
?>
