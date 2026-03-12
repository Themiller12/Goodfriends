<?php
// Configuration de la base de données (sans les headers JSON)
define('DB_HOST', 'localhost');
define('DB_NAME', 'goodfriends');
define('DB_USER', 'root');
define('DB_PASS', 'NSsu2J5CVeCMHUXhkP6p');
define('API_VERSION', '1.0');

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
            throw $e;
        }
        
        return $this->conn;
    }
}

// Page de test de l'API
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Goodfriends API - Test</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #2196F3;
            padding-bottom: 10px;
        }
        h2 {
            color: #2196F3;
            margin-top: 30px;
        }
        .endpoint {
            background: #f9f9f9;
            padding: 15px;
            margin: 10px 0;
            border-left: 4px solid #4CAF50;
            border-radius: 5px;
        }
        .method {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 3px;
            font-weight: bold;
            color: white;
            margin-right: 10px;
        }
        .post { background: #FF9800; }
        .get { background: #4CAF50; }
        .put { background: #2196F3; }
        .delete { background: #f44336; }
        code {
            background: #272822;
            color: #f8f8f2;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        pre {
            background: #272822;
            color: #f8f8f2;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
        .status {
            padding: 10px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 API Goodfriends v<?php echo API_VERSION; ?></h1>
        
        <?php
        // Tester la connexion à la base de données
        try {
            $database = new Database();
            $db = $database->getConnection();
            echo '<div class="status success">✓ Connexion à la base de données réussie</div>';
            
            // Vérifier les tables
            $tables = ['users', 'contacts', 'groups', 'children', 'relationships', 'contact_groups'];
            $missingTables = [];
            
            foreach ($tables as $table) {
                $query = "SHOW TABLES LIKE '$table'";
                $stmt = $db->query($query);
                if ($stmt->rowCount() === 0) {
                    $missingTables[] = $table;
                }
            }
            
            if (empty($missingTables)) {
                echo '<div class="status success">✓ Toutes les tables sont présentes</div>';
            } else {
                echo '<div class="status error">✗ Tables manquantes : ' . implode(', ', $missingTables) . '<br>';
                echo 'Veuillez importer le fichier database.sql</div>';
            }
            
        } catch (Exception $e) {
            echo '<div class="status error">✗ Erreur de connexion : ' . $e->getMessage() . '</div>';
        }
        ?>
        
        <div class="status info">
            <strong>Base URL :</strong> <?php echo 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']); ?>
        </div>
        
        <h2>📝 Endpoints disponibles</h2>
        
        <h3>Authentification (auth.php)</h3>
        
        <div class="endpoint">
            <span class="method post">POST</span>
            <code>auth.php?action=register</code>
            <pre>{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}</pre>
        </div>
        
        <div class="endpoint">
            <span class="method post">POST</span>
            <code>auth.php?action=login</code>
            <pre>{
  "email": "user@example.com",
  "password": "password123"
}</pre>
        </div>
        
        <div class="endpoint">
            <span class="method post">POST</span>
            <code>auth.php?action=verify</code>
            <pre>{
  "email": "user@example.com",
  "code": "123456"
}</pre>
        </div>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>auth.php?action=profile</code>
            <p>Headers: <code>Authorization: Bearer [token]</code></p>
        </div>
        
        <h3>Contacts (contacts.php)</h3>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>contacts.php</code>
            <p>Headers: <code>Authorization: Bearer [token]</code></p>
        </div>
        
        <div class="endpoint">
            <span class="method post">POST</span>
            <code>contacts.php</code>
            <p>Headers: <code>Authorization: Bearer [token]</code></p>
            <pre>{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane@example.com",
  "phone": "+33612345678",
  "groupIds": []
}</pre>
        </div>
        
        <h3>Groupes (groups.php)</h3>
        
        <div class="endpoint">
            <span class="method get">GET</span>
            <code>groups.php</code>
            <p>Headers: <code>Authorization: Bearer [token]</code></p>
        </div>
        
        <div class="endpoint">
            <span class="method post">POST</span>
            <code>groups.php</code>
            <p>Headers: <code>Authorization: Bearer [token]</code></p>
            <pre>{
  "name": "Famille",
  "type": "family",
  "description": "Mon groupe famille"
}</pre>
        </div>
        
        <h2>🧪 Tester l'API</h2>
        
        <div class="status info">
            <p><strong>Avec curl (Windows PowerShell) :</strong></p>
            <pre>
# Register
$body = @{
    email = "test@test.com"
    password = "password123"
    firstName = "Test"
    lastName = "User"
} | ConvertTo-Json

Invoke-RestMethod -Uri "<?php echo 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']); ?>/auth.php?action=register" `
    -Method POST -Body $body -ContentType "application/json"

# Login
$body = @{
    email = "test@test.com"
    password = "password123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "<?php echo 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']); ?>/auth.php?action=login" `
    -Method POST -Body $body -ContentType "application/json"
            </pre>
        </div>
        
        <div class="status info">
            <p><strong>Avec Postman :</strong></p>
            <ol>
                <li>Créez une nouvelle requête POST</li>
                <li>URL : <code><?php echo 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']); ?>/auth.php?action=register</code></li>
                <li>Body → raw → JSON</li>
                <li>Collez le JSON d'exemple ci-dessus</li>
                <li>Cliquez sur Send</li>
            </ol>
        </div>
        
        <h2>📚 Documentation complète</h2>
        <p>Consultez le fichier <code>README.md</code> pour la documentation complète de l'API.</p>
    </div>
</body>
</html>
