# Installation du Système de Connexion GoodFriends

## Prérequis

- XAMPP avec MySQL démarré
- Base de données `goodfriends` existante
- L'application GoodFriends déjà configurée

## Étapes d'installation

### 1. Démarrer MySQL

Lancez le panneau de contrôle XAMPP et démarrez MySQL.

### 2. Exécuter la migration SQL

#### Option A : Via phpMyAdmin (Recommandé)

1. Ouvrez phpMyAdmin : http://localhost/phpmyadmin
2. Sélectionnez la base de données `goodfriends`
3. Cliquez sur l'onglet "Importer"
4. Choisissez le fichier `migration_goodfriends_users.sql`
5. Cliquez sur "Exécuter"

#### Option B : Via ligne de commande

```powershell
cd C:\xampp\htdocs\Goodfriends
C:\xampp\mysql\bin\mysql.exe -u root -p goodfriends < migration_goodfriends_users.sql
```

Entrez votre mot de passe MySQL quand demandé.

### 3. Vérifier l'installation

Connectez-vous à MySQL et vérifiez que les tables ont été créées :

```sql
USE goodfriends;
SHOW TABLES;
```

Vous devriez voir :
- `user_profiles`
- `friend_requests`

Et la table `contacts` devrait avoir les nouvelles colonnes :
```sql
DESCRIBE contacts;
```

Vérifiez la présence de :
- `is_goodfriends_user`
- `goodfriends_user_id`

### 4. Lancer l'application

```bash
npm run android
# ou
npm run ios
```

## Fonctionnalités ajoutées

### 1. Bouton "Utilisateurs GoodFriends"
- **Emplacement** : Écran "Nouveau contact"
- **Action** : Ouvre l'écran de recherche d'utilisateurs

### 2. Recherche d'utilisateurs
- Recherche par email ou numéro de téléphone
- Affiche les résultats avec photos
- Bouton pour envoyer une demande d'ami

### 3. Demandes d'amis dans le profil
- Badge avec le nombre de demandes en attente
- Liste déroulante des demandes
- Boutons Accepter/Refuser

### 4. Création automatique de contacts
- Quand une demande est acceptée
- Le contact est créé chez les 2 utilisateurs
- Marqué comme "Utilisateur GoodFriends"
- Lien bidirectionnel maintenu

## Test de la fonctionnalité

### Test 1 : Créer deux comptes

1. Créez un premier compte : user1@test.com
2. Créez un deuxième compte : user2@test.com

### Test 2 : Rechercher un utilisateur

1. Connectez-vous avec user1@test.com
2. Allez dans "Nouveau contact"
3. Cliquez sur "👥 GoodFriends"
4. Recherchez "user2@test.com"
5. Cliquez sur "+ Ajouter"

### Test 3 : Accepter la demande

1. Déconnectez-vous
2. Connectez-vous avec user2@test.com
3. Allez dans "Mon profil"
4. Vous devriez voir "Demandes d'amis en attente [1]"
5. Dépliez la section
6. Cliquez sur ✓ pour accepter

### Test 4 : Vérifier les contacts

1. Allez dans l'écran d'accueil
2. Vous devriez voir user1 dans vos contacts
3. Déconnectez-vous et reconnectez-vous avec user1
4. Vous devriez voir user2 dans vos contacts

## Structure des fichiers créés

```
api/
  friend_requests.php          # API pour les demandes d'amis

src/
  services/
    FriendRequestService.ts    # Service de gestion des demandes
  
  screens/
    SearchUsersScreen.tsx      # Écran de recherche d'utilisateurs
    ProfileScreen.tsx          # Modifié pour afficher les demandes
    AddContactScreen.tsx       # Modifié avec bouton GoodFriends
  
  navigation/
    AppNavigator.tsx           # Ajout de SearchUsersScreen

database/
  migration_goodfriends_users.sql  # Migration SQL
  
documentation/
  GOODFRIENDS_USERS_FEATURE.md    # Documentation complète
```

## Dépannage

### Erreur de connexion MySQL
- Vérifiez que XAMPP est démarré
- Vérifiez que MySQL tourne (port 3306)
- Vérifiez vos identifiants dans `api/config.php`

### Tables non créées
- Vérifiez les logs MySQL
- Essayez de créer les tables manuellement via phpMyAdmin
- Vérifiez les permissions de l'utilisateur MySQL

### L'application ne compile pas
```bash
# Nettoyer et rebuilder
cd android
./gradlew clean
cd ..
npm run android
```

### Pas de résultats dans la recherche
- Vérifiez que les utilisateurs ont des profils dans `user_profiles`
- Vérifiez la configuration de l'API dans `src/config/api.ts`
- Vérifiez les logs de l'API

## Support

Pour toute question ou problème :
1. Consultez la documentation : `GOODFRIENDS_USERS_FEATURE.md`
2. Vérifiez les logs de l'application
3. Vérifiez les logs de l'API PHP

## Prochaines étapes

Une fois l'installation réussie, vous pouvez :
- Inviter vos amis à créer un compte
- Rechercher et ajouter des contacts GoodFriends
- Profiter de la synchronisation automatique des contacts

Bon usage de GoodFriends ! 🎉
