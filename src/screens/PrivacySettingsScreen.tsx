import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiClient from '../services/ApiClient';
import API_CONFIG from '../config/api';

const STORAGE_KEY = '@privacy_settings';

interface PrivacySettings {
  isProfilePublic: boolean;
  showOnlineStatus: boolean;
  allowSearchByEmail: boolean;
  allowSearchByPhone: boolean;
}

const DEFAULT_SETTINGS: PrivacySettings = {
  isProfilePublic: true,
  showOnlineStatus: true,
  allowSearchByEmail: true,
  allowSearchByPhone: true,
};

interface PrivacySettingsScreenProps {
  navigation: any;
}

const PrivacySettingsScreen: React.FC<PrivacySettingsScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = useCallback(async () => {
    // 1. Afficher immédiatement ce qui est en cache local
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEY);
      if (cached) {
        setSettings({...DEFAULT_SETTINGS, ...JSON.parse(cached)});
      }
    } catch {}

    // 2. Synchroniser depuis l'API en arrière-plan
    setSyncing(true);
    try {
      const res: any = await ApiClient.get(API_CONFIG.ENDPOINTS.PRIVACY);
      if (res?.success && res.data) {
        const remote: PrivacySettings = {
          isProfilePublic:    res.data.isProfilePublic    ?? true,
          showOnlineStatus:   res.data.showOnlineStatus   ?? true,
          allowSearchByEmail: res.data.allowSearchByEmail ?? true,
          allowSearchByPhone: res.data.allowSearchByPhone ?? true,
        };
        setSettings(remote);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
      }
    } catch {
      // Mode hors-ligne — on garde le cache local
    } finally {
      setSyncing(false);
    }
  }, []);

  const saveSettings = useCallback(async (newSettings: PrivacySettings) => {
    // Mise à jour optimiste
    setSettings(newSettings);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));

    setSaving(true);
    try {
      await ApiClient.put(API_CONFIG.ENDPOINTS.PRIVACY, newSettings);
    } catch {
      Alert.alert(
        'Hors ligne',
        'Les préférences ont été sauvegardées localement et seront synchronisées à la prochaine connexion.',
      );
    } finally {
      setSaving(false);
    }
  }, []);

  const toggle = useCallback(
    async (key: keyof PrivacySettings, value: boolean) => {
      const updated = {...settings, [key]: value};
      await saveSettings(updated);

      if (key === 'isProfilePublic') {
        Alert.alert(
          value ? 'Profil Public' : 'Profil Privé',
          value
            ? 'Votre profil est désormais visible par tous les utilisateurs.'
            : 'Seuls vos amis peuvent voir votre profil.',
        );
      }
    },
    [settings, saveSettings],
  );

  return (
    <ScrollView style={styles(theme).container}>
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <View style={styles(theme).backBtnCircle}>
              <MaterialIcons name="arrow-back" size={22} color="#383830" />
            </View>
          </TouchableOpacity>
          <View style={{flex: 1}}>
            <Text style={styles(theme).headerTitle}>Confidentialité</Text>
            <Text style={styles(theme).headerSubtitle}>Contrôlez qui peut voir vos informations</Text>
          </View>
          {(syncing || saving) && (
            <ActivityIndicator size="small" color={theme.primary} style={{marginLeft: 8}} />
          )}
        </View>
      </View>

      {/* ── Visibilité du profil ── */}
      <View style={styles(theme).section}>
        <Text style={styles(theme).sectionTitle}>Visibilité du profil</Text>
        <Text style={styles(theme).sectionDescription}>
          Contrôlez qui peut voir vos informations
        </Text>

        <View style={styles(theme).settingRow}>
          <View style={styles(theme).settingInfo}>
            <Text style={styles(theme).settingTitle}>Profil Public</Text>
            <Text style={styles(theme).settingDescription}>
              {settings.isProfilePublic
                ? 'Votre profil est visible par tous'
                : 'Seuls vos amis peuvent voir votre profil'}
            </Text>
          </View>
          <Switch
            value={settings.isProfilePublic}
            onValueChange={v => toggle('isProfilePublic', v)}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={settings.isProfilePublic ? theme.primary : '#f4f3f4'}
          />
        </View>
      </View>

      {/* ── Recherche ── */}
      <View style={styles(theme).section}>
        <Text style={styles(theme).sectionTitle}>Recherche</Text>
        <Text style={styles(theme).sectionDescription}>
          Définissez comment les autres peuvent vous trouver
        </Text>

        <View style={styles(theme).settingRow}>
          <View style={styles(theme).settingInfo}>
            <Text style={styles(theme).settingTitle}>Recherche par email</Text>
            <Text style={styles(theme).settingDescription}>
              {settings.allowSearchByEmail
                ? 'Les autres peuvent vous trouver par email'
                : 'Vous n\'apparaissez pas dans les recherches par email'}
            </Text>
          </View>
          <Switch
            value={settings.allowSearchByEmail}
            onValueChange={v => toggle('allowSearchByEmail', v)}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={settings.allowSearchByEmail ? theme.primary : '#f4f3f4'}
          />
        </View>

        <View style={styles(theme).settingRow}>
          <View style={styles(theme).settingInfo}>
            <Text style={styles(theme).settingTitle}>Recherche par téléphone</Text>
            <Text style={styles(theme).settingDescription}>
              {settings.allowSearchByPhone
                ? 'Les autres peuvent vous trouver par numéro'
                : 'Vous n\'apparaissez pas dans les recherches par téléphone'}
            </Text>
          </View>
          <Switch
            value={settings.allowSearchByPhone}
            onValueChange={v => toggle('allowSearchByPhone', v)}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={settings.allowSearchByPhone ? theme.primary : '#f4f3f4'}
          />
        </View>
      </View>

      {/* ── Activité ── */}
      <View style={styles(theme).section}>
        <Text style={styles(theme).sectionTitle}>Activité</Text>

        <View style={styles(theme).settingRow}>
          <View style={styles(theme).settingInfo}>
            <Text style={styles(theme).settingTitle}>Afficher mon statut en ligne</Text>
            <Text style={styles(theme).settingDescription}>
              {settings.showOnlineStatus
                ? 'Les autres peuvent voir quand vous êtes actif'
                : 'Votre statut en ligne est masqué'}
            </Text>
          </View>
          <Switch
            value={settings.showOnlineStatus}
            onValueChange={v => toggle('showOnlineStatus', v)}
            trackColor={{false: '#767577', true: '#81b0ff'}}
            thumbColor={settings.showOnlineStatus ? theme.primary : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles(theme).infoBox}>
        <Text style={styles(theme).infoIcon}>ℹ️</Text>
        <Text style={styles(theme).infoText}>
          Ces paramètres sont synchronisés avec le serveur et pris en compte
          immédiatement lors des recherches d'autres utilisateurs.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f0',
  },
  header: {
    backgroundColor: '#fcf9f0',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 0,
  },
  backBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#383830',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#65655c',
    marginTop: 2,
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
