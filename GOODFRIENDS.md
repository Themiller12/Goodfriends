# Goodfriends

Application mobile React Native pour gérer vos contacts, relations familiales et réseau social personnel.

## Fonctionnalités

### Authentification
- Création de compte utilisateur
- Connexion avec email et mot de passe
- Gestion du profil utilisateur

### Profil Utilisateur
- Nom, prénom
- Email
- Numéro de téléphone
- Date de naissance
- Bio personnelle
- Photo de profil (à implémenter)
- **Gestion des notifications d'anniversaire**
- **Bouton de test des notifications**

### Gestion des Contacts
- Ajouter des contacts (famille, amis, collègues)
- Informations détaillées : nom, prénom, email, téléphone, date de naissance, notes
- Recherche de contacts par nom ou prénom
- Visualisation des contacts en graphe de bulles ou en liste
- **Notifications automatiques pour les anniversaires**

### Notifications
- **Rappels d'anniversaire la veille (9h)**
- **Rappels d'anniversaire le jour même (9h)**
- **Notifications pour les enfants des contacts**
- **Répétition annuelle automatique**
- **Activation/désactivation dans le profil**
- **Test immédiat des notifications**

### Connexion entre utilisateurs GoodFriends
- **Recherche d'utilisateurs par email ou téléphone**
- **Système de demandes d'amis**
- **Gestion des demandes dans le profil**
- **Création automatique bidirectionnelle de contacts**
- **Badge de notifications des demandes en attente**

### Groupes
- Créer des groupes de contacts (Famille, Amis, Travail, Autre)
- Organiser les contacts par groupes
- Description des groupes

### Relations Familiales
- Définir les relations entre contacts (conjoint, enfant, parent, etc.)
- Affichage synthétique des informations : âge, enfants, conjoint, notes

### Visualisation
- Page d'accueil avec graphe de bulles représentant les contacts
- Connexions visuelles entre les contacts
- Vue liste alternative

## Installation

### Prérequis
- Node.js (v18 ou supérieur)
- React Native CLI
- Pour Android : Android Studio et SDK
- Pour iOS : Xcode (macOS uniquement)

### Étapes d'installation

1. Installer les dépendances :
```bash
npm install
```

2. Pour iOS uniquement (macOS) :
```bash
cd ios && pod install && cd ..
```

3. Lancer l'application :

Pour Android :
```bash
npm run android
```

Pour iOS :
```bash
npm run ios
```

## Structure du Projet

```
src/
├── navigation/       # Configuration de la navigation
├── screens/          # Écrans de l'application
│   ├── LoginScreen.tsx
│   ├── RegisterScreen.tsx
│   ├── HomeScreen.tsx
│   ├── AddContactScreen.tsx
│   ├── ProfileScreen.tsx
│   └── GroupsScreen.tsx
├── services/         # Services (authentification, stockage, contacts)
│   ├── AuthService.ts
│   ├── StorageService.ts
│   ├── ContactService.ts
│   └── NotificationService.ts
├── types/           # Définitions TypeScript
│   └── index.ts
└── utils/           # Utilitaires
```

## Technologies Utilisées

- **React Native** - Framework mobile cross-platform
- **TypeScript** - Typage statique
- **React Navigation** - Navigation entre écrans
- **AsyncStorage** - Stockage local des données
- **React Native DateTimePicker** - Sélection de dates
- **React Native Picker** - Sélecteur de valeurs
- **React Native Push Notification** - Notifications locales programmées

## Documentation Complémentaire

- [NOTIFICATIONS_SETUP.md](NOTIFICATIONS_SETUP.md) - Guide d'installation des notifications
- [NOTIFICATIONS_FEATURES.md](NOTIFICATIONS_FEATURES.md) - Documentation complète du système de notifications
- [GOODFRIENDS_USERS_FEATURE.md](GOODFRIENDS_USERS_FEATURE.md) - Documentation du système de connexion entre utilisateurs
- [INSTALL_GOODFRIENDS_USERS.md](INSTALL_GOODFRIENDS_USERS.md) - Guide d'installation du système de connexion

## Améliorations Futures

- [ ] Upload et affichage de photos de profil
- [ ] Graphe de relations plus sophistiqué avec react-native-svg
- [ ] Export/Import des données
- [ ] Synchronisation cloud
- [ ] Notifications pour les anniversaires
- [ ] Partage de contacts entre utilisateurs
- [ ] Mode sombre
- [ ] Support multilingue

## Licence

MIT
