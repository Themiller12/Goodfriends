# Système de Cache Local - Goodfriends

## Vue d'ensemble

Un système de cache local a été mis en place pour éviter les pages blanches lorsque l'application n'a pas accès à Internet. Les données sont stockées localement et réutilisées en mode hors ligne.

## Données mises en cache

Les données suivantes sont maintenant stockées localement :

1. **Contacts** - Tous les contacts de l'utilisateur
2. **Groupes** - Les groupes de contacts
3. **Conversations** - La liste des conversations avec messages récents

## Fonctionnement

### Stratégie de cache

Le système utilise une stratégie "Cache-First with Background Update" :

1. **Première lecture** : Vérifie si les données en cache sont valides (< 5 minutes)
2. **Cache valide** : Retourne immédiatement les données en cache et lance une mise à jour en arrière-plan
3. **Cache invalide** : Télécharge les données depuis l'API et met à jour le cache
4. **Erreur réseau** : Utilise les données en cache même si elles sont expirées

### Durée de validité

- **Durée du cache** : 5 minutes
- Après 5 minutes, les données sont considérées comme périmées et une nouvelle requête API est effectuée
- En cas d'erreur réseau, les données périmées sont quand même utilisées

### Invalidation du cache

Le cache est automatiquement invalidé lors de :

- **Ajout** d'un contact/groupe
- **Modification** d'un contact/groupe
- **Suppression** d'un contact/groupe
- **Envoi** d'un message
- **Lecture** de messages
- **Déconnexion** de l'utilisateur

## Fichiers modifiés

### Nouveau fichier

- **`src/services/CacheService.ts`** : Service principal de gestion du cache
  - `cacheContacts()` / `getCachedContacts()` - Gestion du cache des contacts
  - `cacheGroups()` / `getCachedGroups()` - Gestion du cache des groupes
  - `cacheConversations()` / `getCachedConversations()` - Gestion du cache des conversations
  - `invalidateCache()` - Invalidation d'un type de cache spécifique
  - `clearAllCache()` - Suppression complète du cache

### Fichiers modifiés

#### `src/services/StorageServiceAPI.ts`
- **`getContacts()`** : Utilise le cache en priorité, mise à jour en arrière-plan
- **`getGroups()`** : Utilise le cache en priorité, mise à jour en arrière-plan
- **`addContact()` / `updateContact()` / `deleteContact()`** : Invalide le cache après modification
- **`addGroup()` / `updateGroup()` / `deleteGroup()`** : Invalide le cache après modification

#### `src/services/MessageService.ts`
- **`getConversations()`** : Utilise le cache en priorité, mise à jour en arrière-plan
- **`sendMessage()`** : Invalide le cache des conversations après envoi
- **`markAsRead()`** : Invalide le cache après lecture

#### `src/services/StorageService.ts`
- **`clearAll()`** : Efface également le cache
- **`clearSession()`** : Efface le cache lors de la déconnexion

## Avantages

✅ **Expérience utilisateur améliorée** : Plus de pages blanches sans connexion
✅ **Performance** : Chargement instantané des données en cache
✅ **Utilisation optimisée du réseau** : Mise à jour en arrière-plan sans bloquer l'UI
✅ **Résilience** : L'application fonctionne même avec une connexion intermittente

## Clés AsyncStorage utilisées

```typescript
@cache_contacts               // Données des contacts
@cache_groups                 // Données des groupes
@cache_conversations          // Données des conversations
@cache_contacts_timestamp     // Timestamp du cache contacts
@cache_groups_timestamp       // Timestamp du cache groupes
@cache_conversations_timestamp // Timestamp du cache conversations
```

## Comportement attendu

### Avec connexion Internet
1. Les données en cache (< 5 min) sont affichées immédiatement
2. Une mise à jour silencieuse se fait en arrière-plan
3. L'utilisateur ne remarque aucun délai

### Sans connexion Internet
1. Les données en cache sont affichées
2. Un message d'erreur peut apparaître dans les logs mais l'application reste fonctionnelle
3. Les données restent consultables même si elles sont périmées

### Après une modification
1. Le cache est invalidé
2. Au prochain chargement, les données fraîches sont téléchargées
3. Le nouveau cache est créé avec les données à jour

## Notes techniques

- Le cache utilise `AsyncStorage` de React Native
- Les timestamps sont stockés en millisecondes
- Les données sont sérialisées en JSON
- Tous les appels sont asynchrones (async/await)
- Les erreurs sont loggées mais n'empêchent pas le fonctionnement

## Tests recommandés

1. **Test hors ligne** :
   - Se connecter avec Internet
   - Consulter contacts, groupes et conversations
   - Couper Internet
   - Naviguer dans l'application → Les données doivent être visibles

2. **Test de mise à jour** :
   - Modifier un contact via l'API web
   - Ouvrir l'application → Les changements doivent apparaître après quelques secondes

3. **Test de déconnexion** :
   - Se déconnecter
   - Se reconnecter avec un autre compte
   - Vérifier que les anciennes données ne sont pas visibles

## Future optimisations possibles

- Configurer la durée de validité du cache par type de données
- Implémenter une stratégie de cache différentielle (ne télécharger que les changements)
- Ajouter une taille maximale au cache
- Implémenter un système de synchronisation en arrière-plan
