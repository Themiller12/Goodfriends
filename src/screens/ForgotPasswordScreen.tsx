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
import {commitCredentials} from '../services/AutofillService';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography} from '../theme/designSystem';
import {PASSWORD_REQUIREMENTS, getPasswordError} from '../utils/passwordPolicy';

interface ForgotPasswordScreenProps {
  navigation: any;
  route: any;
}

const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({navigation, route}) => {
  const {theme} = useTheme();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState<string>(route.params?.email || '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const S = useMemo(() => createStyles(theme), [theme]);

  const showError = (title: string, error: any) => {
    if (error.name === 'NetworkError') {
      Alert.alert('Erreur réseau', error.message);
    } else {
      Alert.alert(title, error.message || 'Une erreur est survenue');
    }
  };

  const sendCode = async () => {
    if (!email.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir votre adresse e-mail');
      return;
    }

    setLoading(true);
    try {
      await AuthService.requestPasswordReset(email.trim());
      setStep('reset');
      Alert.alert(
        'Code envoyé',
        `Si un compte existe pour ${email.trim()}, un code à 6 chiffres vient d'être envoyé. Pensez à vérifier vos spams.`,
      );
    } catch (error: any) {
      showError('Erreur', error);
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    if (code.trim().length !== 6) {
      Alert.alert('Erreur', 'Le code doit contenir 6 chiffres');
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

    setLoading(true);
    try {
      await AuthService.resetPassword(email.trim(), code.trim(), newPassword);
      commitCredentials();
      Alert.alert('Mot de passe modifié', 'Vous pouvez maintenant vous connecter.', [
        {
          text: 'Se connecter',
          onPress: () => navigation.reset({index: 0, routes: [{name: 'Login'}]}),
        },
      ]);
    } catch (error: any) {
      showError('Erreur', error);
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
          <Text style={S.cardTitle}>Mot de passe oublié</Text>
          <Text style={S.cardSubtitle}>
            {step === 'email'
              ? 'Saisissez votre e-mail pour recevoir un code de réinitialisation.'
              : `Entrez le code reçu par e-mail et choisissez un nouveau mot de passe.`}
          </Text>

          <Text style={S.label}>Adresse e-mail</Text>
          <View style={[S.inputWrapper, step === 'reset' && S.inputDisabled]}>
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
              autoComplete="username"
              textContentType="username"
              importantForAutofill="yes"
              editable={step === 'email'}
            />
          </View>

          {step === 'reset' && (
            <>
              <Text style={S.label}>Code reçu par e-mail</Text>
              <View style={S.inputWrapper}>
                <MaterialIcons name="pin" size={20} color={Neutral[400]} style={S.inputIcon} />
                <TextInput
                  style={S.input}
                  placeholder="Code à 6 chiffres"
                  placeholderTextColor={Neutral[400]}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <Text style={S.label}>Nouveau mot de passe</Text>
              <View style={S.inputWrapper}>
                <MaterialIcons name="lock" size={20} color={Neutral[400]} style={S.inputIcon} />
                <TextInput
                  style={S.input}
                  placeholder="Nouveau mot de passe"
                  placeholderTextColor={Neutral[400]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                  importantForAutofill="yes"
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={S.eyeBtn}>
                  <MaterialIcons
                    name={showPassword ? 'visibility-off' : 'visibility'}
                    size={20}
                    color={Neutral[400]}
                  />
                </TouchableOpacity>
              </View>
              <Text style={S.hint}>{PASSWORD_REQUIREMENTS}</Text>

              <Text style={S.label}>Confirmer le mot de passe</Text>
              <View style={S.inputWrapper}>
                <MaterialIcons name="lock-outline" size={20} color={Neutral[400]} style={S.inputIcon} />
                <TextInput
                  style={S.input}
                  placeholder="Confirmer"
                  placeholderTextColor={Neutral[400]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
              </View>
            </>
          )}

          <TouchableOpacity
            style={[S.btn, loading && S.btnDisabled]}
            onPress={step === 'email' ? sendCode : submitReset}
            activeOpacity={0.85}
            disabled={loading}>
            <Text style={S.btnText}>
              {loading
                ? 'Veuillez patienter…'
                : step === 'email'
                ? 'Envoyer le code'
                : 'Modifier le mot de passe'}
            </Text>
          </TouchableOpacity>

          {step === 'reset' && (
            <TouchableOpacity style={S.linkBtn} onPress={sendCode} disabled={loading}>
              <Text style={S.linkTextBold}>Renvoyer le code</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={S.linkBtn} onPress={() => navigation.goBack()}>
            <Text style={S.linkText}>
              <Text style={S.linkTextBold}>Retour à la connexion</Text>
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
  inputDisabled: {
    backgroundColor: Neutral[100],
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
  eyeBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
  },
  hint: {
    ...Typography.body,
    color: Neutral[500],
    marginTop: -Spacing.sm,
    marginBottom: Spacing.base,
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

export default ForgotPasswordScreen;
