<?php
require_once 'config.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

// Vérifier l'authentification pour toutes les requêtes
$userId = verifyToken();

// GET ALL - Récupérer tous les contacts
if ($method === 'GET' && !isset($_GET['id'])) {
    
    $query = "SELECT c.*, GROUP_CONCAT(cg.group_id) as group_ids
              FROM contacts c
              LEFT JOIN contact_groups cg ON c.id = cg.contact_id
              WHERE c.user_id = :user_id
              GROUP BY c.id
              ORDER BY c.first_name, c.last_name";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $userId);
    $stmt->execute();
    
    $contacts = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $contactId = $row['id'];
        
        // Récupérer les enfants
        $childQuery = "SELECT * FROM children WHERE contact_id = :contact_id";
        $childStmt = $db->prepare($childQuery);
        $childStmt->bindParam(':contact_id', $contactId);
        $childStmt->execute();
        $children = array_map(function($child) {
            return [
                'id' => $child['id'],
                'firstName' => $child['first_name'],
                'dateOfBirth' => $child['date_of_birth'],
                'gender' => $child['gender'],
                'notes' => $child['notes']
            ];
        }, $childStmt->fetchAll(PDO::FETCH_ASSOC));
        
        // Récupérer les relations
        $relQuery = "SELECT * FROM relationships WHERE contact_id = :contact_id";
        $relStmt = $db->prepare($relQuery);
        $relStmt->bindParam(':contact_id', $contactId);
        $relStmt->execute();
        $relationships = $relStmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Récupérer les professions/études
        $profQuery = "SELECT * FROM professions_studies WHERE contact_id = :contact_id ORDER BY year DESC";
        $profStmt = $db->prepare($profQuery);
        $profStmt->bindParam(':contact_id', $contactId);
        $profStmt->execute();
        $professionsStudies = array_map(function($prof) {
            return [
                'id' => $prof['id'],
                'title' => $prof['title'],
                'year' => $prof['year'] ? (int)$prof['year'] : null,
                'notes' => $prof['notes']
            ];
        }, $profStmt->fetchAll(PDO::FETCH_ASSOC));
        
        $contacts[] = [
            'id' => $row['id'],
            'firstName' => $row['first_name'],
            'lastName' => $row['last_name'],
            'email' => $row['email'],
            'phone' => $row['phone'],
            'dateOfBirth' => $row['date_of_birth'],
            'age' => $row['age'],
            'address' => $row['address'],
            'notes' => $row['notes'],
            'gender' => $row['gender'],
            'allergies' => $row['allergies'],
            'travels' => $row['travels'] ? json_decode($row['travels'], true) : [],
            'photo' => $row['photo'],
            'goodfriendsUserId' => $row['goodfriends_user_id'],
            'groupIds' => $row['group_ids'] ? explode(',', $row['group_ids']) : [],
            'children' => $children,
            'professionsStudies' => $professionsStudies,
            'relationships' => array_map(function($rel) {
                return [
                    'contactId' => $rel['related_contact_id'],
                    'relationType' => $rel['relation_type'],
                    'customRelationLabel' => $rel['custom_relation_label']
                ];
            }, $relationships),
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at']
        ];
    }
    
    sendResponse(true, 'Contacts récupérés', $contacts);
}

// GET ONE - Récupérer un contact
if ($method === 'GET' && isset($_GET['id'])) {
    
    $contactId = $_GET['id'];
    
    $query = "SELECT * FROM contacts WHERE id = :id AND user_id = :user_id";
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $contactId);
    $stmt->bindParam(':user_id', $userId);
    $stmt->execute();
    
    if ($stmt->rowCount() === 0) {
        sendResponse(false, 'Contact non trouvé', null, 404);
    }
    
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // Récupérer les groupes
    $groupQuery = "SELECT group_id FROM contact_groups WHERE contact_id = :contact_id";
    $groupStmt = $db->prepare($groupQuery);
    $groupStmt->bindParam(':contact_id', $contactId);
    $groupStmt->execute();
    $groupIds = $groupStmt->fetchAll(PDO::FETCH_COLUMN);
    
    // Récupérer les enfants
    $childQuery = "SELECT * FROM children WHERE contact_id = :contact_id";
    $childStmt = $db->prepare($childQuery);
    $childStmt->bindParam(':contact_id', $contactId);
    $childStmt->execute();
    $children = array_map(function($child) {
        return [
            'id' => $child['id'],
            'firstName' => $child['first_name'],
            'dateOfBirth' => $child['date_of_birth'],
            'gender' => $child['gender'],
            'notes' => $child['notes']
        ];
    }, $childStmt->fetchAll(PDO::FETCH_ASSOC));
    
    // Récupérer les relations
    $relQuery = "SELECT * FROM relationships WHERE contact_id = :contact_id";
    $relStmt = $db->prepare($relQuery);
    $relStmt->bindParam(':contact_id', $contactId);
    $relStmt->execute();
    $relationships = $relStmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Récupérer les professions/études
    $profQuery = "SELECT * FROM professions_studies WHERE contact_id = :contact_id ORDER BY year DESC";
    $profStmt = $db->prepare($profQuery);
    $profStmt->bindParam(':contact_id', $contactId);
    $profStmt->execute();
    $professionsStudies = array_map(function($prof) {
        return [
            'id' => $prof['id'],
            'title' => $prof['title'],
            'year' => $prof['year'] ? (int)$prof['year'] : null,
            'notes' => $prof['notes']
        ];
    }, $profStmt->fetchAll(PDO::FETCH_ASSOC));
    
    $contact = [
        'id' => $row['id'],
        'firstName' => $row['first_name'],
        'lastName' => $row['last_name'],
        'email' => $row['email'],
        'phone' => $row['phone'],
        'dateOfBirth' => $row['date_of_birth'],
        'age' => $row['age'],
        'address' => $row['address'],
        'notes' => $row['notes'],
        'gender' => $row['gender'],
        'allergies' => $row['allergies'],
        'travels' => $row['travels'] ? json_decode($row['travels'], true) : [],
        'photo' => $row['photo'],
        'goodfriendsUserId' => $row['goodfriends_user_id'],
        'groupIds' => $groupIds,
        'children' => $children,
        'professionsStudies' => $professionsStudies,
        'relationships' => array_map(function($rel) {
            return [
                'contactId' => $rel['related_contact_id'],
                'relationType' => $rel['relation_type'],
                'customRelationLabel' => $rel['custom_relation_label']
            ];
        }, $relationships),
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at']
    ];
    
    sendResponse(true, 'Contact récupéré', $contact);
}

// CREATE - Créer un contact
if ($method === 'POST') {
    
    if (!isset($data['firstName']) || !isset($data['lastName'])) {
        sendResponse(false, 'Prénom et nom requis', null, 400);
    }
    
    // Utiliser l'ID du client s'il est fourni, sinon en générer un nouveau
    $contactId = isset($data['id']) && !empty($data['id']) ? $data['id'] : generateId();
    
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
    
    $travelsJson = isset($data['travels']) && is_array($data['travels']) ? json_encode($data['travels']) : null;
    $query = "INSERT INTO contacts (id, user_id, first_name, last_name, email, phone, 
              date_of_birth, age, address, notes, photo, gender, allergies, travels) 
              VALUES (:id, :user_id, :first_name, :last_name, :email, :phone, 
              :date_of_birth, :age, :address, :notes, :photo, :gender, :allergies, :travels)";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $contactId);
    $stmt->bindParam(':user_id', $userId);
    $stmt->bindParam(':first_name', $data['firstName']);
    $stmt->bindParam(':last_name', $data['lastName']);
    $stmt->bindParam(':email', $data['email']);
    $stmt->bindParam(':phone', $data['phone']);
    $stmt->bindParam(':date_of_birth', $dateOfBirth);
    $stmt->bindParam(':age', $data['age']);
    $stmt->bindParam(':address', $data['address']);
    $stmt->bindParam(':notes', $data['notes']);
    $stmt->bindParam(':photo', $data['photo']);
    $stmt->bindParam(':gender', $data['gender']);
    $stmt->bindParam(':allergies', $data['allergies']);
    $stmt->bindParam(':travels', $travelsJson);
    
    if ($stmt->execute()) {
        // Ajouter aux groupes
        if (isset($data['groupIds']) && is_array($data['groupIds'])) {
            foreach ($data['groupIds'] as $groupId) {
                // Vérifier que le groupe existe et appartient à l'utilisateur
                $checkGroupQuery = "SELECT id FROM groups WHERE id = :id AND user_id = :user_id";
                $checkGroupStmt = $db->prepare($checkGroupQuery);
                $checkGroupStmt->bindParam(':id', $groupId);
                $checkGroupStmt->bindParam(':user_id', $userId);
                $checkGroupStmt->execute();
                
                if ($checkGroupStmt->rowCount() > 0) {
                    $groupQuery = "INSERT INTO contact_groups (contact_id, group_id) VALUES (:contact_id, :group_id)";
                    $groupStmt = $db->prepare($groupQuery);
                    $groupStmt->bindParam(':contact_id', $contactId);
                    $groupStmt->bindParam(':group_id', $groupId);
                    $groupStmt->execute();
                }
            }
        }
        
        // Ajouter les enfants
        if (isset($data['children']) && is_array($data['children'])) {
            foreach ($data['children'] as $child) {
                $childId = isset($child['id']) ? $child['id'] : generateId();
                $childDateOfBirth = null;
                if (isset($child['dateOfBirth']) && !empty($child['dateOfBirth'])) {
                    try {
                        $childDate = new DateTime($child['dateOfBirth']);
                        $childDateOfBirth = $childDate->format('Y-m-d');
                    } catch (Exception $e) {
                        $childDateOfBirth = null;
                    }
                }
                
                $childQuery = "INSERT INTO children (id, contact_id, first_name, date_of_birth, gender, notes) 
                              VALUES (:id, :contact_id, :first_name, :date_of_birth, :gender, :notes)";
                $childStmt = $db->prepare($childQuery);
                $childStmt->bindParam(':id', $childId);
                $childStmt->bindParam(':contact_id', $contactId);
                $childStmt->bindParam(':first_name', $child['firstName']);
                $childStmt->bindParam(':date_of_birth', $childDateOfBirth);
                $childStmt->bindParam(':gender', $child['gender']);
                $childStmt->bindParam(':notes', $child['notes']);
                $childStmt->execute();
            }
        }
        
        sendResponse(true, 'Contact créé avec succès', ['id' => $contactId], 201);
    } else {
        sendResponse(false, 'Erreur lors de la création', null, 500);
    }
}

// UPDATE - Mettre à jour un contact
if ($method === 'PUT') {
    
    if (!isset($data['id'])) {
        sendResponse(false, 'ID du contact requis', null, 400);
    }
    
    $contactId = $data['id'];
    
    // Vérifier que le contact appartient à l'utilisateur
    $checkQuery = "SELECT id FROM contacts WHERE id = :id AND user_id = :user_id";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':id', $contactId);
    $checkStmt->bindParam(':user_id', $userId);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() === 0) {
        sendResponse(false, 'Contact non trouvé', null, 404);
    }
    
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
    
    $travelsJson = isset($data['travels']) && is_array($data['travels']) ? json_encode($data['travels']) : null;
    $query = "UPDATE contacts SET 
              first_name = :first_name,
              last_name = :last_name,
              email = :email,
              phone = :phone,
              date_of_birth = :date_of_birth,
              age = :age,
              address = :address,
              notes = :notes,
              photo = :photo,
              gender = :gender,
              allergies = :allergies,
              travels = :travels,
              updated_at = NOW()
              WHERE id = :id";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':first_name', $data['firstName']);
    $stmt->bindParam(':last_name', $data['lastName']);
    $stmt->bindParam(':email', $data['email']);
    $stmt->bindParam(':phone', $data['phone']);
    $stmt->bindParam(':date_of_birth', $dateOfBirth);
    $stmt->bindParam(':age', $data['age']);
    $stmt->bindParam(':address', $data['address']);
    $stmt->bindParam(':notes', $data['notes']);
    $stmt->bindParam(':photo', $data['photo']);
    $stmt->bindParam(':gender', $data['gender']);
    $stmt->bindParam(':allergies', $data['allergies']);
    $stmt->bindParam(':travels', $travelsJson);
    $stmt->bindParam(':id', $contactId);
    
    if ($stmt->execute()) {
        // Mettre à jour les groupes
        $deleteGroups = "DELETE FROM contact_groups WHERE contact_id = :contact_id";
        $deleteStmt = $db->prepare($deleteGroups);
        $deleteStmt->bindParam(':contact_id', $contactId);
        $deleteStmt->execute();
        
        if (isset($data['groupIds']) && is_array($data['groupIds'])) {
            foreach ($data['groupIds'] as $groupId) {
                // Vérifier que le groupe existe et appartient à l'utilisateur
                $checkGroupQuery = "SELECT id FROM groups WHERE id = :id AND user_id = :user_id";
                $checkGroupStmt = $db->prepare($checkGroupQuery);
                $checkGroupStmt->bindParam(':id', $groupId);
                $checkGroupStmt->bindParam(':user_id', $userId);
                $checkGroupStmt->execute();
                
                if ($checkGroupStmt->rowCount() > 0) {
                    $groupQuery = "INSERT INTO contact_groups (contact_id, group_id) VALUES (:contact_id, :group_id)";
                    $groupStmt = $db->prepare($groupQuery);
                    $groupStmt->bindParam(':contact_id', $contactId);
                    $groupStmt->bindParam(':group_id', $groupId);
                    $groupStmt->execute();
                }
            }
        }
        
        // Mettre à jour les enfants
        $deleteChildren = "DELETE FROM children WHERE contact_id = :contact_id";
        $deleteChildStmt = $db->prepare($deleteChildren);
        $deleteChildStmt->bindParam(':contact_id', $contactId);
        $deleteChildStmt->execute();
        
        if (isset($data['children']) && is_array($data['children'])) {
            foreach ($data['children'] as $child) {
                $childId = isset($child['id']) ? $child['id'] : generateId();
                $childDateOfBirth = null;
                if (isset($child['dateOfBirth']) && !empty($child['dateOfBirth'])) {
                    try {
                        $childDate = new DateTime($child['dateOfBirth']);
                        $childDateOfBirth = $childDate->format('Y-m-d');
                    } catch (Exception $e) {
                        $childDateOfBirth = null;
                    }
                }
                
                $childQuery = "INSERT INTO children (id, contact_id, first_name, date_of_birth, gender, notes) 
                              VALUES (:id, :contact_id, :first_name, :date_of_birth, :gender, :notes)";
                $childStmt = $db->prepare($childQuery);
                $childStmt->bindParam(':id', $childId);
                $childStmt->bindParam(':contact_id', $contactId);
                $childStmt->bindParam(':first_name', $child['firstName']);
                $childStmt->bindParam(':date_of_birth', $childDateOfBirth);
                $childStmt->bindParam(':gender', $child['gender']);
                $childStmt->bindParam(':notes', $child['notes']);
                $childStmt->execute();
            }
        }
        
        // Mettre à jour les professions/études
        $deleteProf = "DELETE FROM professions_studies WHERE contact_id = :contact_id";
        $deleteProfStmt = $db->prepare($deleteProf);
        $deleteProfStmt->bindParam(':contact_id', $contactId);
        $deleteProfStmt->execute();
        
        if (isset($data['professionsStudies']) && is_array($data['professionsStudies'])) {
            foreach ($data['professionsStudies'] as $prof) {
                $profId = isset($prof['id']) ? $prof['id'] : generateId();
                $profQuery = "INSERT INTO professions_studies (id, contact_id, title, year, notes) 
                             VALUES (:id, :contact_id, :title, :year, :notes)";
                $profStmt = $db->prepare($profQuery);
                $profStmt->bindParam(':id', $profId);
                $profStmt->bindParam(':contact_id', $contactId);
                $profStmt->bindParam(':title', $prof['title']);
                $profStmt->bindParam(':year', $prof['year']);
                $profStmt->bindParam(':notes', $prof['notes']);
                $profStmt->execute();
            }
        }
        
        // Mettre à jour les relations
        // Fonction pour obtenir le type de relation inverse
        function getInverseRelationType($type) {
            switch ($type) {
                case 'spouse':
                    return 'spouse';
                case 'parent':
                    return 'child';
                case 'child':
                    return 'parent';
                case 'sibling':
                    return 'sibling';
                case 'friend':
                    return 'friend';
                case 'colleague':
                    return 'colleague';
                default:
                    return 'other';
            }
        }
        
        // Récupérer les anciennes relations pour savoir lesquelles supprimer
        $oldRelQuery = "SELECT related_contact_id, relation_type FROM relationships WHERE contact_id = :contact_id";
        $oldRelStmt = $db->prepare($oldRelQuery);
        $oldRelStmt->bindParam(':contact_id', $contactId);
        $oldRelStmt->execute();
        $oldRelationships = $oldRelStmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Créer un tableau des nouvelles relations pour comparaison
        $newRelationshipIds = [];
        if (isset($data['relationships']) && is_array($data['relationships'])) {
            foreach ($data['relationships'] as $rel) {
                $newRelationshipIds[] = $rel['contactId'];
            }
        }
        
        // Supprimer les relations qui ne sont plus présentes (et leurs inverses)
        foreach ($oldRelationships as $oldRel) {
            if (!in_array($oldRel['related_contact_id'], $newRelationshipIds)) {
                // Supprimer la relation principale
                $delQuery = "DELETE FROM relationships WHERE contact_id = :contact_id AND related_contact_id = :related_contact_id";
                $delStmt = $db->prepare($delQuery);
                $delStmt->bindParam(':contact_id', $contactId);
                $delStmt->bindParam(':related_contact_id', $oldRel['related_contact_id']);
                $delStmt->execute();
                
                // Supprimer la relation inverse
                $inverseType = getInverseRelationType($oldRel['relation_type']);
                $delInverseQuery = "DELETE FROM relationships WHERE contact_id = :contact_id AND related_contact_id = :related_contact_id AND relation_type = :relation_type";
                $delInverseStmt = $db->prepare($delInverseQuery);
                $delInverseStmt->bindParam(':contact_id', $oldRel['related_contact_id']);
                $delInverseStmt->bindParam(':related_contact_id', $contactId);
                $delInverseStmt->bindParam(':relation_type', $inverseType);
                $delInverseStmt->execute();
            }
        }
        
        // Ajouter ou mettre à jour les nouvelles relations
        if (isset($data['relationships']) && is_array($data['relationships'])) {
            foreach ($data['relationships'] as $relationship) {
                // Vérifier si la relation existe déjà
                $checkQuery = "SELECT id FROM relationships WHERE contact_id = :contact_id AND related_contact_id = :related_contact_id";
                $checkStmt = $db->prepare($checkQuery);
                $checkStmt->bindParam(':contact_id', $contactId);
                $checkStmt->bindParam(':related_contact_id', $relationship['contactId']);
                $checkStmt->execute();
                
                if ($checkStmt->rowCount() === 0) {
                    // Ajouter la relation principale (A -> B)
                    $customLabel = isset($relationship['customRelationLabel']) ? $relationship['customRelationLabel'] : null;
                    $relQuery = "INSERT INTO relationships (contact_id, related_contact_id, relation_type, custom_relation_label) 
                                VALUES (:contact_id, :related_contact_id, :relation_type, :custom_relation_label)";
                    $relStmt = $db->prepare($relQuery);
                    $relStmt->bindParam(':contact_id', $contactId);
                    $relStmt->bindParam(':related_contact_id', $relationship['contactId']);
                    $relStmt->bindParam(':relation_type', $relationship['relationType']);
                    $relStmt->bindParam(':custom_relation_label', $customLabel);
                    $relStmt->execute();
                    
                    // Vérifier si la relation inverse existe
                    $inverseType = getInverseRelationType($relationship['relationType']);
                    $checkInverseQuery = "SELECT id FROM relationships WHERE contact_id = :contact_id AND related_contact_id = :related_contact_id";
                    $checkInverseStmt = $db->prepare($checkInverseQuery);
                    $checkInverseStmt->bindParam(':contact_id', $relationship['contactId']);
                    $checkInverseStmt->bindParam(':related_contact_id', $contactId);
                    $checkInverseStmt->execute();
                    
                    if ($checkInverseStmt->rowCount() === 0) {
                        // Ajouter la relation inverse (B -> A)
                        $inverseQuery = "INSERT INTO relationships (contact_id, related_contact_id, relation_type, custom_relation_label) 
                                        VALUES (:contact_id, :related_contact_id, :relation_type, NULL)";
                        $inverseStmt = $db->prepare($inverseQuery);
                        $inverseStmt->bindParam(':contact_id', $relationship['contactId']);
                        $inverseStmt->bindParam(':related_contact_id', $contactId);
                        $inverseStmt->bindParam(':relation_type', $inverseType);
                        $inverseStmt->execute();
                    }
                } else {
                    // Mettre à jour le type de relation si elle existe déjà
                    $customLabelUpd = isset($relationship['customRelationLabel']) ? $relationship['customRelationLabel'] : null;
                    $updateQuery = "UPDATE relationships SET relation_type = :relation_type, custom_relation_label = :custom_relation_label 
                                   WHERE contact_id = :contact_id AND related_contact_id = :related_contact_id";
                    $updateStmt = $db->prepare($updateQuery);
                    $updateStmt->bindParam(':relation_type', $relationship['relationType']);
                    $updateStmt->bindParam(':custom_relation_label', $customLabelUpd);
                    $updateStmt->bindParam(':contact_id', $contactId);
                    $updateStmt->bindParam(':related_contact_id', $relationship['contactId']);
                    $updateStmt->execute();
                    
                    // Mettre à jour aussi la relation inverse
                    $inverseType = getInverseRelationType($relationship['relationType']);
                    $updateInverseQuery = "UPDATE relationships SET relation_type = :relation_type 
                                          WHERE contact_id = :contact_id AND related_contact_id = :related_contact_id";
                    $updateInverseStmt = $db->prepare($updateInverseQuery);
                    $updateInverseStmt->bindParam(':relation_type', $inverseType);
                    $updateInverseStmt->bindParam(':contact_id', $relationship['contactId']);
                    $updateInverseStmt->bindParam(':related_contact_id', $contactId);
                    $updateInverseStmt->execute();
                }
            }
        }
        
        sendResponse(true, 'Contact mis à jour avec succès');
    } else {
        sendResponse(false, 'Erreur lors de la mise à jour', null, 500);
    }
}

// DELETE - Supprimer un contact
if ($method === 'DELETE') {
    
    if (!isset($_GET['id'])) {
        sendResponse(false, 'ID du contact requis', null, 400);
    }
    
    $contactId = $_GET['id'];
    
    // Vérifier si c'est un contact GoodFriends avant de le supprimer
    $checkQuery = "SELECT goodfriends_user_id FROM contacts WHERE id = :id AND user_id = :user_id";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':id', $contactId);
    $checkStmt->bindParam(':user_id', $userId);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() === 0) {
        sendResponse(false, 'Contact non trouvé', null, 404);
    }
    
    $contactData = $checkStmt->fetch(PDO::FETCH_ASSOC);
    $goodfriendsUserId = $contactData['goodfriends_user_id'];
    
    // Commencer une transaction
    $db->beginTransaction();
    
    try {
        // Si c'est un utilisateur GoodFriends, mettre à jour le statut de la relation d'amitié AVANT de supprimer le contact
        if (!empty($goodfriendsUserId)) {
            error_log("Tentative de suppression de la relation d'amitié: userId=$userId, goodfriendsUserId=$goodfriendsUserId");
            
            // Mettre à jour le statut de la friend_request à 'deleted'
            $updateFriendship = "UPDATE friend_requests 
                                SET status = 'deleted', updated_at = NOW() 
                                WHERE ((sender_id = :user_id1 AND receiver_id = :gf_user_id1) 
                                OR (sender_id = :gf_user_id2 AND receiver_id = :user_id2)) 
                                AND status = 'accepted'";
            $friendStmt = $db->prepare($updateFriendship);
            $friendStmt->bindParam(':user_id1', $userId);
            $friendStmt->bindParam(':gf_user_id1', $goodfriendsUserId);
            $friendStmt->bindParam(':gf_user_id2', $goodfriendsUserId);
            $friendStmt->bindParam(':user_id2', $userId);
            $friendStmt->execute();
            
            // Vérifier que la mise à jour a bien eu lieu
            $affectedRows = $friendStmt->rowCount();
            error_log("Suppression relation d'amitié: rows affected=$affectedRows");
        }
        
        // Supprimer le contact (les enfants, relations et groupes seront supprimés automatiquement grâce à CASCADE)
        $query = "DELETE FROM contacts WHERE id = :id AND user_id = :user_id";
        $stmt = $db->prepare($query);
        $stmt->bindParam(':id', $contactId);
        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();
        
        if ($stmt->rowCount() === 0) {
            throw new Exception("Impossible de supprimer le contact");
        }
        
        $db->commit();
        sendResponse(true, 'Contact supprimé avec succès');
        exit;
        
    } catch (Exception $e) {
        $db->rollBack();
        error_log("Erreur suppression contact: " . $e->getMessage() . " | Trace: " . $e->getTraceAsString());
        sendResponse(false, 'Erreur lors de la suppression: ' . $e->getMessage(), null, 500);
        exit;
    }
}

sendResponse(false, 'Action non reconnue', null, 400);
?>
