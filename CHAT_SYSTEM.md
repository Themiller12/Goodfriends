# Système de Chat GoodFriends

## Vue d'ensemble
Le système de chat permet aux utilisateurs GoodFriends de communiquer entre eux en temps réel via des messages privés.

## Fonctionnalités

### 1. Envoi de messages
- Envoi de messages texte entre utilisateurs
- Validation du destinataire
- Messages limités à 1000 caractères

### 2. Historique des conversations
- Affichage chronologique des messages
- Distinction visuelle entre messages envoyés et reçus
- Affichage de l'heure/date d'envoi

### 3. Notifications de messages non lus
- Compteur de messages non lus dans le header
- Badge sur chaque conversation avec le nombre de messages non lus
- Marquage automatique des messages comme lus lors de l'ouverture de la conversation

### 4. Liste des conversations
- Affichage de toutes les conversations avec le dernier message
- Recherche dans les conversations
- Actualisation automatique toutes les 5 secondes

### 5. Interface de chat
- Polling automatique toutes les 3 secondes pour récupérer les nouveaux messages
- Input avec support multiligne
- Scroll automatique vers le bas
- Design moderne avec bulles de chat

## Architecture technique

### Base de données
**Table messages:**
- `id` (VARCHAR 36, PRIMARY KEY) - ID unique du message
- `sender_id` (VARCHAR 36) - ID de l'expéditeur (FK vers users)
- `receiver_id` (VARCHAR 36) - ID du destinataire (FK vers users)
- `message` (TEXT) - Contenu du message
- `is_read` (BOOLEAN) - Statut de lecture
- `created_at` (TIMESTAMP) - Date de création

**Indexes:**
- `idx_sender_receiver` - Optimisation des requêtes de conversation
- `idx_created_at` - Tri chronologique
- `idx_receiver_unread` - Comptage des messages non lus
- `idx_conversation` - Performance des conversations

### API (api/messages.php)

**GET ?action=conversation&otherUserId={id}**
- Récupère l'historique complet des messages avec un utilisateur
- Trie par date croissante
- Retourne les informations des expéditeurs/destinataires

**GET ?action=conversations**
- Récupère la liste de toutes les conversations
- Pour chaque conversation:
  - Dernier message
  - Date du dernier message
  - Nombre de messages non lus
  - Informations de l'autre utilisateur

**GET ?action=unread-count**
- Récupère le nombre total de messages non lus pour l'utilisateur connecté

**POST ?action=send**
```json
{
  "receiverId": "user-id",
  "message": "Texte du message"
}
```
- Envoie un message à un utilisateur
- Vérifie l'existence du destinataire
- Retourne le message créé avec toutes ses informations

**PUT ?action=mark-read**
```json
{
  "otherUserId": "user-id"
}
```
- Marque tous les messages d'un utilisateur comme lus
- Retourne le nombre de messages mis à jour

### Services (src/services/MessageService.ts)

**sendMessage(receiverId, message)**
- Envoie un message à un utilisateur

**getConversation(otherUserId)**
- Récupère l'historique des messages avec un utilisateur

**markAsRead(otherUserId)**
- Marque tous les messages d'un utilisateur comme lus

**getConversations()**
- Récupère la liste des conversations

**getUnreadCount()**
- Récupère le nombre total de messages non lus

### Écrans

**ChatScreen (src/screens/ChatScreen.tsx)**
- Interface de chat 1-à-1
- Polling automatique toutes les 3 secondes
- Marquage automatique des messages comme lus à l'ouverture
- Input de message avec bouton d'envoi
- Affichage des messages avec distinction visuelle (envoyés/reçus)
- Formatage intelligent de la date/heure

**ConversationsScreen (src/screens/ConversationsScreen.tsx)**
- Liste de toutes les conversations
- Barre de recherche
- Badge de messages non lus par conversation
- Polling automatique toutes les 5 secondes
- Pull-to-refresh
- Navigation vers ChatScreen au clic

### Navigation

**Dans AppNavigator.tsx:**
- Route `Chat` - Interface de chat avec un utilisateur
- Route `Conversations` - Liste des conversations

**Dans HomeScreen.tsx:**
- Bouton Messages (💬) dans le header avec badge de messages non lus
- Navigation vers ConversationsScreen

**Dans ContactDetailScreen.tsx:**
- Bouton "💬 Envoyer un message" affiché uniquement pour les contacts GoodFriends
- Vérifie la présence de `contact.goodfriendsUserId`
- Navigation directe vers ChatScreen

## Types TypeScript

**Message:**
```typescript
interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  senderEmail?: string;
  receiverEmail?: string;
}
```

**Conversation:**
```typescript
interface Conversation {
  otherUserId: string;
  otherUserEmail: string;
  otherUserName: string | null;
  otherUserPhone: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}
```

**Contact (ajout du champ):**
```typescript
interface Contact {
  // ... autres champs
  goodfriendsUserId?: string; // ID de l'utilisateur GoodFriends
}
```

## Installation

### 1. Migration de la base de données
Exécuter le fichier `migration_chat_system.sql`:
```bash
mysql -u root -p goodfriends < migration_chat_system.sql
```

Ou via phpMyAdmin:
1. Ouvrir phpMyAdmin
2. Sélectionner la base `goodfriends`
3. Onglet SQL
4. Copier/coller le contenu de `migration_chat_system.sql`
5. Exécuter

### 2. Vérification
Les fichiers suivants doivent être présents:
- ✅ `api/messages.php`
- ✅ `src/services/MessageService.ts`
- ✅ `src/screens/ChatScreen.tsx`
- ✅ `src/screens/ConversationsScreen.tsx`
- ✅ `src/navigation/AppNavigator.tsx` (mis à jour)
- ✅ `src/screens/HomeScreen.tsx` (mis à jour)
- ✅ `src/screens/ContactDetailScreen.tsx` (mis à jour)
- ✅ `src/types/index.ts` (mis à jour)

### 3. Test
1. Démarrer XAMPP (Apache + MySQL)
2. Compiler l'application: `npm run android`
3. Créer deux comptes utilisateurs différents
4. Depuis le compte A, rechercher et ajouter le compte B comme ami
5. Le compte B accepte la demande d'ami
6. Sur le compte A, aller sur le contact B et cliquer sur "💬 Envoyer un message"
7. Envoyer des messages et vérifier la réception en temps réel

## Flux d'utilisation

### Envoi d'un message
1. Utilisateur A ouvre le contact B (qui est un utilisateur GoodFriends)
2. Clique sur "💬 Envoyer un message"
3. Ouvre ChatScreen avec l'ID de B
4. Tape un message et envoie
5. Le message apparaît instantanément dans la conversation
6. Le polling (3s) récupère la réponse de B automatiquement

### Réception d'un message
1. Utilisateur B reçoit un message de A
2. Le badge dans HomeScreen s'incrémente automatiquement (polling 10s)
3. B clique sur le bouton Messages (💬)
4. Voit la conversation avec A avec un badge de messages non lus
5. Clique sur la conversation
6. Les messages sont marqués comme lus automatiquement
7. Le badge disparaît

### Accès aux conversations
**Méthode 1: Depuis le contact**
HomeScreen → Contact → Bouton "💬 Envoyer un message"

**Méthode 2: Depuis la liste des conversations**
HomeScreen → Bouton Messages (💬) → Liste des conversations → Sélection

## Performance

### Optimisations
- Indexes sur les colonnes de recherche fréquente
- Polling configurable (3s pour chat actif, 5s pour liste, 10s pour badge)
- Requêtes SQL optimisées avec JOINs
- Cache local avec AsyncStorage (future amélioration possible)

### Considérations
- Le polling peut être remplacé par WebSocket pour une vraie connexion temps réel
- Actuellement: ~4 requêtes/minute en chat actif
- Limiter le nombre de messages chargés (pagination future)

## Améliorations futures

### Court terme
1. Pagination des messages (charger par blocs de 50)
2. Indicateur "en train d'écrire..."
3. Confirmation de lecture (double coche)
4. Support des emojis natifs
5. Copier un message

### Moyen terme
1. WebSocket pour communication temps réel (éliminer le polling)
2. Envoi de photos/fichiers
3. Messages vocaux
4. Archivage des conversations
5. Suppression de messages

### Long terme
1. Chats de groupe
2. Appels audio/vidéo
3. Chiffrement end-to-end
4. Messages éphémères
5. Réactions aux messages

## Sécurité

### Mesures en place
- ✅ Authentification JWT requise pour toutes les requêtes
- ✅ Vérification de l'existence du destinataire
- ✅ Foreign keys CASCADE pour cohérence des données
- ✅ Validation de la longueur des messages (1000 caractères max)

### À implémenter
- [ ] Rate limiting pour éviter le spam
- [ ] Blocage d'utilisateurs
- [ ] Signalement de messages inappropriés
- [ ] Chiffrement des messages en base de données

## Troubleshooting

### Problème: Messages non reçus
- Vérifier que XAMPP (MySQL) est démarré
- Vérifier que l'API est accessible (`api/messages.php`)
- Vérifier que les deux utilisateurs sont bien amis (table `friend_requests`)
- Vérifier les logs de la console

### Problème: Badge ne s'actualise pas
- Le polling est configuré à 10 secondes
- Fermer et rouvrir l'application
- Vérifier la connexion réseau

### Problème: Conversation ne se charge pas
- Vérifier que le `goodfriendsUserId` est bien défini sur le contact
- Vérifier que l'utilisateur existe dans la table `users`
- Regarder les erreurs dans la console

## Contact & Support
Pour toute question ou problème, consulter les logs de l'application et vérifier:
1. État de MySQL
2. Logs PHP dans `xampp/apache/logs/error.log`
3. Console React Native
4. Requêtes réseau dans DevTools

---

**Date de création:** 2026-01-28  
**Version:** 1.0.0  
**Auteur:** GoodFriends Development Team
