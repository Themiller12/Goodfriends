# Système de Notifications d'Anniversaire - Goodfriends

## Fonctionnalités implémentées

### 1. Service de Notifications (`NotificationService.ts`)

Le service de notifications gère toutes les fonctionnalités liées aux rappels d'anniversaire :

#### Fonctionnalités principales :
- ✅ **Planification automatique** : Notifications programmées automatiquement lors de l'ajout/modification d'un contact
- ✅ **Double notification** : Une notification la veille (à 9h) et une le jour même (à 9h)
- ✅ **Répétition annuelle** : Les notifications se répètent automatiquement chaque année
- ✅ **Notifications pour les enfants** : Les anniversaires des enfants (non-contacts) sont également suivis
- ✅ **Gestion des permissions** : Demande automatique des permissions Android 13+

#### Méthodes disponibles :
```typescript
// Activer/désactiver les notifications
toggleBirthdayNotifications(enabled: boolean)

// Envoyer une notification de test
sendTestNotification()

// Planifier les notifications pour un contact
scheduleBirthdayNotificationsForContact(contact: Contact)

// Planifier toutes les notifications
scheduleAllBirthdayNotifications()

// Annuler les notifications d'un contact
cancelBirthdayNotificationsForContact(contactId: string)

// Annuler les notifications d'un enfant
cancelBirthdayNotificationsForChild(childId: string)
```

### 2. Interface Utilisateur dans le Profil

Le profil utilisateur contient maintenant une section dédiée aux notifications :

#### Contrôles disponibles :
- **Switch d'activation/désactivation** : Active ou désactive toutes les notifications d'anniversaire
- **Bouton de test** : Permet de tester que les notifications fonctionnent correctement
- **Description claire** : Explique que les notifications sont envoyées la veille et le jour même

#### Apparence :
```
┌─────────────────────────────────────┐
│ Notifications                       │
│                                     │
│ Anniversaires              [Switch] │
│ Recevoir des rappels pour les      │
│ anniversaires (la veille et le     │
│ jour même)                         │
│                                     │
│ [🔔 Tester les notifications]      │
└─────────────────────────────────────┘
```

### 3. Intégration avec les Contacts

Les notifications sont automatiquement gérées lors des opérations sur les contacts :

#### Création de contact (`AddContactScreen.tsx`)
- Planifie automatiquement les notifications après la création
- Inclut les enfants ajoutés au contact

#### Modification de contact (`ContactDetailScreen.tsx`)
- Re-planifie les notifications après chaque modification
- Met à jour les notifications si la date de naissance change

#### Suppression de contact
- Annule automatiquement toutes les notifications associées
- Nettoie les notifications des enfants

#### Gestion des enfants
- Planifie les notifications lors de l'ajout d'un enfant
- Annule les notifications lors de la suppression d'un enfant

### 4. Initialisation au Démarrage (`App.tsx`)

L'application initialise automatiquement les notifications au démarrage :
- Demande les permissions nécessaires
- Planifie toutes les notifications pour les contacts existants
- Se synchronise avec les données locales

## Format des Notifications

### Notification la veille
```
🎉 Anniversaire demain !
L'anniversaire de [Prénom Nom] est demain ! Il/Elle aura X ans.
```

### Notification le jour même
```
🎂 Anniversaire aujourd'hui !
C'est l'anniversaire de [Prénom Nom] ! Il/Elle fête ses X ans.
```

### Pour les enfants
```
🎂 Anniversaire aujourd'hui !
C'est l'anniversaire de [Prénom enfant] (enfant de [Prénom parent]) ! Il/Elle fête ses X ans.
```

## Stockage des Préférences

Les préférences de notification sont stockées dans :
- **AsyncStorage** : Clé `@notification_settings`
- **Profil utilisateur** : Propriété `birthdayNotificationsEnabled`

## Permissions Requises

### Android
- `POST_NOTIFICATIONS` (Android 13+)
- `VIBRATE`
- `RECEIVE_BOOT_COMPLETED`

### iOS
- Notifications locales (demandées automatiquement)

## Canal de Notification Android

**ID du canal** : `birthday-channel`
**Nom** : Anniversaires
**Importance** : HIGH (pour assurer la visibilité)
**Options** : Son, vibration, badge

## Comportement

1. **Activation** : Lorsque l'utilisateur active les notifications dans le profil, toutes les notifications pour tous les contacts sont planifiées
2. **Désactivation** : Toutes les notifications sont annulées
3. **Ajout de contact** : Les notifications sont automatiquement ajoutées
4. **Modification** : Les notifications sont mises à jour
5. **Suppression** : Les notifications sont supprimées

## Tests

Pour tester le système :

1. **Test immédiat** :
   - Aller dans le profil
   - Appuyer sur "🔔 Tester les notifications"
   - Une notification de test apparaît immédiatement

2. **Test des anniversaires** :
   - Créer un contact avec un anniversaire demain
   - Attendre jusqu'à 9h le lendemain
   - La notification devrait apparaître

3. **Vérifier les notifications programmées** :
   ```javascript
   NotificationService.getScheduledNotifications((notifications) => {
     console.log('Scheduled notifications:', notifications);
   });
   ```

## Dépannage

Si les notifications ne fonctionnent pas :

1. Vérifier que les permissions sont accordées dans les paramètres du système
2. S'assurer que l'application n'est pas en mode économie d'énergie
3. Vérifier que les notifications ne sont pas désactivées dans les paramètres de l'app
4. Tester avec le bouton de test
5. Consulter les logs : `npx react-native log-android` ou `npx react-native log-ios`

## Prochaines Améliorations Possibles

- [ ] Personnalisation de l'heure des notifications
- [ ] Choix du nombre de jours avant l'anniversaire
- [ ] Notifications pour d'autres événements (anniversaire de mariage, etc.)
- [ ] Historique des notifications envoyées
- [ ] Réponses rapides aux notifications
- [ ] Intégration avec le calendrier système
