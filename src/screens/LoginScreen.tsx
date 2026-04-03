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

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const S = useMemo(() => createStyles(theme), [theme]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    try {
      await AuthService.login(email, password);
      navigation.reset({
        index: 0,
        routes: [{name: 'Home'}],
      });
    } catch (error: any) {
      if (error.message === 'UNVERIFIED') {
        Alert.alert(
          'Compte non vérifié',
          'Votre compte n\'est pas encore vérifié. Veuillez vérifier votre email.',
          [
            {
              text: 'Vérifier maintenant',
              onPress: async () => {
                try {
                  const account = await AuthService.getCurrentUser();
                  if (account) {
                    navigation.navigate('Verification', {
                      verificationCode: account.verificationCode,
                      email: account.email,
                    });
                  }
                } catch (err) {
                  Alert.alert('Erreur', 'Impossible de récupérer les informations du compte');
                }
              },
            },
            {text: 'Annuler', style: 'cancel'},
          ]
        );
      } else if (error.name === 'NetworkError') {
        Alert.alert(
          'Erreur réseau',
          error.message + '\n\nURL API : ' + 'http://volt-services.fr/DEV/goodfriends/api',
          [{text: 'OK'}]
        );
      } else {
        Alert.alert('Erreur de connexion', error.message || 'Une erreur est survenue');
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

        {/* Header coloré */}
        <View style={S.hero}>
          <Image
            source={require('../../good friends large.png')}
            style={S.logo}
            resizeMode="contain"
          />
        </View>

        {/* Carte formulaire */}
        <View style={S.card}>
          <Text style={S.cardTitle}>Connexion</Text>
          <Text style={S.cardSubtitle}>Content de vous revoir !</Text>

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
              placeholder="Votre mot de passe"
              placeholderTextColor={Neutral[400]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={S.eyeBtn}>
              <MaterialIcons
                name={showPassword ? 'visibility-off' : 'visibility'}
                size={20}
                color={Neutral[400]}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[S.btn, loading && S.btnDisabled]}
            onPress={handleLogin}
            activeOpacity={0.85}
            disabled={loading}>
            <Text style={S.btnText}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={S.linkBtn}
            onPress={() => navigation.navigate('Register')}>
            <Text style={S.linkText}>
              Pas encore de compte ?{' '}
              <Text style={S.linkTextBold}>Inscrivez-vous</Text>
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
    paddingTop: 64,
    paddingBottom: 40,
    paddingHorizontal: Spacing.xl,
  },
  logo: {
    width: 220,
    height: 70,
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
    paddingVertical: 14,
  },
  inputFlex: {
    flex: 1,
  },
  eyeBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
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

export default LoginScreen;
