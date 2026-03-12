import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import {launchImageLibrary} from 'react-native-image-picker';
import {useTheme} from '../context/ThemeContext';
import AuthService from '../services/AuthService';
import StorageService from '../services/StorageService';
import {UserProfile} from '../types';

interface ProfileScreenProps {
  navigation: any;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [bio, setBio] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const account = await AuthService.getCurrentUser();
    if (account && account.profile) {
      setProfile(account.profile);
      setFirstName(account.profile.firstName);
      setLastName(account.profile.lastName);
      setEmail(account.profile.email);
      setPhone(account.profile.phone || '');
      setDateOfBirth(
        account.profile.dateOfBirth
          ? new Date(account.profile.dateOfBirth)
          : undefined,
      );
      setBio(account.profile.bio || '');
      setPhotoUri(account.profile.photo);
    }
  };

  const handleSave = async () => {
    if (!firstName || !lastName || !email) {
      Alert.alert('Erreur', 'Le prénom, le nom et l\'email sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      const updatedProfile: UserProfile = {
        id: profile?.id || '',
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        bio,
        photo: photoUri,
        createdAt: profile?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      // Enregistrer via l'API
      await AuthService.updateProfile(updatedProfile);
      
      // Aussi enregistrer localement pour compatibilité
      await StorageService.updateUserProfile(updatedProfile);
      
      Alert.alert('Succès', 'Profil mis à jour avec succès');
      setProfile(updatedProfile);
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPhoto = async () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 800,
        maxHeight: 800,
        includeBase64: true,
      },
      async (response) => {
        if (response.didCancel) {
          return;
        }
        if (response.errorCode) {
          Alert.alert('Erreur', 'Impossible de charger la photo');
          return;
        }
        if (response.assets && response.assets[0]) {
          // Utiliser la version base64 si disponible
          if (response.assets[0].base64) {
            const base64Image = `data:${response.assets[0].type};base64,${response.assets[0].base64}`;
            setPhotoUri(base64Image);
          } else {
            // Fallback sur l'URI locale pour l'affichage
            setPhotoUri(response.assets[0].uri);
          }
        }
      },
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Déconnexion',
          style: 'destructive',
          onPress: async () => {
            await AuthService.logout();
            navigation.replace('Login');
          },
        },
      ],
    );
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateOfBirth(selectedDate);
    }
  };

  return (
    <ScrollView style={styles(theme).container}>
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <Text style={styles(theme).backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles(theme).headerTitle}>Mon profil</Text>
        </View>
        <Text style={styles(theme).headerSubtitle}>Gérez vos informations personnelles</Text>
      </View>
      <View style={styles(theme).content}>
        <Text style={styles(theme).label}>Prénom *</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="Prénom"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />

        <Text style={styles(theme).label}>Nom *</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="Nom"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />

        <Text style={styles(theme).label}>Email *</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles(theme).label}>Téléphone</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="+33 6 12 34 56 78"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles(theme).label}>Date de naissance</Text>
        <TouchableOpacity
          style={styles(theme).dateButton}
          onPress={() => setShowDatePicker(true)}>
          <Text style={styles(theme).dateButtonText}>
            {dateOfBirth
              ? dateOfBirth.toLocaleDateString('fr-FR')
              : 'Sélectionner une date'}
          </Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={dateOfBirth || new Date()}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        <Text style={styles(theme).label}>Bio</Text>
        <TextInput
          style={[styles(theme).input, styles(theme).textArea]}
          placeholder="Parlez-nous de vous..."
          value={bio}
          onChangeText={setBio}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Text style={styles(theme).label}>Photo de profil</Text>
        <TouchableOpacity
          style={styles(theme).photoButton}
          onPress={handleSelectPhoto}>
          {photoUri ? (
            <Image source={{uri: photoUri}} style={styles(theme).photoPreview} />
          ) : (
            <Text style={styles(theme).photoButtonText}>📷 Ajouter une photo</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles(theme).button, styles(theme).saveButton, loading && styles(theme).buttonDisabled]}
          onPress={handleSave}
          disabled={loading}>
          <Text style={styles(theme).saveButtonText}>
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles(theme).button, styles(theme).logoutButton]}
          onPress={handleLogout}>
          <Text style={styles(theme).logoutButtonText}>Déconnexion</Text>
        </TouchableOpacity>
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
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    paddingTop: 15,
  },
  dateButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  bioSection: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    marginTop: 20,
    marginBottom: 10,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  button: {
    backgroundColor: theme.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  saveButton: {
    backgroundColor: theme.primary,
    marginTop: 30,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  logoutButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  photoButton: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    minHeight: 120,
  },
  photoButtonText: {
    color: '#666',
    fontSize: 16,
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
});

export default ProfileScreen;
