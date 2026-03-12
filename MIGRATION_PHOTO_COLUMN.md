# Migration - Augmentation de la taille de la colonne photo

## Problème
Les images encodées en base64 dépassent la limite de 65 KB du type TEXT, causant l'erreur :
```
SQLSTATE[22001]: String data, right truncated: 1406 Data too long for column 'photo'
```

## Solution
Changer le type de colonne de `TEXT` à `LONGTEXT` (4GB max)

## Exécution de la migration

### Sur XAMPP (local)
```bash
# Via ligne de commande
mysql -u root -p goodfriends < migration_update_photo_column.sql

# Ou via phpMyAdmin
# 1. Ouvrir phpMyAdmin
# 2. Sélectionner la base 'goodfriends'
# 3. Onglet SQL
# 4. Copier/coller le contenu de migration_update_photo_column.sql
# 5. Exécuter
```

### Sur serveur de production
```bash
# SSH vers le serveur
mysql -u [username] -p goodfriends < migration_update_photo_column.sql

# Ou via l'interface web de gestion de base de données
```

## Vérification
Après la migration, vérifiez que les colonnes ont bien été modifiées :
```sql
DESCRIBE users;
DESCRIBE contacts;
```

Les colonnes `photo` doivent maintenant être de type `LONGTEXT`.

## Fichiers modifiés
- `database.sql` : Structure mise à jour pour les futures installations
- `migration_update_photo_column.sql` : Script de migration pour les bases existantes
