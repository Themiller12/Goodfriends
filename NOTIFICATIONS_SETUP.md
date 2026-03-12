# Installation des notifications d'anniversaire

## Installation de la bibliothèque

```bash
npm install react-native-push-notification
```

## Configuration Android

### 1. Modifier `android/app/src/main/AndroidManifest.xml`

Ajouter les permissions nécessaires dans le fichier AndroidManifest.xml :

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    
    <!-- Permissions existantes -->
    <uses-permission android:name="android.permission.INTERNET" />
    
    <!-- Nouvelles permissions pour les notifications -->
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
    
    <!-- Pour Android 13+ (API 33+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>

    <application>
        <!-- Contenu existant de application -->
        
        <!-- Ajouter les receivers pour les notifications -->
        <receiver android:name="com.dieam.reactnativepushnotification.modules.RNPushNotificationActions" />
        <receiver android:name="com.dieam.reactnativepushnotification.modules.RNPushNotificationPublisher" />
        <receiver android:name="com.dieam.reactnativepushnotification.modules.RNPushNotificationBootEventReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
                <action android:name="com.htc.intent.action.QUICKBOOT_POWERON"/>
            </intent-filter>
        </receiver>

        <service
            android:name="com.dieam.reactnativepushnotification.modules.RNPushNotificationListenerService"
            android:exported="false" >
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
    </application>
</manifest>
```

### 2. Lier la bibliothèque (si React Native < 0.60)

Pour React Native 0.60+, l'auto-linking devrait fonctionner automatiquement.

### 3. Rebuild l'application

```bash
cd android
./gradlew clean
cd ..
npm run android
```

## Configuration iOS

### 1. Installer les pods

```bash
cd ios
pod install
cd ..
```

### 2. Modifier `ios/Goodfriends/AppDelegate.mm` (ou AppDelegate.m)

Ajouter les imports en haut du fichier :

```objc
#import <UserNotifications/UserNotifications.h>
#import <RNCPushNotificationIOS.h>
```

Ajouter les méthodes suivantes dans la classe AppDelegate :

```objc
// Required for the register event.
- (void)application:(UIApplication *)application didRegisterUserNotificationSettings:(UIUserNotificationSettings *)notificationSettings
{
 [RNCPushNotificationIOS didRegisterUserNotificationSettings:notificationSettings];
}

// Required for the notification event. You must call the completion handler after handling the remote notification.
- (void)application:(UIApplication *)application didReceiveRemoteNotification:(NSDictionary *)userInfo
fetchCompletionHandler:(void (^)(UIBackgroundFetchResult))completionHandler
{
  [RNCPushNotificationIOS didReceiveRemoteNotification:userInfo fetchCompletionHandler:completionHandler];
}

// Required for the registrationError event.
- (void)application:(UIApplication *)application didFailToRegisterForRemoteNotificationsWithError:(NSError *)error
{
 [RNCPushNotificationIOS didFailToRegisterForRemoteNotificationsWithError:error];
}

// Required for localNotification event
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
didReceiveNotificationResponse:(UNNotificationResponse *)response
         withCompletionHandler:(void (^)(void))completionHandler
{
  [RNCPushNotificationIOS didReceiveNotificationResponse:response];
  completionHandler();
}

// Called when a notification is delivered to a foreground app.
-(void)userNotificationCenter:(UNUserNotificationCenter *)center willPresentNotification:(UNNotification *)notification withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
{
  completionHandler(UNNotificationPresentationOptionSound | UNNotificationPresentationOptionAlert | UNNotificationPresentationOptionBadge);
}
```

### 3. Rebuild l'application

```bash
npm run ios
```

## Utilisation

Les notifications sont maintenant configurées et fonctionnelles :

1. **Dans le profil utilisateur** : Vous pouvez activer/désactiver les notifications d'anniversaire
2. **Test** : Utilisez le bouton "Tester les notifications" dans le profil pour vérifier que tout fonctionne
3. **Automatique** : Les notifications sont automatiquement planifiées lors de l'ajout/modification d'un contact avec une date de naissance
4. **Notifications programmées** :
   - Une notification la veille de l'anniversaire à 9h
   - Une notification le jour de l'anniversaire à 9h
   - Les notifications sont répétées chaque année

## Dépannage

### Les notifications n'apparaissent pas

1. Vérifiez que les permissions sont accordées dans les paramètres du téléphone
2. Sur Android 13+, assurez-vous que la permission POST_NOTIFICATIONS est accordée
3. Testez avec le bouton de test dans le profil
4. Vérifiez les logs : `npx react-native log-android` ou `npx react-native log-ios`

### Les notifications ne se répètent pas

- Sur Android, vérifiez que l'application n'est pas en mode économie d'énergie
- Sur iOS, vérifiez que les notifications locales sont autorisées dans les paramètres

### Erreur de build Android

- Nettoyez le build : `cd android && ./gradlew clean && cd ..`
- Vérifiez que toutes les modifications dans AndroidManifest.xml sont correctes
- Rebuild : `npm run android`
