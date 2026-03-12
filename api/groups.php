<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$userId = verifyToken();

// GET ALL - Récupérer tous les groupes
if ($method === 'GET' && !isset($_GET['id'])) {
    
    $query = "SELECT g.*, COUNT(cg.contact_id) as contact_count, GROUP_CONCAT(cg.contact_id) as contact_ids
              FROM groups g 
              LEFT JOIN contact_groups cg ON g.id = cg.group_id
              WHERE g.user_id = :user_id 
              GROUP BY g.id
              ORDER BY g.name";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $userId);
    $stmt->execute();
    
    $groups = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $groups[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'type' => $row['type'],
            'description' => $row['description'],
            'color' => $row['color'] ?? '#4CAF50',
            'contactIds' => $row['contact_ids'] ? explode(',', $row['contact_ids']) : [],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at']
        ];
    }
    
    sendResponse(true, 'Groupes récupérés', $groups);
}

// CREATE - Créer un groupe
if ($method === 'POST') {
    
    if (!isset($data['name'])) {
        sendResponse(false, 'Nom du groupe requis', null, 400);
    }
    
    // Utiliser l'ID du client s'il est fourni, sinon en générer un nouveau
    $groupId = isset($data['id']) && !empty($data['id']) ? $data['id'] : generateId();
    
    $query = "INSERT INTO groups (id, user_id, name, type, description, color) 
              VALUES (:id, :user_id, :name, :type, :description, :color)";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $groupId);
    $stmt->bindParam(':user_id', $userId);
    $stmt->bindParam(':name', $data['name']);
    $stmt->bindParam(':type', $data['type']);
    $stmt->bindParam(':description', $data['description']);
    $stmt->bindParam(':color', $data['color']);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Groupe créé avec succès', ['id' => $groupId], 201);
    } else {
        sendResponse(false, 'Erreur lors de la création', null, 500);
    }
}

// UPDATE - Mettre à jour un groupe
if ($method === 'PUT') {
    
    if (!isset($data['id'])) {
        sendResponse(false, 'ID du groupe requis', null, 400);
    }
    
    $query = "UPDATE groups SET 
              name = :name,
              type = :type,
              description = :description,
              color = :color,
              updated_at = NOW()
              WHERE id = :id AND user_id = :user_id";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':name', $data['name']);
    $stmt->bindParam(':type', $data['type']);
    $stmt->bindParam(':description', $data['description']);
    $stmt->bindParam(':color', $data['color']);
    $stmt->bindParam(':id', $data['id']);
    $stmt->bindParam(':user_id', $userId);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Groupe mis à jour avec succès');
    } else {
        sendResponse(false, 'Erreur lors de la mise à jour', null, 500);
    }
}

// DELETE - Supprimer un groupe
if ($method === 'DELETE') {
    
    if (!isset($_GET['id'])) {
        sendResponse(false, 'ID du groupe requis', null, 400);
    }
    
    $groupId = $_GET['id'];
    
    $query = "DELETE FROM groups WHERE id = :id AND user_id = :user_id";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $groupId);
    $stmt->bindParam(':user_id', $userId);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Groupe supprimé avec succès');
    } else {
        sendResponse(false, 'Erreur lors de la suppression', null, 500);
    }
}

sendResponse(false, 'Action non reconnue', null, 400);
?>
