import React, {useState, useEffect, useMemo} from 'react';
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
import DateTimePicker from '@react-native-community/datetimepicker';
import {launchImageLibrary} from 'react-native-image-picker';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import LoadingView from '../components/LoadingView';
import AuthService from '../services/AuthService';
import {stopNotificationsForUser} from '../services/PushSetup';
import {commitCredentials} from '../services/AutofillService';
import {PASSWORD_REQUIREMENTS, getPasswordError} from '../utils/passwordPolicy';
import StorageService from '../services/StorageService';
import {UserProfile} from '../types';
import {Neutral, Spacing, Radius, Shadow, Typography, Semantic} from '../theme/designSystem';

interface ProfileScreenProps {
  navigation: any;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const S = useMemo(() => createStyles(theme), [theme]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [bio, setBio] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      await loadProfileInner();
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadProfileInner = async () => {
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

  const closePasswordForm = () => {
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswords(false);
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Erreur', 'Veuillez saisir votre mot de passe actuel');
      return;
    }

    const passwordError = getPasswordError(newPassword);
    if (passwordError) {
      Alert.alert('Mot de passe trop faible', passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    setChangingPassword(true);
    try {
      await AuthService.changePassword(currentPassword, newPassword);
      commitCredentials();
      closePasswordForm();
      Alert.alert('Succès', 'Votre mot de passe a été modifié');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setChangingPassword(false);
    }
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
            await stopNotificationsForUser();
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
    <View style={{flex: 1}}>
      <ScrollView style={S.container} showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 88}}>
      {/* En-tête */}
      <ScreenHeader
        title="Mon profil"
        subtitle="Gérez vos informations personnelles"
        onBack={() => navigation.goBack()}
      />

      {/* Avatar */}
      <View style={S.avatarSection}>
        <TouchableOpacity style={S.avatarBtn} onPress={handleSelectPhoto} activeOpacity={0.85}>
          {photoUri ? (
            <Image source={{uri: photoUri}} style={S.avatarImg} />
          ) : (
            <View style={[S.avatarImg, S.avatarPlaceholder]}>
              <MaterialIcons name="person" size={44} color={theme.primary} />
            </View>
          )}
          <View style={[S.avatarEditBadge, {backgroundColor: theme.primary}]}>
            <MaterialIcons name="camera-alt" size={14} color="#FFF" />
          </View>
        </TouchableOpacity>
        <Text style={S.avatarHint}>Appuyez pour changer la photo</Text>
      </View>

      {/* Formulaire */}
      <View style={S.section}>
        <Text style={S.sectionLabel}>Identité</Text>
        <View style={S.card}>
          <Text style={S.label}>Prénom *</Text>
          <TextInput
            style={S.input}
            placeholder="Prénom"
            placeholderTextColor={Neutral[400]}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
          />
          <View style={S.divider} />
          <Text style={S.label}>Nom *</Text>
          <TextInput
            style={S.input}
            placeholder="Nom"
            placeholderTextColor={Neutral[400]}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />
        </View>

        <Text style={S.sectionLabel}>Coordonnées</Text>
        <View style={S.card}>
          <Text style={S.label}>Email *</Text>
          <TextInput
            style={S.input}
            placeholder="email@example.com"
            placeholderTextColor={Neutral[400]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <View style={S.divider} />
          <Text style={S.label}>Téléphone</Text>
          <TextInput
            style={S.input}
            placeholder="+33 6 12 34 56 78"
            placeholderTextColor={Neutral[400]}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <Text style={S.sectionLabel}>À propos</Text>
        <View style={S.card}>
          <Text style={S.label}>Date de naissance</Text>
          <TouchableOpacity style={S.dateBtn} onPress={() => setShowDatePicker(true)}>
            <MaterialIcons name="cake" size={18} color={Neutral[400]} style={S.dateIcon} />
            <Text style={[S.dateBtnText, !dateOfBirth && {color: Neutral[400]}]}>
              {dateOfBirth ? dateOfBirth.toLocaleDateString('fr-FR') : 'Sélectionner une date'}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={dateOfBirth || new Date()}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={new Date(1900, 0, 1)}
              maximumDate={new Date()}
            />
          )}
          <View style={S.divider} />
          <Text style={S.label}>Bio</Text>
          <TextInput
            style={[S.input, S.textArea]}
            placeholder="Parlez-nous de vous…"
            placeholderTextColor={Neutral[400]}
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[S.btn, loading && S.btnDisabled]}
          onPress={handleSave}
          activeOpacity={0.85}
          disabled={loading}>
          <Text style={S.btnText}>
            {loading ? 'Enregistrement…' : 'Enregistrer le profil'}
          </Text>
        </TouchableOpacity>

        <Text style={S.sectionLabel}>Sécurité</Text>
        <View style={S.card}>
          {showPasswordForm ? (
            <>
              <Text style={S.label}>Mot de passe actuel</Text>
              <TextInput
                style={S.input}
                placeholder="Mot de passe actuel"
                placeholderTextColor={Neutral[400]}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showPasswords}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                importantForAutofill="yes"
              />
              <View style={S.divider} />
              <Text style={S.label}>Nouveau mot de passe</Text>
              <TextInput
                style={S.input}
                placeholder="Nouveau mot de passe"
                placeholderTextColor={Neutral[400]}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPasswords}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                importantForAutofill="yes"
              />
              <Text style={S.hint}>{PASSWORD_REQUIREMENTS}</Text>
              <View style={S.divider} />
              <Text style={S.label}>Confirmer le mot de passe</Text>
              <TextInput
                style={S.input}
                placeholder="Confirmer"
                placeholderTextColor={Neutral[400]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPasswords}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <TouchableOpacity style={S.linkRow} onPress={() => setShowPasswords(v => !v)}>
                <MaterialIcons
                  name={showPasswords ? 'visibility-off' : 'visibility'}
                  size={18}
                  color={Neutral[500]}
                />
                <Text style={S.linkRowText}>
                  {showPasswords ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.btn, changingPassword && S.btnDisabled]}
                onPress={handleChangePassword}
                activeOpacity={0.85}
                disabled={changingPassword}>
                <Text style={S.btnText}>
                  {changingPassword ? 'Modification…' : 'Modifier le mot de passe'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.linkRow} onPress={closePasswordForm}>
                <Text style={S.linkRowText}>Annuler</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={S.linkRow} onPress={() => setShowPasswordForm(true)}>
              <MaterialIcons name="lock" size={18} color={theme.primary} />
              <Text style={[S.linkRowText, {color: theme.primary}]}>Modifier le mot de passe</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={S.btnDanger} onPress={handleLogout} activeOpacity={0.85}>
          <MaterialIcons name="logout" size={18} color={Semantic.error} style={{marginRight: 6}} />
          <Text style={S.btnDangerText}>Déconnexion</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
      {(loadingProfile || loading || changingPassword) && (
        <LoadingView
          overlay
          label={loadingProfile ? 'Chargement du profil…' : changingPassword ? 'Changement du mot de passe…' : 'Enregistrement…'}
        />
      )}
    </View>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    backgroundColor: '#fcf9f0',
    paddingHorizontal: Spacing.xl,
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
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
    ...Typography.title,
    color: '#383830',
    fontSize: 20,
  },
  headerSubtitle: {
    ...Typography.bodySm,
    color: '#65655c',
    marginTop: 2,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  avatarBtn: {
    position: 'relative',
  },
  avatarImg: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: Neutral[100],
    borderWidth: 3,
    borderColor: Neutral[0],
    ...Shadow.md,
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Neutral[0],
  },
  avatarHint: {
    ...Typography.bodySm,
    color: Neutral[500],
    marginTop: Spacing.sm,
  },
  section: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  sectionLabel: {
    ...Typography.label,
    color: Neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    ...Shadow.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Neutral[100],
    marginVertical: 4,
  },
  label: {
    ...Typography.label,
    color: Neutral[500],
    marginTop: Spacing.sm,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    ...Typography.body,
    color: Neutral[800],
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  dateIcon: {
    marginRight: Spacing.sm,
  },
  dateBtnText: {
    ...Typography.body,
    color: Neutral[800],
  },
  btn: {
    backgroundColor: theme.primary,
    borderRadius: Radius.md,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
    ...Shadow.sm,
  },
  btnText: {
    ...Typography.titleSm,
    color: '#FFF',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    backgroundColor: Neutral[300],
  },
  btnDanger: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
    borderWidth: 1.5,
    borderColor: Semantic.error,
  },
  btnDangerText: {
    ...Typography.titleSm,
    color: Semantic.error,
  },
  hint: {
    ...Typography.bodySm,
    color: Neutral[500],
    marginBottom: Spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  linkRowText: {
    ...Typography.body,
    color: Neutral[600],
    marginLeft: Spacing.xs,
  },
});

export default ProfileScreen;
