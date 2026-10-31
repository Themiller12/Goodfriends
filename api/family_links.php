<?php
// Types inverses : si B est le "type" de A, alors A est l'inverse(type) de B.
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
        case 'grandparent':
            return 'grandchild';
        case 'grandchild':
            return 'grandparent';
        default:
            return 'other';
    }
}

// Régénère les liens grand-parent / petit-enfant à partir des liens parent / enfant
// entre les contacts de l'utilisateur. Les liens déduits sont intégralement recalculés
// à chaque appel, ils disparaissent donc quand le lien parent/enfant qui les justifie est supprimé.
function recomputeFamilyLinks(PDO $db, $userId) {
    try {
        // Sans la migration SQL (ENUM), l'insertion échouerait : on ne fait rien.
        $column = $db->query("SHOW COLUMNS FROM relationships LIKE 'relation_type'")->fetch(PDO::FETCH_ASSOC);
        if (!$column || strpos($column['Type'], 'grandparent') === false) {
            return;
        }

        $stmt = $db->prepare(
            "SELECT r.contact_id, r.related_contact_id, r.relation_type
             FROM relationships r
             JOIN contacts c ON c.id = r.contact_id
             WHERE c.user_id = :user_id"
        );
        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();

        $parentsOf = [];   // enfant => [parent => true]
        $linkedPairs = []; // paires déjà reliées par un lien non déduit
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $a = $row['contact_id'];
            $b = $row['related_contact_id'];
            $type = $row['relation_type'];

            if ($type === 'grandparent' || $type === 'grandchild') {
                continue;
            }

            $linkedPairs[$a . '|' . $b] = true;
            $linkedPairs[$b . '|' . $a] = true;

            // Ligne (A -> B, type) : "B est <type> de A"
            if ($type === 'parent' || $type === 'father' || $type === 'mother') {
                $parentsOf[$a][$b] = true;
            } elseif ($type === 'child') {
                $parentsOf[$b][$a] = true;
            }
        }

        $derived = [];
        foreach ($parentsOf as $child => $parents) {
            foreach (array_keys($parents) as $parent) {
                if ($parent === $child || !isset($parentsOf[$parent])) {
                    continue;
                }
                foreach (array_keys($parentsOf[$parent]) as $grandparent) {
                    if ($grandparent === $child || isset($linkedPairs[$child . '|' . $grandparent])) {
                        continue;
                    }
                    $derived[$child . '|' . $grandparent] = [$child, $grandparent];
                }
            }
        }

        $ownTransaction = !$db->inTransaction();
        if ($ownTransaction) {
            $db->beginTransaction();
        }

        $delete = $db->prepare(
            "DELETE r FROM relationships r
             JOIN contacts c ON c.id = r.contact_id
             WHERE c.user_id = :user_id AND r.relation_type IN ('grandparent', 'grandchild')"
        );
        $delete->bindParam(':user_id', $userId);
        $delete->execute();

        $insert = $db->prepare(
            "INSERT INTO relationships (contact_id, related_contact_id, relation_type)
             VALUES (:contact_id, :related_contact_id, :relation_type)"
        );
        foreach ($derived as $pair) {
            list($child, $grandparent) = $pair;
            $insert->execute([':contact_id' => $child, ':related_contact_id' => $grandparent, ':relation_type' => 'grandparent']);
            $insert->execute([':contact_id' => $grandparent, ':related_contact_id' => $child, ':relation_type' => 'grandchild']);
        }

        if ($ownTransaction) {
            $db->commit();
        }
    } catch (Exception $e) {
        if (isset($ownTransaction) && $ownTransaction && $db->inTransaction()) {
            $db->rollBack();
        }
        error_log('recomputeFamilyLinks: ' . $e->getMessage());
    }
}
?>
