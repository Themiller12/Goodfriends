# Migration - Ajout du statut 'deleted' pour les relations d'amitié

## Problème
Lors de la suppression d'un contact GoodFriends, l'application tente de mettre à jour le statut de la relation d'amitié à 'deleted', mais ce statut n'existe pas dans l'ENUM de la colonne `status`.

Erreur rencontrée :
```
SQLSTATE[01000]: Warning: 1265 Data truncated for column 'status' at row 3
```

## Solution
Ajouter 'deleted' aux valeurs possibles de l'ENUM de la colonne `status` dans la table `friend_requests`.

## Exécution de la migration

### Sur XAMPP (local)
```bash
mysql -u root -p goodfriends < migration_add_deleted_status.sql
```

### Via phpMyAdmin
1. Ouvrir phpMyAdmin
2. Sélectionner la base 'goodfriends'
3. Onglet SQL
4. Copier/coller le contenu de `migration_add_deleted_status.sql`
5. Exécuter

### Sur serveur de production
```bash
mysql -u [username] -p goodfriends < migration_add_deleted_status.sql
```

## Vérification
Après la migration, la colonne status doit accepter ces valeurs :
- 'pending' (par défaut)
- 'accepted'
- 'rejected'
- 'deleted' (nouveau)

Pour vérifier :
```sql
DESCRIBE friend_requests;
```

## Fichiers modifiés
- `database.sql` : Structure mise à jour pour les futures installations
- `migration_add_deleted_status.sql` : Script de migration pour les bases existantes
- `api/contacts.php` : Utilise maintenant le statut 'deleted'

## Impact
Une fois cette migration appliquée :
- La suppression de contacts GoodFriends fonctionnera correctement
- Les relations d'amitié seront marquées comme 'deleted' au lieu d'être supprimées
- L'historique des relations sera préservé
- Les utilisateurs ne pourront plus s'envoyer de messages après suppression
