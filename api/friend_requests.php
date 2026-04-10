<?php
require_once 'config.php';
require_once 'FCMService.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true);

$userId = verifyToken();

// SEARCH USERS - Rechercher des utilisateurs par email ou téléphone
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'search') {
    
    if (!isset($_GET['query']) || empty($_GET['query'])) {
        sendResponse(false, 'Terme de recherche requis', null, 400);
    }
    
    $searchQuery = '%' . $_GET['query'] . '%';
    
    // On filtre les utilisateurs selon leurs paramètres de confidentialité :
    // - si allow_search_email=0, l'utilisateur n'apparaît pas lors d'une recherche par email
    // - si allow_search_phone=0, il n'apparaît pas lors d'une recherche par téléphone
    $query = "SELECT u.id, u.email, 
              COALESCE(NULLIF(p.first_name, ''), 'Prénom') as first_name, 
              COALESCE(NULLIF(p.last_name, ''), 'Non renseigné') as last_name, 
              p.phone, p.photo 
              FROM users u
              LEFT JOIN user_profiles p ON u.id = p.user_id
              WHERE u.id != :user_id 
              AND (
                  (u.email LIKE :query AND COALESCE(p.privacy_allow_search_email, 1) = 1)
                  OR
                  (p.phone LIKE :query AND COALESCE(p.privacy_allow_search_phone, 1) = 1)
              )
              AND COALESCE(p.privacy_profile_public, 1) = 1
              LIMIT 20";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $userId);
    $stmt->bindParam(':query', $searchQuery);
    $stmt->execute();
    
    $users = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Vérifier s'il y a déjà une demande en attente
        $checkQuery = "SELECT status FROM friend_requests 
                      WHERE ((sender_id = :user_id AND receiver_id = :target_id) 
                      OR (sender_id = :target_id AND receiver_id = :user_id))";
        $checkStmt = $db->prepare($checkQuery);
        $checkStmt->bindParam(':user_id', $userId);
        $checkStmt->bindParam(':target_id', $row['id']);
        $checkStmt->execute();
        
        $requestStatus = null;
        if ($checkStmt->rowCount() > 0) {
            $request = $checkStmt->fetch(PDO::FETCH_ASSOC);
            $requestStatus = $request['status'];
        }
        
        $users[] = [
            'id' => $row['id'],
            'email' => $row['email'],
            'firstName' => $row['first_name'],
            'lastName' => $row['last_name'],
            'phone' => $row['phone'],
            'photo' => $row['photo'],
            'requestStatus' => $requestStatus
        ];
    }
    
    sendResponse(true, 'Utilisateurs trouvés', $users);
}

// SEND REQUEST - Envoyer une demande d'ami
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'send') {
    
    if (!isset($data['receiverId'])) {
        sendResponse(false, 'ID du destinataire requis', null, 400);
    }
    
    $receiverId = $data['receiverId'];
    
    // Vérifier que le destinataire existe
    $checkQuery = "SELECT id FROM users WHERE id = :id";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':id', $receiverId);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() === 0) {
        sendResponse(false, 'Utilisateur non trouvé', null, 404);
    }
    
    // Vérifier qu'il n'y a pas déjà une demande
    $checkExisting = "SELECT id, status FROM friend_requests 
                     WHERE ((sender_id = :user_id AND receiver_id = :receiver_id) 
                     OR (sender_id = :receiver_id AND receiver_id = :user_id))";
    $existingStmt = $db->prepare($checkExisting);
    $existingStmt->bindParam(':user_id', $userId);
    $existingStmt->bindParam(':receiver_id', $receiverId);
    $existingStmt->execute();
    
    if ($existingStmt->rowCount() > 0) {
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
        if ($existing['status'] === 'pending') {
            sendResponse(false, 'Une demande est déjà en attente', null, 400);
        } else if ($existing['status'] === 'accepted') {
            sendResponse(false, 'Vous êtes déjà amis', null, 400);
        }
    }
    
    $requestId = generateId();
    
    $query = "INSERT INTO friend_requests (id, sender_id, receiver_id, status) 
              VALUES (:id, :sender_id, :receiver_id, 'pending')";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':id', $requestId);
    $stmt->bindParam(':sender_id', $userId);
    $stmt->bindParam(':receiver_id', $receiverId);
    
    if ($stmt->execute()) {
        // Envoyer une notification FCM au destinataire
        try {
            $fcmService = new FCMService();
            $senderQuery = "SELECT u.email, COALESCE(p.first_name, '') as first_name, COALESCE(p.last_name, '') as last_name
                            FROM users u
                            LEFT JOIN user_profiles p ON u.id = p.user_id
                            WHERE u.id = :user_id";
            $senderStmt = $db->prepare($senderQuery);
            $senderStmt->bindParam(':user_id', $userId);
            $senderStmt->execute();
            $sender = $senderStmt->fetch(PDO::FETCH_ASSOC);
            if ($sender) {
                $senderName = trim("{$sender['first_name']} {$sender['last_name']}") ?: $sender['email'];
                $fcmService->sendFriendRequestNotification($db, $receiverId, $userId, $senderName, $sender['email']);
            }
        } catch (Exception $e) {
            error_log('[FriendRequest FCM] Erreur: ' . $e->getMessage());
        }
        sendResponse(true, 'Demande envoyée avec succès', ['id' => $requestId], 201);
    } else {
        sendResponse(false, 'Erreur lors de l\'envoi de la demande', null, 500);
    }
}

// GET PENDING REQUESTS - Récupérer les demandes en attente (reçues)
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'pending') {
    
    $query = "SELECT fr.id, fr.sender_id, fr.receiver_id, fr.created_at,
              u.email, 
              COALESCE(NULLIF(p.first_name, ''), 'Prénom') as first_name, 
              COALESCE(NULLIF(p.last_name, ''), 'Non renseigné') as last_name, 
              p.phone, p.date_of_birth, p.photo
              FROM friend_requests fr
              JOIN users u ON fr.sender_id = u.id
              LEFT JOIN user_profiles p ON fr.sender_id = p.user_id
              WHERE fr.receiver_id = :user_id AND fr.status = 'pending'
              ORDER BY fr.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $userId);
    $stmt->execute();
    
    $requests = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $requests[] = [
            'id' => $row['id'],
            'senderId' => $row['sender_id'],
            'email' => $row['email'],
            'firstName' => $row['first_name'],
            'lastName' => $row['last_name'],
            'phone' => $row['phone'],
            'dateOfBirth' => $row['date_of_birth'],
            'photo' => $row['photo'],
            'createdAt' => $row['created_at']
        ];
    }
    
    sendResponse(true, 'Demandes récupérées', $requests);
}

// GET SENT REQUESTS - Récupérer les demandes envoyées (en attente)
if ($method === 'GET' && isset($_GET['action']) && $_GET['action'] === 'sent') {
    
    $query = "SELECT fr.id, fr.sender_id, fr.receiver_id, fr.created_at,
              u.email, 
              COALESCE(NULLIF(p.first_name, ''), 'Prénom') as first_name, 
              COALESCE(NULLIF(p.last_name, ''), 'Non renseigné') as last_name, 
              p.phone, p.photo
              FROM friend_requests fr
              JOIN users u ON fr.receiver_id = u.id
              LEFT JOIN user_profiles p ON fr.receiver_id = p.user_id
              WHERE fr.sender_id = :user_id AND fr.status = 'pending'
              ORDER BY fr.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->bindParam(':user_id', $userId);
    $stmt->execute();
    
    $requests = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $requests[] = [
            'id' => $row['receiver_id'],
            'email' => $row['email'],
            'firstName' => $row['first_name'],
            'lastName' => $row['last_name'],
            'phone' => $row['phone'],
            'photo' => $row['photo'],
            'requestStatus' => 'pending'
        ];
    }
    
    sendResponse(true, 'Demandes envoyées récupérées', $requests);
}

// ACCEPT REQUEST - Accepter une demande d'ami
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'accept') {
    
    if (!isset($data['requestId'])) {
        sendResponse(false, 'ID de la demande requis', null, 400);
    }
    
    $requestId = $data['requestId'];
    
    // Vérifier que la demande existe et est pour cet utilisateur
    $checkQuery = "SELECT sender_id, receiver_id FROM friend_requests 
                   WHERE id = :id AND receiver_id = :user_id AND status = 'pending'";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':id', $requestId);
    $checkStmt->bindParam(':user_id', $userId);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() === 0) {
        sendResponse(false, 'Demande non trouvée', null, 404);
    }
    
    $request = $checkStmt->fetch(PDO::FETCH_ASSOC);
    $senderId = $request['sender_id'];
    $receiverId = $request['receiver_id'];
    
    // Commencer une transaction
    $db->beginTransaction();
    
    try {
        // Mettre à jour le statut de la demande
        $updateQuery = "UPDATE friend_requests SET status = 'accepted', updated_at = NOW() 
                       WHERE id = :id";
        $updateStmt = $db->prepare($updateQuery);
        $updateStmt->bindParam(':id', $requestId);
        $updateStmt->execute();
        
        // Créer les contacts pour les deux utilisateurs
        // Récupérer les infos du sender
        $senderQuery = "SELECT u.email, p.first_name, p.last_name, p.phone, p.date_of_birth, 
                       p.photo, p.bio as notes
                       FROM users u
                       LEFT JOIN user_profiles p ON u.id = p.user_id
                       WHERE u.id = :sender_id";
        $senderStmt = $db->prepare($senderQuery);
        $senderStmt->bindParam(':sender_id', $senderId);
        $senderStmt->execute();
        $senderInfo = $senderStmt->fetch(PDO::FETCH_ASSOC);
        
        // Récupérer les infos du receiver
        $receiverQuery = "SELECT u.email, p.first_name, p.last_name, p.phone, p.date_of_birth, 
                         p.photo, p.bio as notes
                         FROM users u
                         LEFT JOIN user_profiles p ON u.id = p.user_id
                         WHERE u.id = :receiver_id";
        $receiverStmt = $db->prepare($receiverQuery);
        $receiverStmt->bindParam(':receiver_id', $receiverId);
        $receiverStmt->execute();
        $receiverInfo = $receiverStmt->fetch(PDO::FETCH_ASSOC);
        
        // Vérifier si le receiver a déjà un contact avec le sender
        // (via goodfriends_user_id, email ou téléphone)
        $checkExistingContact1 = "SELECT id FROM contacts 
                                  WHERE user_id = :user_id 
                                  AND (
                                      goodfriends_user_id = :gf_user_id
                                      OR (email IS NOT NULL AND email != '' AND email = :email)
                                      OR (phone IS NOT NULL AND phone != '' AND phone = :phone)
                                  )
                                  LIMIT 1";
        $checkStmt1 = $db->prepare($checkExistingContact1);
        $checkStmt1->bindParam(':user_id', $receiverId);
        $checkStmt1->bindParam(':gf_user_id', $senderId);
        $checkStmt1->bindParam(':email', $senderInfo['email']);
        $checkStmt1->bindParam(':phone', $senderInfo['phone']);
        $checkStmt1->execute();
        
        $senderFirstName = (!empty($senderInfo['first_name'])) ? $senderInfo['first_name'] : 'Prénom';
        $senderLastName = (!empty($senderInfo['last_name'])) ? $senderInfo['last_name'] : 'Non renseigné';
        
        if ($checkStmt1->rowCount() > 0) {
            // Mettre à jour le contact existant
            $existingContact = $checkStmt1->fetch(PDO::FETCH_ASSOC);
            $contactId1 = $existingContact['id'];
            
            $updateContact1 = "UPDATE contacts 
                              SET is_goodfriends_user = 1,
                                  goodfriends_user_id = :gf_user_id,
                                  email = COALESCE(NULLIF(email, ''), :email),
                                  phone = COALESCE(NULLIF(phone, ''), :phone),
                                  date_of_birth = COALESCE(date_of_birth, :date_of_birth),
                                  photo = COALESCE(NULLIF(photo, ''), :photo),
                                  updated_at = NOW()
                              WHERE id = :id";
            $stmt1 = $db->prepare($updateContact1);
            $stmt1->bindParam(':id', $contactId1);
            $stmt1->bindParam(':gf_user_id', $senderId);
            $stmt1->bindParam(':email', $senderInfo['email']);
            $stmt1->bindParam(':phone', $senderInfo['phone']);
            $stmt1->bindParam(':date_of_birth', $senderInfo['date_of_birth']);
            $stmt1->bindParam(':photo', $senderInfo['photo']);
            $stmt1->execute();
        } else {
            // Créer le contact du sender chez le receiver
            $contactId1 = generateId();
            
            $insertContact1 = "INSERT INTO contacts 
                              (id, user_id, first_name, last_name, email, phone, date_of_birth, 
                               photo, notes, is_goodfriends_user, goodfriends_user_id)
                              VALUES (:id, :user_id, :first_name, :last_name, :email, :phone, 
                                      :date_of_birth, :photo, :notes, 1, :gf_user_id)";
            $stmt1 = $db->prepare($insertContact1);
            $stmt1->bindParam(':id', $contactId1);
            $stmt1->bindParam(':user_id', $receiverId);
            $stmt1->bindParam(':first_name', $senderFirstName);
            $stmt1->bindParam(':last_name', $senderLastName);
            $stmt1->bindParam(':email', $senderInfo['email']);
            $stmt1->bindParam(':phone', $senderInfo['phone']);
            $stmt1->bindParam(':date_of_birth', $senderInfo['date_of_birth']);
            $stmt1->bindParam(':photo', $senderInfo['photo']);
            $stmt1->bindParam(':notes', $senderInfo['notes']);
            $stmt1->bindParam(':gf_user_id', $senderId);
            $stmt1->execute();
        }
        
        // Vérifier si le sender a déjà un contact avec le receiver
        // (via goodfriends_user_id, email ou téléphone)
        $checkExistingContact2 = "SELECT id FROM contacts 
                                  WHERE user_id = :user_id 
                                  AND (
                                      goodfriends_user_id = :gf_user_id
                                      OR (email IS NOT NULL AND email != '' AND email = :email)
                                      OR (phone IS NOT NULL AND phone != '' AND phone = :phone)
                                  )
                                  LIMIT 1";
        $checkStmt2 = $db->prepare($checkExistingContact2);
        $checkStmt2->bindParam(':user_id', $senderId);
        $checkStmt2->bindParam(':gf_user_id', $receiverId);
        $checkStmt2->bindParam(':email', $receiverInfo['email']);
        $checkStmt2->bindParam(':phone', $receiverInfo['phone']);
        $checkStmt2->execute();
        
        $receiverFirstName = (!empty($receiverInfo['first_name'])) ? $receiverInfo['first_name'] : 'Prénom';
        $receiverLastName = (!empty($receiverInfo['last_name'])) ? $receiverInfo['last_name'] : 'Non renseigné';
        
        if ($checkStmt2->rowCount() > 0) {
            // Mettre à jour le contact existant
            $existingContact = $checkStmt2->fetch(PDO::FETCH_ASSOC);
            $contactId2 = $existingContact['id'];
            
            $updateContact2 = "UPDATE contacts 
                              SET is_goodfriends_user = 1,
                                  goodfriends_user_id = :gf_user_id,
                                  email = COALESCE(NULLIF(email, ''), :email),
                                  phone = COALESCE(NULLIF(phone, ''), :phone),
                                  date_of_birth = COALESCE(date_of_birth, :date_of_birth),
                                  photo = COALESCE(NULLIF(photo, ''), :photo),
                                  updated_at = NOW()
                              WHERE id = :id";
            $stmt2 = $db->prepare($updateContact2);
            $stmt2->bindParam(':id', $contactId2);
            $stmt2->bindParam(':gf_user_id', $receiverId);
            $stmt2->bindParam(':email', $receiverInfo['email']);
            $stmt2->bindParam(':phone', $receiverInfo['phone']);
            $stmt2->bindParam(':date_of_birth', $receiverInfo['date_of_birth']);
            $stmt2->bindParam(':photo', $receiverInfo['photo']);
            $stmt2->execute();
        } else {
            // Créer le contact du receiver chez le sender
            $contactId2 = generateId();
            
            $insertContact2 = "INSERT INTO contacts 
                              (id, user_id, first_name, last_name, email, phone, date_of_birth, 
                               photo, notes, is_goodfriends_user, goodfriends_user_id)
                              VALUES (:id, :user_id, :first_name, :last_name, :email, :phone, 
                                      :date_of_birth, :photo, :notes, 1, :gf_user_id)";
            $stmt2 = $db->prepare($insertContact2);
            $stmt2->bindParam(':id', $contactId2);
            $stmt2->bindParam(':user_id', $senderId);
            $stmt2->bindParam(':first_name', $receiverFirstName);
            $stmt2->bindParam(':last_name', $receiverLastName);
            $stmt2->bindParam(':email', $receiverInfo['email']);
            $stmt2->bindParam(':phone', $receiverInfo['phone']);
            $stmt2->bindParam(':date_of_birth', $receiverInfo['date_of_birth']);
            $stmt2->bindParam(':photo', $receiverInfo['photo']);
            $stmt2->bindParam(':notes', $receiverInfo['notes']);
            $stmt2->bindParam(':gf_user_id', $receiverId);
            $stmt2->execute();
        }
        
        $db->commit();
        
        sendResponse(true, 'Demande acceptée et contacts créés', [
            'contactId1' => $contactId1,
            'contactId2' => $contactId2
        ], 200);
        
    } catch (Exception $e) {
        $db->rollBack();
        sendResponse(false, 'Erreur lors de l\'acceptation: ' . $e->getMessage(), null, 500);
    }
}

// REJECT REQUEST - Refuser une demande d'ami
if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'reject') {
    
    if (!isset($data['requestId'])) {
        sendResponse(false, 'ID de la demande requis', null, 400);
    }
    
    $requestId = $data['requestId'];
    
    // Vérifier que la demande existe et est pour cet utilisateur
    $checkQuery = "SELECT id FROM friend_requests 
                   WHERE id = :id AND receiver_id = :user_id AND status = 'pending'";
    $checkStmt = $db->prepare($checkQuery);
    $checkStmt->bindParam(':id', $requestId);
    $checkStmt->bindParam(':user_id', $userId);
    $checkStmt->execute();
    
    if ($checkStmt->rowCount() === 0) {
        sendResponse(false, 'Demande non trouvée', null, 404);
    }
    
    $updateQuery = "UPDATE friend_requests SET status = 'rejected', updated_at = NOW() 
                   WHERE id = :id";
    $updateStmt = $db->prepare($updateQuery);
    $updateStmt->bindParam(':id', $requestId);
    
    if ($updateStmt->execute()) {
        sendResponse(true, 'Demande refusée');
    } else {
        sendResponse(false, 'Erreur lors du refus', null, 500);
    }
}

sendResponse(false, 'Action non reconnue', null, 400);
?>
