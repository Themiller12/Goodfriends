# Guide de démarrage - Goodfriends

## ✅ Application créée avec succès!

L'application Goodfriends est maintenant prête à être lancée.

## 🚀 Lancement de l'application

### Pour Android:
1. Assurez-vous qu'un émulateur Android est lancé ou qu'un appareil est connecté
2. Exécutez:
```bash
npm run android
```

### Pour iOS (macOS uniquement):
1. Installez d'abord les pods:
```bash
cd ios && pod install && cd ..
```
2. Lancez l'application:
```bash
npm run ios
```

## 📱 Utilisation de l'application

### Première utilisation:
1. **Créer un compte**: Cliquez sur "Pas encore de compte ? Inscrivez-vous"
2. Remplissez vos informations (nom, prénom, email, mot de passe)
3. Vous serez automatiquement connecté

### Fonctionnalités principales:

#### 👤 Profil utilisateur
- Accédez à votre profil via le bouton "Profil" en haut à droite
- Ajoutez vos informations personnelles
- Créez et gérez vos groupes de contacts

#### ➕ Ajouter des contacts
- Cliquez sur le bouton "+" en bas à droite de l'écran d'accueil
- Remplissez les informations du contact
- Ajoutez-le à un groupe si vous le souhaitez

#### 🔍 Rechercher des contacts
- Utilisez la barre de recherche sur l'écran d'accueil
- Recherchez par nom ou prénom

#### 📊 Visualisation
- **Mode Graphe**: Visualisez vos contacts sous forme de bulles
- **Mode Liste**: Affichez vos contacts dans une liste classique
- Cliquez sur un contact pour voir ses informations synthétisées

#### 👨‍👩‍👧‍👦 Groupes
- Créez des groupes (Famille, Amis, Travail, Autre)
- Organisez vos contacts par groupes
- Gérez vos groupes depuis votre profil

## 🛠️ Développement

### Structure des fichiers:
```
src/
├── navigation/          # Configuration de la navigation
│   └── AppNavigator.tsx
├── screens/            # Écrans de l'application
│   ├── LoginScreen.tsx
│   ├── RegisterScreen.tsx
│   ├── HomeScreen.tsx
│   ├── AddContactScreen.tsx
│   ├── ContactDetailScreen.tsx
│   ├── ProfileScreen.tsx
│   └── GroupsScreen.tsx
├── services/           # Logique métier
│   ├── AuthService.ts
│   ├── StorageService.ts
│   └── ContactService.ts
└── types/             # Types TypeScript
    └── index.ts
```

### Données stockées localement:
- Compte utilisateur
- Profil utilisateur
- Contacts
- Groupes

Toutes les données sont stockées avec AsyncStorage et persistent entre les sessions.

## 🔧 Dépendances installées:
- `@react-navigation/native` - Navigation
- `@react-navigation/native-stack` - Stack navigation
- `react-native-screens` - Optimisation des écrans
- `react-native-safe-area-context` - Gestion des zones sûres
- `@react-native-async-storage/async-storage` - Stockage local
- `@react-native-community/datetimepicker` - Sélecteur de dates
- `@react-native-picker/picker` - Sélecteur de valeurs

## 📝 Prochaines améliorations possibles:

1. **Photos de profil et contacts**
   - Utiliser `react-native-image-picker`
   - Stocker les images en base64 ou dans le système de fichiers

2. **Graphe de relations amélioré**
   - Utiliser `react-native-svg` et `d3` pour des visualisations plus riches
   - Afficher les liens entre contacts

3. **Relations familiales avancées**
   - Créer un écran dédié pour gérer les relations
   - Permettre d'ajouter des relations directement depuis le détail d'un contact

4. **Export/Import de données**
   - Exporter en JSON
   - Importer des contacts depuis le carnet d'adresses du téléphone

5. **Notifications**
   - Rappels pour les anniversaires
   - Utiliser `react-native-push-notification`

6. **Synchronisation cloud**
   - Firebase ou autre backend
   - Synchronisation multi-appareils

## 🐛 Debugging

Si l'application ne se lance pas:
1. Vérifiez que Metro est en cours d'exécution
2. Nettoyez le cache: `npx react-native start --reset-cache`
3. Pour Android: `cd android && ./gradlew clean && cd ..`
4. Pour iOS: `cd ios && pod install && cd ..`

## 📚 Ressources

- [Documentation React Native](https://reactnative.dev/)
- [React Navigation](https://reactnavigation.org/)
- [AsyncStorage](https://react-native-async-storage.github.io/async-storage/)

---

Bonne utilisation de Goodfriends! 🎉
