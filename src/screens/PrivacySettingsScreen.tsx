import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PrivacySettingsScreenProps {
  navigation: any;
}

const PrivacySettingsScreen: React.FC<PrivacySettingsScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [isProfilePublic, setIsProfilePublic] = useState(true);
  const [showOnlineStatus, setShowOnlineStatus] = useState(true);
  const [allowSearchByEmail, setAllowSearchByEmail] = useState(true);
  const [allowSearchByPhone, setAllowSearchByPhone] = useState(true);

  useEffect(() => {
    loadPrivacySettings();
  }, []);

  const loadPrivacySettings = async () => {
    try {
      const settings = await AsyncStorage.getItem('@privacy_settings');
      if (settings) {
        const parsed = JSON.parse(settings);
        setIsProfilePublic(parsed.isProfilePublic ?? true);
        setShowOnlineStatus(parsed.showOnlineStatus ?? true);
        setAllowSearchByEmail(parsed.allowSearchByEmail ?? true);
        setAllowSearchByPhone(parsed.allowSearchByPhone ?? true);
      }
    } catch (error) {
      console.error('Error loading privacy settings:', error);
    }
  };

  const savePrivacySettings = async (newSettings: any) => {
    try {
      await AsyncStorage.setItem('@privacy_settings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Error saving privacy settings:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres');
    }
  };

  const handleToggleProfileVisibility = async (value: boolean) => {
    setIsProfilePublic(value);
    const settings = {
      isProfilePublic: value,
      showOnlineStatus,
      allowSearchByEmail,
      allowSearchByPhone,
    };
    await savePrivacySettings(settings);
    
    Alert.alert(
      'Profil ' + (value ? 'Public' : 'Privé'),
      value
        ? 'Votre profil est visible par tous les utilisateurs de GoodFriends'
        : 'Seuls vos amis peuvent voir votre profil'
    );
  };

  const handleToggleOnlineStatus = async (value: boolean) => {
    setShowOnlineStatus(value);
    const settings = {
      isProfilePublic,
      showOnlineStatus: value,
      allowSearchByEmail,
      allowSearchByPhone,
    };
    await savePrivacySettings(settings);
  };

  const handleToggleSearchByEmail = async (value: boolean) => {
    setAllowSearchByEmail(value);
    const settings = {
      isProfilePublic,
      showOnlineStatus,
      allowSearchByEmail: value,
      allowSearchByPhone,
    };
    await savePrivacySettings(settings);
  };

  const handleToggleSearchByPhone = async (value: boolean) => {
    setAllowSearchByPhone(value);
    const settings = {
      isProfilePublic,
      showOnlineStatus,
      allowSearchByEmail,
      allowSearchByPhone: value,
    };
    await savePrivacySettings(settings);
  };

  return (
    <ScrollView style={styles(theme).container}>
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <Text style={styles(theme).backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles(theme).headerTitle}>Confidentialité</Text>
        </View>
        <Text style={styles(theme).headerSubtitle}>
          Contrôlez qui peut voir vos informations
        </Text>
      </View>

      <View style={styles(theme).section}>
        <Text style={styles(theme).sectionTitle}>Visibilité du profil</Text>
        <Text style={styles(theme).sectionDescription}>
          Contrôlez qui peut voir vos informations
        </Text>
        
        <View style={styles(theme).settingRow}>
          <View style={styles(theme).settingInfo}>
            <Text style={styles(theme).settingTitle}>Profil Public</Text>
            <Text style={styles(theme).settingDescription}>
              {isProfilePublic
                ? 'Votre profil est visible par tous'
                : 'Seuls vos amis peuvent voir votre profil'}
            </Text>
          </View>
          <Switch
            value={isProfilePublic}
            onValueChange={handleToggleProfileVisibility}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={isProfilePublic ? theme.primary : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles(theme).section}>
        <Text style={styles(theme).sectionTitle}>Recherche</Text>
        <Text style={styles(theme).sectionDescription}>
          Définissez comment les autres peuvent vous trouver
        </Text>
        
        <View style={styles(theme).settingRow}>
          <View style={styles(theme).settingInfo}>
            <Text style={styles(theme).settingTitle}>Recherche par email</Text>
            <Text style={styles(theme).settingDescription}>
              Les autres utilisateurs peuvent vous trouver avec votre adresse email
            </Text>
          </View>
          <Switch
            value={allowSearchByEmail}
            onValueChange={handleToggleSearchByEmail}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={allowSearchByEmail ? theme.primary : '#f4f3f4'}
          />
        </View>

        <View style={styles(theme).settingRow}>
          <View style={styles(theme).settingInfo}>
            <Text style={styles(theme).settingTitle}>Recherche par téléphone</Text>
            <Text style={styles(theme).settingDescription}>
              Les autres utilisateurs peuvent vous trouver avec votre numéro de téléphone
            </Text>
          </View>
          <Switch
            value={allowSearchByPhone}
            onValueChange={handleToggleSearchByPhone}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={allowSearchByPhone ? theme.primary : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles(theme).section}>
        <Text style={styles(theme).sectionTitle}>Activité</Text>
        
        <View style={styles(theme).settingRow}>
          <View style={styles(theme).settingInfo}>
            <Text style={styles(theme).settingTitle}>Afficher mon statut en ligne</Text>
            <Text style={styles(theme).settingDescription}>
              Les autres peuvent voir quand vous êtes actif
            </Text>
          </View>
          <Switch
            value={showOnlineStatus}
            onValueChange={handleToggleOnlineStatus}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={showOnlineStatus ? theme.primary : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles(theme).infoBox}>
        <Text style={styles(theme).infoIcon}>ℹ️</Text>
        <Text style={styles(theme).infoText}>
          Ces paramètres vous aident à contrôler votre confidentialité sur GoodFriends.
          Vous pouvez les modifier à tout moment.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  section: {
    backgroundColor: '#fff',
    marginTop: 15,
    marginHorizontal: 15,
    borderRadius: 10,
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 15,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    margin: 15,
    padding: 15,
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
});

export default PrivacySettingsScreen;
