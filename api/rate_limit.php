<?php
// Limitation des tentatives (fenêtre glissante) stockée dans la table rate_limits.
// Si la table est absente ou indisponible, on laisse passer (et on journalise) plutôt que de bloquer l'API.

function clientIp() {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}

function rateLimitBucket($scope, $value) {
    return $scope . ':' . substr(hash('sha256', strtolower((string)$value)), 0, 40);
}

function rateLimitCount(PDO $db, $bucket, $windowSeconds) {
    $stmt = $db->prepare(
        "SELECT COUNT(*) FROM rate_limits
         WHERE bucket = :bucket AND created_at > DATE_SUB(NOW(), INTERVAL " . (int)$windowSeconds . " SECOND)"
    );
    $stmt->execute([':bucket' => $bucket]);
    return (int)$stmt->fetchColumn();
}

// Répond 429 si le quota est atteint pour ce critère (IP, email, utilisateur...)
function rateLimitCheck(PDO $db, $scope, $value, $max, $windowSeconds) {
    try {
        if (rateLimitCount($db, rateLimitBucket($scope, $value), $windowSeconds) >= $max) {
            header('Retry-After: ' . (int)$windowSeconds);
            $minutes = (int)ceil($windowSeconds / 60);
            sendResponse(false, 'Trop de tentatives. Réessayez dans ' . $minutes . ' minute' . ($minutes > 1 ? 's' : '') . '.', null, 429);
        }
    } catch (PDOException $e) {
        error_log('[API] rateLimitCheck: ' . $e->getMessage());
    }
}

// Enregistre une tentative
function rateLimitHit(PDO $db, $scope, $value) {
    try {
        $stmt = $db->prepare("INSERT INTO rate_limits (bucket) VALUES (:bucket)");
        $stmt->execute([':bucket' => rateLimitBucket($scope, $value)]);

        if (random_int(1, 50) === 1) {
            $db->exec("DELETE FROM rate_limits WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
        }
    } catch (PDOException $e) {
        error_log('[API] rateLimitHit: ' . $e->getMessage());
    }
}

// Vérifie puis enregistre la tentative (pour les actions qui envoient un email)
function rateLimitConsume(PDO $db, $scope, $value, $max, $windowSeconds) {
    rateLimitCheck($db, $scope, $value, $max, $windowSeconds);
    rateLimitHit($db, $scope, $value);
}

// Efface les tentatives d'un critère (ex. après une connexion réussie)
function rateLimitReset(PDO $db, $scope, $value) {
    try {
        $stmt = $db->prepare("DELETE FROM rate_limits WHERE bucket = :bucket");
        $stmt->execute([':bucket' => rateLimitBucket($scope, $value)]);
    } catch (PDOException $e) {
        error_log('[API] rateLimitReset: ' . $e->getMessage());
    }
}
