-- Goodfriends - Migration liens familiaux déduits
-- Date: 2026-10-28
-- Objectif: autoriser les types grandparent / grandchild dans relationships
--           (calculés automatiquement par api/family_links.php).

ALTER TABLE relationships
  MODIFY relation_type ENUM('spouse', 'child', 'parent', 'father', 'mother', 'sibling', 'cousin', 'stepmother', 'stepfather', 'grandparent', 'grandchild', 'friend', 'colleague', 'other') NOT NULL;

-- Rollback (supprimer d'abord les liens déduits) :
-- DELETE FROM relationships WHERE relation_type IN ('grandparent', 'grandchild');
-- ALTER TABLE relationships
--   MODIFY relation_type ENUM('spouse', 'child', 'parent', 'father', 'mother', 'sibling', 'cousin', 'stepmother', 'stepfather', 'friend', 'colleague', 'other') NOT NULL;
