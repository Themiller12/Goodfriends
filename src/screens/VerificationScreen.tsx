import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AuthService from '../services/AuthService';

interface VerificationScreenProps {
  navigation: any;
  route: any;
}

const VerificationScreen: React.FC<VerificationScreenProps> = ({navigation, route}) => {
  const {verificationCode, email} = route.params;
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Afficher le code dans une alerte (simulation d'email)
    Alert.alert(
      'Code de vérification envoyé',
      `Un email a été envoyé à ${email}.\n\nPour cette démo, voici votre code : ${verificationCode}`,
      [{text: 'OK'}]
    );
  }, [email, verificationCode]);

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Erreur', 'Le code doit contenir 6 chiffres');
      return;
    }

    setLoading(true);
    try {
      const isValid = await AuthService.verifyCode(email, code);
      
      if (isValid) {
        Alert.alert(
          'Compte vérifié !',
          'Votre compte a été activé avec succès.',
          [
            {
              text: 'Se connecter',
              onPress: () => navigation.reset({
                index: 0,
                routes: [{name: 'Login'}],
              }),
            },
          ]
        );
      } else {
        Alert.alert('Erreur', 'Code de vérification invalide');
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      const newCode = await AuthService.resendVerificationCode(email);
      Alert.alert(
        'Code renvoyé',
        `Un nouveau code a été envoyé.\n\nPour cette démo, voici votre nouveau code : ${newCode}`
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Vérification de l'email</Text>
        <Text style={styles.subtitle}>
          Entrez le code à 6 chiffres envoyé à {email}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Code à 6 chiffres"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Vérifier</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendButton}
          onPress={handleResend}
          disabled={loading}>
          <Text style={styles.resendText}>Renvoyer le code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.reset({
            index: 0,
            routes: [{name: 'Login'}],
          })}>
          <Text style={styles.backText}>Retour à la connexion</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
    lineHeight: 22,
  },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    textAlign: 'center',
    letterSpacing: 8,
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    backgroundColor: '#B0BEC5',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resendButton: {
    padding: 15,
    alignItems: 'center',
    marginBottom: 20,
  },
  resendText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    padding: 15,
    alignItems: 'center',
  },
  backText: {
    color: '#666',
    fontSize: 14,
  },
});

export default VerificationScreen;
