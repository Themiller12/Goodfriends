<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$userId = verifyToken();

// ADD CHILD - Ajouter un enfant à un contact
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'child') {
    
    if (!isset($data['contactId']) || !isset($data['firstName'])) {
        sendResponse(false, 'Contact ID et prénom requis', null, 400);
    }
    
    // Vérifier que le contact appartient à l'utilisateur
    $checkQuery = "SELECT id FROM contacts WHERE id = :id AND user_id = :user_id";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':id', $data['contactId']);
    $checkStmt->bindParam(':user_id', $userId);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() === 0) {
        sendResponse(false, 'Contact non trouvé', null, 404);
    }
    
    $childId = generateId();
    
    // Convertir la date ISO en format MySQL si présente
    $dateOfBirth = null;
    if (isset($data['dateOfBirth']) && !empty($data['dateOfBirth'])) {
        try {
            $date = new DateTime($data['dateOfBirth']);
            $dateOfBirth = $date->format('Y-m-d');
        } catch (Exception $e) {
            // Si la conversion échoue, on laisse null
            $dateOfBirth = null;
        }
    }
    
    $query = "INSERT INTO children (id, contact_id, first_name, last_name, date_of_birth, gender, notes) 
              VALUES (:id, :contact_id, :first_name, :last_name, :date_of_birth, :gender, :notes)";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $childId);
    $stmt->bindParam(':contact_id', $data['contactId']);
    $stmt->bindParam(':first_name', $data['firstName']);
    $stmt->bindParam(':last_name', $data['lastName']);
    $stmt->bindParam(':date_of_birth', $dateOfBirth);
    $stmt->bindParam(':gender', $data['gender']);
    $stmt->bindParam(':notes', $data['notes']);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Enfant ajouté avec succès', ['id' => $childId], 201);
    } else {
        sendResponse(false, 'Erreur lors de l\'ajout', null, 500);
    }
}

// DELETE CHILD - Supprimer un enfant
if ($method === 'DELETE' && isset($_GET['action']) && $_GET['action'] === 'child') {
    
    if (!isset($_GET['id'])) {
        sendResponse(false, 'ID de l\'enfant requis', null, 400);
    }
    
    $childId = $_GET['id'];
    
    // Vérifier que l'enfant appartient à un contact de l'utilisateur
    $checkQuery = "SELECT c.id FROM children ch 
                   JOIN contacts c ON ch.contact_id = c.id 
                   WHERE ch.id = :id AND c.user_id = :user_id";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':id', $childId);
    $checkStmt->bindParam(':user_id', $userId);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() === 0) {
        sendResponse(false, 'Enfant non trouvé', null, 404);
    }
    
    $query = "DELETE FROM children WHERE id = :id";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $childId);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Enfant supprimé avec succès');
    } else {
        sendResponse(false, 'Erreur lors de la suppression', null, 500);
    }
}

// ADD RELATIONSHIP - Ajouter une relation entre contacts
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'relationship') {
    
    if (!isset($data['contactId']) || !isset($data['relatedContactId']) || !isset($data['relationType'])) {
        sendResponse(false, 'Données manquantes', null, 400);
    }
    
    // Vérifier que les deux contacts appartiennent à l'utilisateur
    $checkQuery = "SELECT id FROM contacts WHERE id IN (:id1, :id2) AND user_id = :user_id";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':id1', $data['contactId']);
    $checkStmt->bindParam(':id2', $data['relatedContactId']);
    $checkStmt->bindParam(':user_id', $userId);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() !== 2) {
        sendResponse(false, 'Contacts non trouvés', null, 404);
    }
    
    // Fonction pour obtenir le type de relation inverse
    function getInverseRelationType($type) {
        switch ($type) {
            case 'spouse':
                return 'spouse'; // Conjoint est réciproque
            case 'parent':
                return 'child'; // Si A est parent de B, alors B est enfant de A
            case 'child':
                return 'parent'; // Si A est enfant de B, alors B est parent de A
            case 'sibling':
                return 'sibling'; // Frère/Sœur est réciproque
            case 'friend':
                return 'friend'; // Ami est réciproque
            case 'colleague':
                return 'colleague'; // Collègue est réciproque
            default:
                return 'other'; // Autre reste autre
        }
    }
    
    // Ajouter la relation principale (A -> B)
    $customLabel = isset($data['customRelationLabel']) ? $data['customRelationLabel'] : null;
    $query = "INSERT INTO relationships (contact_id, related_contact_id, relation_type, notes, custom_relation_label) 
              VALUES (:contact_id, :related_contact_id, :relation_type, :notes, :custom_relation_label)";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':contact_id', $data['contactId']);
    $stmt->bindParam(':related_contact_id', $data['relatedContactId']);
    $stmt->bindParam(':relation_type', $data['relationType']);
    $stmt->bindParam(':notes', $data['notes']);
    $stmt->bindParam(':custom_relation_label', $customLabel);
    
    if ($stmt->execute()) {
        $mainId = $db->lastInsertId();
        
        // Ajouter automatiquement la relation inverse (B -> A)
        $inverseType = getInverseRelationType($data['relationType']);
        $inverseQuery = "INSERT INTO relationships (contact_id, related_contact_id, relation_type, notes, custom_relation_label) 
                        VALUES (:contact_id, :related_contact_id, :relation_type, :notes, NULL)";
        
        $inverseStmt = $db->prepare($inverseQuery);
        $inverseStmt->bindParam(':contact_id', $data['relatedContactId']);
        $inverseStmt->bindParam(':related_contact_id', $data['contactId']);
        $inverseStmt->bindParam(':relation_type', $inverseType);
        $inverseStmt->bindParam(':notes', $data['notes']);
        $inverseStmt->execute();
        
        sendResponse(true, 'Relation ajoutée avec succès', ['id' => $mainId], 201);
    } else {
        sendResponse(false, 'Erreur lors de l\'ajout', null, 500);
    }
}

// DELETE RELATIONSHIP - Supprimer une relation
if ($method === 'DELETE' && isset($_GET['action']) && $_GET['action'] === 'relationship') {
    
    if (!isset($_GET['contactId']) || !isset($_GET['relatedContactId'])) {
        sendResponse(false, 'IDs requis', null, 400);
    }
    
    $contactId = $_GET['contactId'];
    $relatedContactId = $_GET['relatedContactId'];
    
    // Supprimer dans les deux sens (bidirectionnel)
    $query = "DELETE FROM relationships 
              WHERE (contact_id = :id1 AND related_contact_id = :id2) 
              OR (contact_id = :id2 AND related_contact_id = :id1)";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id1', $contactId);
    $stmt->bindParam(':id2', $relatedContactId);
    
    if ($stmt->execute()) {
        sendResponse(true, 'Relation supprimée avec succès');
    } else {
        sendResponse(false, 'Erreur lors de la suppression', null, 500);
    }
}

sendResponse(false, 'Action non reconnue', null, 400);
?>
