import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View, ViewStyle, StyleProp} from 'react-native';
import {useTheme} from '../context/ThemeContext';

interface LoadingViewProps {
  label?: string;
  // Plein écran translucide par-dessus le contenu (pour une action en cours : enregistrement, envoi…)
  overlay?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Indicateur affiché pendant l'attente d'une réponse du serveur
const LoadingView: React.FC<LoadingViewProps> = ({label, overlay = false, style}) => {
  const {theme} = useTheme();

  return (
    <View
      style={[overlay ? styles.overlay : styles.container, style]}
      pointerEvents={overlay ? 'auto' : 'none'}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Chargement'}>
      <View style={overlay ? styles.card : undefined}>
        <ActivityIndicator size="large" color={theme.primary} />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(252,249,240,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 28,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
  },
  label: {
    marginTop: 10,
    fontSize: 14,
    color: '#65655c',
    textAlign: 'center',
  },
});

export default LoadingView;
