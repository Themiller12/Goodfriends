import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';

interface SettingsScreenProps {
  navigation: any;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const menuItems = [
    {
      id: 'profile',
      title: 'Mon profil',
      icon: '👤',
      subtitle: 'Gérer mes informations personnelles',
      onPress: () => navigation.navigate('Profile'),
    },
    {
      id: 'friends',
      title: 'Mes amis GoodFriends',
      icon: '👥',
      subtitle: 'Gérer mes connexions et demandes',
      onPress: () => navigation.navigate('MyFriends'),
    },
    {
      id: 'groups',
      title: 'Mes groupes',
      icon: '📁',
      subtitle: 'Organiser mes contacts en groupes',
      onPress: () => navigation.navigate('MyGroups'),
    },
    {
      id: 'theme',
      title: 'Affichage',
      icon: '🎨',
      subtitle: 'Personnaliser le thème et la vue par défaut',
      onPress: () => navigation.navigate('ThemeSettings'),
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: '🔔',
      subtitle: 'Gérer les alertes et rappels',
      onPress: () => navigation.navigate('NotificationSettings'),
    },
    {
      id: 'privacy',
      title: 'Confidentialité',
      icon: '🔒',
      subtitle: 'Paramètres de confidentialité',
      onPress: () => navigation.navigate('PrivacySettings'),
    },
  ];

  return (
    <ScrollView style={styles(theme).container}>
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <Text style={styles(theme).backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles(theme).headerTitle}>Paramètres</Text>
        </View>
        <Text style={styles(theme).headerSubtitle}>
          Personnalisez votre expérience GoodFriends
        </Text>
      </View>

      <View style={styles(theme).menuContainer}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles(theme).menuItem}
            onPress={item.onPress}>
            <View style={styles(theme).iconContainer}>
              <Text style={styles(theme).icon}>{item.icon}</Text>
            </View>
            <View style={styles(theme).textContainer}>
              <Text style={styles(theme).menuTitle}>{item.title}</Text>
              <Text style={styles(theme).menuSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={styles(theme).chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles(theme).versionText}>Version 1.3</Text>
    </ScrollView>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  versionText: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 13,
    marginTop: 24,
    marginBottom: 32,
  },
  header: {
    backgroundColor: theme.primary,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 30,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  backButton: {
    marginRight: 15,
    padding: 5,
  },
  backButtonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E3F2FD',
  },
  menuContainer: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginHorizontal: 15,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  icon: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3,
  },
  menuSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  chevron: {
    fontSize: 24,
    color: '#ccc',
    marginLeft: 10,
  },
});

export default SettingsScreen;
