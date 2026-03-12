# Configuration Firebase Cloud Messaging pour Goodfriends

## Étape 1 : Créer un projet Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquez sur "Ajouter un projet"
3. Nommez votre projet : **Goodfriends**
4. Suivez les étapes (désactivez Google Analytics si non nécessaire)

## Étape 2 : Ajouter une application Android

1. Dans la console Firebase, cliquez sur l'icône Android
2. **Nom du package Android** : `com.goodfriends` (voir dans `android/app/build.gradle`)
3. Laissez les autres champs vides
4. Cliquez sur "Enregistrer l'application"
5. **Téléchargez le fichier `google-services.json`**
6. Placez-le dans : `android/app/google-services.json`

## Étape 3 : Configurer le projet Android

### Fichier `android/build.gradle` (projet root)

Ajoutez dans `dependencies` :

```gradle
buildscript {
    dependencies {
        classpath('com.google.gms:google-services:4.4.0')
    }
}
```

### Fichier `android/app/build.gradle`

En bas du fichier, ajoutez :

```gradle
apply plugin: 'com.google.gms.google-services'
```

## Étape 4 : Obtenir la Server Key Firebase

1. Dans Firebase Console, allez dans **Project Settings** (⚙️)
2. Onglet **Cloud Messaging**
3. Sous **Cloud Messaging API (Legacy)**, copiez la **Server Key**
4. Collez cette clé dans `api/FCMService.php` ligne 11 :

```php
$this->serverKey = 'VOTRE_SERVER_KEY_ICI';
```

⚠️ **Important** : Activez l'API "Cloud Messaging API (Legacy)" si demandé.

## Étape 5 : Exécuter la migration SQL

Exécutez le fichier `migration_fcm_tokens.sql` dans phpMyAdmin ou MySQL :

```bash
mysql -u root goodfriends_db < migration_fcm_tokens.sql
```

## Étape 6 : Rebuild l'application Android

```bash
cd android
./gradlew clean
cd ..
npm run android
```

## Vérification

Une fois l'app lancée :
- Le token FCM devrait s'afficher dans les logs : `[FirebaseService] FCM Token: ...`
- Le token devrait être enregistré dans la table `user_fcm_tokens`
- Les notifications push devraient fonctionner même quand l'app est fermée

## Troubleshooting

### Erreur "Default FirebaseApp is not initialized"
- Vérifiez que `google-services.json` est bien dans `android/app/`
- Vérifiez que `apply plugin: 'com.google.gms.google-services'` est présent

### Pas de notifications reçues
- Vérifiez la Server Key dans `FCMService.php`
- Vérifiez que l'API Cloud Messaging est activée dans Firebase
- Consultez les logs PHP dans `xampp/apache/logs/error.log`

### Token non enregistré
- Vérifiez que l'utilisateur est bien connecté
- Consultez les logs React Native avec `adb logcat`

## Structure des fichiers créés

- ✅ `migration_fcm_tokens.sql` - Table pour stocker les tokens
- ✅ `api/fcm_tokens.php` - Endpoint pour gérer les tokens
- ✅ `api/FCMService.php` - Service d'envoi de notifications
- ✅ `api/messages.php` - Modifié pour envoyer notifications push
- ✅ `src/services/FirebaseService.ts` - Service Firebase côté app
- ✅ `App.tsx` - Initialisation Firebase au démarrage
