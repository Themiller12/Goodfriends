import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import AuthService from '../services/AuthService';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography} from '../theme/designSystem';

interface RegisterScreenProps {
  navigation: any;
}

const RegisterScreen: React.FC<RegisterScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const S = useMemo(() => createStyles(theme), [theme]);

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);
    try {
      const account = await AuthService.register(email, password, firstName, lastName);
      
      // Naviguer vers l'écran de vérification
      navigation.navigate('Verification', {
        email: account.email,
      });
    } catch (error: any) {
      if (error.name === 'NetworkError') {
        Alert.alert(
          'Erreur réseau',
          error.message + '\n\nURL API : ' + 'http://volt-services.fr/DEV/goodfriends/api',
          [{text: 'OK'}]
        );
      } else {
        Alert.alert('Erreur d\'inscription', error.message || 'Une erreur est survenue');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={S.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={S.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        <View style={S.hero}>
          <Image
            source={require('../../good friends large.png')}
            style={S.logo}
            resizeMode="contain"
          />
        </View>

        <View style={S.card}>
          <Text style={S.cardTitle}>Créer un compte</Text>
          <Text style={S.cardSubtitle}>Rejoignez la communauté GoodFriends</Text>

          <View style={S.row}>
            <View style={S.halfField}>
              <Text style={S.label}>Prénom</Text>
              <View style={S.inputWrapper}>
                <TextInput
                  style={S.input}
                  placeholder="Prénom"
                  placeholderTextColor={Neutral[400]}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
            </View>
            <View style={[S.halfField, S.halfRight]}>
              <Text style={S.label}>Nom</Text>
              <View style={S.inputWrapper}>
                <TextInput
                  style={S.input}
                  placeholder="Nom"
                  placeholderTextColor={Neutral[400]}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>

          <Text style={S.label}>Adresse e-mail</Text>
          <View style={S.inputWrapper}>
            <MaterialIcons name="email" size={20} color={Neutral[400]} style={S.inputIcon} />
            <TextInput
              style={S.input}
              placeholder="exemple@email.com"
              placeholderTextColor={Neutral[400]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Text style={S.label}>Mot de passe</Text>
          <View style={S.inputWrapper}>
            <MaterialIcons name="lock" size={20} color={Neutral[400]} style={S.inputIcon} />
            <TextInput
              style={[S.input, S.inputFlex]}
              placeholder="Min. 6 caractères"
              placeholderTextColor={Neutral[400]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={S.eyeBtn}>
              <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={20} color={Neutral[400]} />
            </TouchableOpacity>
          </View>

          <Text style={S.label}>Confirmer le mot de passe</Text>
          <View style={S.inputWrapper}>
            <MaterialIcons name="lock-outline" size={20} color={Neutral[400]} style={S.inputIcon} />
            <TextInput
              style={[S.input, S.inputFlex]}
              placeholder="Confirmer"
              placeholderTextColor={Neutral[400]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={S.eyeBtn}>
              <MaterialIcons name={showConfirm ? 'visibility-off' : 'visibility'} size={20} color={Neutral[400]} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[S.btn, loading && S.btnDisabled]}
            onPress={handleRegister}
            activeOpacity={0.85}
            disabled={loading}>
            <Text style={S.btnText}>
              {loading ? 'Création…' : 'Créer mon compte'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={S.linkBtn} onPress={() => navigation.goBack()}>
            <Text style={S.linkText}>
              Déjà un compte ?{' '}
              <Text style={S.linkTextBold}>Se connecter</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.primary,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  hero: {
    backgroundColor: theme.primary,
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 32,
    paddingHorizontal: Spacing.xl,
  },
  logo: {
    width: 200,
    height: 64,
  },
  card: {
    backgroundColor: Neutral[50],
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxxl,
  },
  cardTitle: {
    ...Typography.title,
    color: Neutral[900],
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    ...Typography.body,
    color: Neutral[500],
    marginBottom: Spacing.xl,
  },
  row: {
    flexDirection: 'row',
  },
  halfField: {
    flex: 1,
  },
  halfRight: {
    marginLeft: Spacing.sm,
  },
  label: {
    ...Typography.label,
    color: Neutral[600],
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Neutral[0],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Neutral[200],
    marginBottom: Spacing.base,
  },
  inputIcon: {
    paddingLeft: Spacing.base,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Neutral[800],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 13,
  },
  inputFlex: {
    flex: 1,
  },
  eyeBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: 13,
  },
  btn: {
    backgroundColor: theme.primary,
    borderRadius: Radius.md,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
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
  linkBtn: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  linkText: {
    ...Typography.bodyMd,
    color: Neutral[600],
  },
  linkTextBold: {
    color: theme.primary,
    fontWeight: '600',
  },
});

export default RegisterScreen;
