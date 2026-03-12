# Migration vers l'API PHP/MySQL

## Résumé
L'application **Goodfriends** a été migrée d'un système de stockage local (AsyncStorage) vers une architecture client-serveur utilisant MySQL et une API PHP REST.

## Infrastructure Backend

### Base de données MySQL
- **Serveur**: frhb81075ds.ikexpress.com
- **Base de données**: goodfriends
- **Tables créées**:
  - `users` - Comptes utilisateurs avec authentification
  - `contacts` - Contacts personnels
  - `groups` - Groupes de contacts
  - `children` - Enfants non-contacts
  - `relationships` - Relations entre contacts
  - `contact_groups` - Table de liaison contacts-groupes (many-to-many)

### API REST PHP
**URL de base**: http://volt-services.fr/DEV/goodfriends/api/

#### Endpoints d'authentification (`auth.php`)
- `POST /auth.php?action=register` - Créer un compte avec code de vérification
- `POST /auth.php?action=login` - Connexion avec JWT token
- `POST /auth.php?action=verify` - Vérifier le code à 6 chiffres
- `POST /auth.php?action=resend` - Renvoyer le code de vérification
- `GET /auth.php?action=profile` - Obtenir le profil (requiert token)
- `PUT /auth.php?action=profile` - Mettre à jour le profil (requiert token)

#### Endpoints contacts (`contacts.php`)
- `GET /contacts.php` - Liste tous les contacts avec enfants et relations
- `GET /contacts.php?id=X` - Détails d'un contact spécifique
- `POST /contacts.php` - Créer un nouveau contact
- `PUT /contacts.php` - Mettre à jour un contact
- `DELETE /contacts.php?id=X` - Supprimer un contact

#### Endpoints groupes (`groups.php`)
- `GET /groups.php` - Liste tous les groupes
- `GET /groups.php?id=X` - Détails d'un groupe
- `POST /groups.php` - Créer un groupe
- `PUT /groups.php` - Mettre à jour un groupe
- `DELETE /groups.php?id=X` - Supprimer un groupe

#### Endpoints relations (`relationships.php`)
- `POST /relationships.php?action=child` - Ajouter un enfant à un contact
- `DELETE /relationships.php?action=child&id=X` - Supprimer un enfant
- `POST /relationships.php?action=relationship` - Créer une relation entre contacts
- `DELETE /relationships.php?action=relationship&contactId=X&relatedContactId=Y` - Supprimer une relation

### Sécurité
- **Authentification**: JWT tokens avec expiration 30 jours
- **Autorisation**: Bearer token dans les headers
- **Mots de passe**: Hachés avec `password_hash()` (bcrypt)
- **CORS**: Configuré pour accepter les requêtes cross-origin
- **Isolation des données**: Tous les endpoints filtrent par `user_id`

## Modifications Frontend

### Nouvelles dépendances
```bash
npm install axios
```

### Nouveaux fichiers créés

#### 1. `src/config/api.ts`
Configuration centralisée des URLs et endpoints de l'API.

#### 2. `src/services/ApiClient.ts`
Client HTTP basé sur axios avec:
- **Intercepteur de requête**: Ajoute automatiquement le token Bearer
- **Intercepteur de réponse**: Gère l'expiration du token (erreur 401)
- **Méthodes**: `get()`, `post()`, `put()`, `delete()`
- **Gestion du token**: `setToken()`, `clearToken()`

#### 3. `src/services/StorageServiceAPI.ts`
Service wrapper pour toutes les opérations API:
- **Contacts**: getContacts, addContact, updateContact, deleteContact
- **Groupes**: getGroups, addGroup, updateGroup, deleteGroup
- **Enfants**: addChild, deleteChild
- **Relations**: addRelationship, deleteRelationship

### Fichiers modifiés

#### 1. `AuthService.ts` (REMPLACÉ)
- `register()` - Appelle l'API au lieu de stocker localement
- `login()` - Authentification via API, sauvegarde le JWT token
- `verifyCode(email, code)` - Vérifie le code via API
- `resendVerificationCode(email)` - Demande un nouveau code
- `logout()` - Efface le token et le cache utilisateur
- `getCurrentUser()` - Récupère depuis le cache ou l'API

#### 2. `VerificationScreen.tsx` (MODIFIÉ)
- Les appels `verifyCode()` et `resendVerificationCode()` passent maintenant l'email
- Signature des méthodes mise à jour

#### 3. `StorageService.ts` (MODIFIÉ)
- Les méthodes de contacts et groupes délèguent vers `StorageServiceAPI`
- Les méthodes utilisateur restent en local (pour compatibilité cache)
- `saveContacts()` et `saveGroups()` sont dépréciées

#### 4. `ContactService.ts` (MODIFIÉ)
- `addRelationship()` - Utilise l'API via StorageServiceAPI
- Conserve les méthodes utilitaires (calculateAge, getContactSummary, etc.)

#### 5. `ManageRelationsScreen.tsx` (MODIFIÉ)
- `handleAddChild()` - Utilise `StorageServiceAPI.addChild()`
- `handleDeleteChild()` - Utilise `StorageServiceAPI.deleteChild()`
- `handleDeleteRelation()` - Utilise `StorageServiceAPI.deleteRelationship()`

## Stratégie de stockage

### Données via API (persistantes sur serveur)
- Contacts
- Groupes
- Relations entre contacts
- Enfants non-contacts

### Données en local (AsyncStorage)
- Token JWT (@auth_token)
- Cache utilisateur (@current_user)
- Session utilisateur temporaire

## Flux d'authentification

```
1. L'utilisateur s'inscrit → API génère code 6 chiffres et l'envoie
2. L'utilisateur vérifie le code → API active le compte
3. L'utilisateur se connecte → API retourne un JWT token
4. Le token est sauvegardé dans AsyncStorage
5. Toutes les requêtes suivantes incluent le token Bearer
6. Si le token expire (401), l'utilisateur est déconnecté
```

## Tests effectués

### Backend
- ✅ Connexion à la base de données MySQL distante
- ✅ Création et vérification des tables
- ✅ Endpoints testés avec PowerShell/curl
- ✅ Authentification JWT fonctionnelle
- ✅ CRUD contacts opérationnel
- ✅ Relations et enfants fonctionnels
- ✅ Résolution du problème .htaccess (paramètres GET)

### Frontend
- ✅ Installation d'axios
- ✅ Compilation sans erreurs TypeScript
- ✅ Intercepteurs de requêtes configurés
- ✅ Gestion automatique du token

## Problèmes résolus

### Problème .htaccess
**Symptôme**: "Action non reconnue" lors des appels API

**Cause**: Le module mod_rewrite d'Apache supprimait les paramètres GET

**Solution**: 
```apache
# .htaccess dans le dossier api/
RewriteEngine Off
```

### Problème index.php JSON
**Symptôme**: index.php s'affichait en JSON au lieu de HTML

**Cause**: L'inclusion de config.php ajoutait des headers JSON

**Solution**: Ne pas inclure config.php dans index.php

## Prochaines étapes

### Tests à effectuer
- [ ] Test complet du flux d'inscription/connexion
- [ ] Test CRUD contacts via l'interface
- [ ] Test ajout/suppression d'enfants
- [ ] Test création de relations entre contacts
- [ ] Test gestion des groupes
- [ ] Test de la recherche de contacts
- [ ] Test de la visualisation en graphe

### Optimisations possibles
- [ ] Mise en cache des contacts localement
- [ ] Gestion du mode hors ligne
- [ ] Synchronisation différée
- [ ] Pagination pour les grandes listes
- [ ] Compression des photos avant upload
- [ ] Optimisation des requêtes API (batch requests)

### Sécurité à améliorer
- [ ] Refresh token pour prolonger la session
- [ ] Rate limiting sur l'API
- [ ] Validation plus stricte côté serveur
- [ ] HTTPS obligatoire
- [ ] Sanitisation des entrées utilisateur
- [ ] Protection CSRF

## Génération de l'APK

Pour générer un fichier APK de production:

```bash
cd android
.\gradlew assembleRelease
```

Le fichier APK sera disponible dans:
`android/app/build/outputs/apk/release/app-release.apk`

## Notes importantes

1. **Migration des données**: Les données stockées localement dans l'ancienne version ne seront pas automatiquement migrées vers le serveur. Les utilisateurs devront recréer leurs contacts.

2. **Connexion Internet**: L'application nécessite maintenant une connexion Internet pour fonctionner (sauf consultation du cache).

3. **Performances**: Les opérations peuvent être légèrement plus lentes en raison de la latence réseau, mais les données sont maintenant synchronisées entre appareils.

4. **Backup**: Les données sont maintenant sauvegardées sur le serveur MySQL, offrant une meilleure protection contre la perte de données.

## Support et débogage

### Logs serveur
Les erreurs API sont loguées dans `api/error.log` (si configuré dans config.php)

### Logs client
```javascript
// Dans la console du device
// Les erreurs API sont affichées avec console.error()
```

### Test de l'API
Utilisez le fichier `api/index.php` dans un navigateur pour vérifier:
- Connexion à la base de données
- Existence des tables
- État du serveur

### Endpoints de debug
- `api/test.php` - Affiche les données reçues (GET, POST, headers)
- Peut être supprimé en production

---

**Migration terminée le**: [Date actuelle]
**Version de l'application**: 1.0.0
**Version de l'API**: 1.0.0
