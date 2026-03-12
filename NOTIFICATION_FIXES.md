# Corrections des Notifications

## Problèmes identifiés et résolus

### 1. Notifications de nouveaux messages
**Problème:** Les notifications n'étaient pas affichées pour les nouveaux messages reçus.

**Causes:**
- La méthode `MessageService.checkNewMessages()` ne gardait qu'un seul ID de message en mémoire, ce qui ne fonctionnait pas correctement en multi-conversation
- Les messages déjà notifiés n'étaient pas persistés, donc pouvaient être re-notifiés après un redémarrage

**Solution:**
- ✅ Amélioration de `MessageService.checkNewMessages()` pour utiliser AsyncStorage et garder une liste des messages notifiés
- ✅ Vérification des nouveaux messages au démarrage de l'application (`App.tsx`)
- ✅ Vérification quand l'application revient en premier plan
- ✅ Polling automatique dans `ConversationsScreen` (toutes les 5 secondes)
- ✅ Limitation de la liste des messages notifiés à 100 entrées pour éviter une croissance infinie

### 2. Notifications de demandes d'ami
**Problème:** Les notifications n'étaient pas affichées pour les nouvelles demandes d'ami.

**Causes:**
- La méthode `FriendRequestService.checkNewFriendRequests()` existait mais n'était jamais appelée automatiquement

**Solution:**
- ✅ Ajout de l'appel dans `App.tsx` au démarrage
- ✅ Ajout de l'appel quand l'application revient en premier plan
- ✅ Polling automatique dans `ConversationsScreen` (toutes les 5 secondes)
- ✅ Polling automatique dans `HomeScreen` (toutes les 10 secondes)
- ✅ Vérification au chargement du `ProfileScreen`

## Boutons de test ajoutés

Dans l'écran de Profil, 4 nouveaux boutons ont été ajoutés pour tester les notifications :

1. **🔔 Tester notification anniversaire** - Envoie une notification d'anniversaire de test
2. **💬 Tester notification message** - Simule une notification de nouveau message
3. **👋 Tester notification demande d'ami** - Simule une notification de demande d'ami
4. **🔍 Vérifier nouvelles notifications** - Force la vérification immédiate des vrais nouveaux messages et demandes d'ami

## Fichiers modifiés

### Services
- `src/services/MessageService.ts` - Amélioration de `checkNewMessages()` avec persistance
- `src/services/NotificationService.ts` - Déjà correct, pas de modification nécessaire
- `src/services/FriendRequestService.ts` - Déjà correct, pas de modification nécessaire

### Écrans
- `src/screens/ProfileScreen.tsx` - Ajout des 4 boutons de test et import MessageService
- `src/screens/ConversationsScreen.tsx` - Ajout de la vérification des demandes d'ami
- `src/screens/HomeScreen.tsx` - Déjà correct
- `src/screens/ChatScreen.tsx` - Déjà correct

### Application
- `App.tsx` - Ajout de la vérification au démarrage et au retour en premier plan

## Comment tester

1. **Test des notifications de message:**
   - Utilisez le bouton "💬 Tester notification message" dans le profil
   - OU envoyez un vrai message depuis un autre compte

2. **Test des notifications de demande d'ami:**
   - Utilisez le bouton "👋 Tester notification demande d'ami" dans le profil
   - OU envoyez une vraie demande depuis un autre compte

3. **Vérification manuelle:**
   - Utilisez le bouton "🔍 Vérifier nouvelles notifications" pour forcer une vérification immédiate

## Notes importantes

- Les notifications nécessitent les permissions appropriées (demandées au premier lancement)
- Sur Android 13+, la permission POST_NOTIFICATIONS doit être accordée
- Les notifications sont vérifiées automatiquement :
  - Au démarrage de l'app
  - Quand l'app revient en premier plan
  - Toutes les 5 secondes dans ConversationsScreen
  - Toutes les 10 secondes dans HomeScreen
- Les canaux de notification Android sont correctement configurés dans `NotificationService`

## Paramètres de notification

Les utilisateurs peuvent activer/désactiver les notifications dans le profil :
- **Notifications d'anniversaire** - Rappels la veille et le jour même
- **Notifications de messages** - Alertes pour les nouveaux messages

