# Système de Connexion entre Utilisateurs GoodFriends

## Vue d'ensemble

Cette fonctionnalité permet aux utilisateurs de l'application GoodFriends de se connecter entre eux, rechercher d'autres utilisateurs et créer automatiquement des contacts bidirectionnels.

## Architecture

### Base de données

#### Table `user_profiles`
Stocke les informations de profil des utilisateurs (séparée de `users` pour la flexibilité).
- `user_id` : Lien vers la table users
- `first_name`, `last_name` : Nom de l'utilisateur
- `phone` : Numéro de téléphone (indexé pour la recherche)
- `date_of_birth`, `bio`, `photo` : Informations supplémentaires

#### Table `friend_requests`
Gère les demandes d'ami entre utilisateurs.
- `sender_id` : Utilisateur qui envoie la demande
- `receiver_id` : Utilisateur qui reçoit la demande
- `status` : 'pending' | 'accepted' | 'rejected'

#### Table `contacts` (modifiée)
Ajout de colonnes pour identifier les contacts GoodFriends :
- `is_goodfriends_user` : Boolean indiquant si c'est un utilisateur GoodFriends
- `goodfriends_user_id` : ID de l'utilisateur GoodFriends lié

### API Endpoints

#### 1. Rechercher des utilisateurs
**GET** `/api/friend_requests.php?action=search&query={email_or_phone}`

Recherche des utilisateurs par email ou téléphone.

**Réponse :**
```json
{
  "success": true,
  "data": [
    {
      "id": "user123",
      "email": "user@example.com",
      "firstName": "Jean",
      "lastName": "Dupont",
      "phone": "+33612345678",
      "photo": "url...",
      "requestStatus": "pending" | "accepted" | null
    }
  ]
}
```

#### 2. Envoyer une demande d'ami
**POST** `/api/friend_requests.php?action=send`

```json
{
  "receiverId": "user123"
}
```

#### 3. Récupérer les demandes en attente
**GET** `/api/friend_requests.php?action=pending`

Récupère toutes les demandes reçues en attente.

#### 4. Accepter une demande
**POST** `/api/friend_requests.php?action=accept`

```json
{
  "requestId": "request123"
}
```

**Comportement :**
- Met à jour le statut de la demande à 'accepted'
- Crée automatiquement les contacts chez les 2 utilisateurs
- Les contacts sont marqués comme `is_goodfriends_user = true`
- Lien bidirectionnel via `goodfriends_user_id`

#### 5. Refuser une demande
**POST** `/api/friend_requests.php?action=reject`

```json
{
  "requestId": "request123"
}
```

## Interface Utilisateur

### 1. Écran de recherche (SearchUsersScreen)

**Accès :** Depuis AddContactScreen → Bouton "👥 GoodFriends"

**Fonctionnalités :**
- Champ de recherche (email ou téléphone)
- Liste des résultats avec photos/avatars
- Boutons d'action selon le statut :
  - **"+ Ajouter"** : Si aucune demande n'existe
  - **"En attente"** : Si une demande est déjà envoyée
  - **"Déjà ami"** : Si la connexion est acceptée

**Design :**
```
┌─────────────────────────────────────┐
│ Rechercher des utilisateurs         │
│ Recherchez vos amis par email...    │
├─────────────────────────────────────┤
│ [Champ de recherche              ]  │
│ [🔍 Rechercher]                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ [Avatar] Jean Dupont            │ │
│ │          jean@example.com       │ │
│ │          [+ Ajouter]            │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 2. Section dans le Profil (ProfileScreen)

**Fonctionnalités :**
- Badge avec nombre de demandes en attente
- Liste déroulante (collapsible)
- Boutons accepter (✓) et refuser (✕)

**Design :**
```
┌─────────────────────────────────────┐
│ Demandes d'amis en attente [2]  ▼  │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ [Avatar] Marie Martin           │ │
│ │          marie@example.com  [✓][✕]│
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ [Avatar] Pierre Durand          │ │
│ │          pierre@example.com [✓][✕]│
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 3. Boutons dans AddContactScreen

Deux boutons en haut de l'écran :
- **"📱 Importer"** : Import depuis les contacts du téléphone (existant)
- **"👥 GoodFriends"** : Recherche d'utilisateurs GoodFriends (nouveau)

## Flux Utilisateur

### Scénario 1 : Envoi d'une demande d'ami

1. Alice ouvre AddContactScreen
2. Clique sur "👥 GoodFriends"
3. Saisit l'email de Bob : bob@example.com
4. Clique sur "🔍 Rechercher"
5. Voit Bob dans les résultats
6. Clique sur "+ Ajouter"
7. Confirmation → Demande envoyée
8. Le statut devient "En attente"

### Scénario 2 : Acceptation d'une demande

1. Bob ouvre son Profil
2. Voit le badge "Demandes d'amis en attente [1]"
3. Déplie la section
4. Voit la demande d'Alice
5. Clique sur ✓ (accepter)
6. Confirmation → "Demande acceptée ! Le contact a été créé."
7. **Résultat :**
   - Alice apparaît dans les contacts de Bob
   - Bob apparaît dans les contacts d'Alice
   - Les deux contacts sont marqués comme utilisateurs GoodFriends

### Scénario 3 : Refus d'une demande

1. Bob clique sur ✕ (refuser)
2. Confirmation
3. La demande est refusée et disparaît de la liste
4. Alice peut renvoyer une demande plus tard

## Services

### FriendRequestService

```typescript
class FriendRequestService {
  // Rechercher des utilisateurs
  async searchUsers(query: string): Promise<GoodFriendsUser[]>
  
  // Envoyer une demande d'ami
  async sendFriendRequest(receiverId: string): Promise<void>
  
  // Récupérer les demandes en attente
  async getPendingRequests(): Promise<FriendRequest[]>
  
  // Accepter une demande
  async acceptFriendRequest(requestId: string): Promise<void>
  
  // Refuser une demande
  async rejectFriendRequest(requestId: string): Promise<void>
}
```

## Types TypeScript

```typescript
interface GoodFriendsUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  photo?: string;
  requestStatus?: 'pending' | 'accepted' | 'rejected' | null;
}

interface FriendRequest {
  id: string;
  senderId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  photo?: string;
  createdAt: string;
}
```

## Migration

Pour activer cette fonctionnalité sur une base de données existante :

```bash
mysql -u root -p goodfriends < migration_goodfriends_users.sql
```

Ou via phpMyAdmin : Importer le fichier `migration_goodfriends_users.sql`

## Sécurité

### Authentification
- Tous les endpoints nécessitent un token JWT valide
- Vérifié via `verifyToken()` dans l'API

### Validation
- Vérification que les utilisateurs existent avant création de demande
- Vérification de propriété des demandes avant acceptation/refus
- Protection contre les doublons de demandes

### Privacy
- Seuls les utilisateurs authentifiés peuvent rechercher
- Les recherches ne retournent que les informations publiques
- Pas d'accès aux données sensibles des autres utilisateurs

## Améliorations Futures

### Court terme
- [ ] Notification push lors de réception de demande
- [ ] Synchronisation en temps réel des contacts
- [ ] Possibilité de bloquer un utilisateur

### Moyen terme
- [ ] Chat en temps réel entre contacts GoodFriends
- [ ] Partage de photos/souvenirs
- [ ] Suggestions d'amis (amis en commun)

### Long terme
- [ ] Groupes GoodFriends (plusieurs utilisateurs)
- [ ] Événements partagés
- [ ] Calendrier d'anniversaires partagé

## Tests

### Test manuel de la recherche
1. Créer 2 comptes utilisateurs
2. Se connecter avec le compte A
3. Rechercher le compte B par email
4. Vérifier que B apparaît dans les résultats

### Test de demande d'ami
1. Envoyer une demande de A vers B
2. Vérifier le statut "En attente" sur A
3. Se connecter avec B
4. Vérifier la demande dans le profil de B
5. Accepter la demande
6. Vérifier que les contacts sont créés chez A et B

### Test de refus
1. Envoyer une demande de A vers C
2. Se connecter avec C
3. Refuser la demande
4. Vérifier que la demande disparaît
5. Vérifier qu'aucun contact n'est créé

## Dépannage

### Erreur "Utilisateur non trouvé"
- Vérifier que l'email/téléphone existe dans la base de données
- Vérifier la connexion réseau
- Consulter les logs API

### Demande non reçue
- Vérifier que les deux utilisateurs sont connectés
- Rafraîchir l'écran de profil
- Vérifier la table `friend_requests` dans la base de données

### Contact non créé après acceptation
- Vérifier les logs de transaction dans l'API
- Vérifier que la table `user_profiles` contient les informations
- Re-accepter la demande si nécessaire
