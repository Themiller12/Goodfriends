import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTheme, THEMES} from '../context/ThemeContext';

const THEMES_ARRAY = Object.values(THEMES);

interface ThemeSettingsScreenProps {
  navigation: any;
}

const ThemeSettingsScreen: React.FC<ThemeSettingsScreenProps> = ({navigation}) => {
  const {theme: currentTheme, setTheme} = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<string>(currentTheme.id);
  const [defaultView, setDefaultView] = useState<'graph' | 'list'>('graph');

  useEffect(() => {
    setSelectedTheme(currentTheme.id);
  }, [currentTheme]);

  useEffect(() => {
    AsyncStorage.getItem('@default_view_mode').then(saved => {
      if (saved === 'graph' || saved === 'list') {
        setDefaultView(saved as 'graph' | 'list');
      }
    });
  }, []);

  const handleSelectDefaultView = async (view: 'graph' | 'list') => {
    try {
      await AsyncStorage.setItem('@default_view_mode', view);
      setDefaultView(view);
    } catch (error) {
      Alert.alert('Erreur', "Impossible de sauvegarder la préférence d'affichage");
    }
  };

  const handleSelectTheme = async (themeId: string) => {
    try {
      await setTheme(themeId);
      setSelectedTheme(themeId);
      Alert.alert(
        'Thème modifié',
        'Le thème a été changé avec succès.',
        [{text: 'OK'}]
      );
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder le thème');
    }
  };

  return (
    <ScrollView style={styles(currentTheme).container}>
      <View style={styles(currentTheme).header}>
        <View style={styles(currentTheme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(currentTheme).backButton}>
            <Text style={styles(currentTheme).backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles(currentTheme).title}>Choisir un thème</Text>
        </View>
        <Text style={styles(currentTheme).subtitle}>
          Personnalisez l'apparence de l'application
        </Text>
      </View>

      <View style={styles(currentTheme).themesContainer}>
        {THEMES_ARRAY.map((theme) => (
          <TouchableOpacity
            key={theme.id}
            style={[
              styles(currentTheme).themeCard,
              selectedTheme === theme.id && styles(currentTheme).themeCardSelected,
            ]}
            onPress={() => handleSelectTheme(theme.id)}>
            <View style={styles(currentTheme).themeHeader}>
              <Text style={styles(currentTheme).themeName}>{theme.name}</Text>
              {selectedTheme === theme.id && (
                <View style={styles(currentTheme).selectedBadge}>
                  <Text style={styles(currentTheme).selectedText}>✓</Text>
                </View>
              )}
            </View>
            
            <View style={styles(currentTheme).colorPreview}>
              <View style={[styles(currentTheme).colorBox, {backgroundColor: theme.primary}]}>
                <Text style={styles(currentTheme).colorLabel}>Principal</Text>
              </View>
              <View style={[styles(currentTheme).colorBox, {backgroundColor: theme.secondary}]}>
                <Text style={styles(currentTheme).colorLabel}>Secondaire</Text>
              </View>
              <View style={[styles(currentTheme).colorBox, {backgroundColor: theme.accent}]}>
                <Text style={styles(currentTheme).colorLabel}>Accent</Text>
              </View>
            </View>
            
            <View style={[styles(currentTheme).backgroundPreview, {backgroundColor: theme.background}]}>
              <Text style={styles(currentTheme).backgroundLabel}>Arrière-plan</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles(currentTheme).defaultViewSection}>
        <Text style={styles(currentTheme).sectionTitle}>Vue par défaut</Text>
        <Text style={styles(currentTheme).sectionSubtitle}>
          Choisir comment afficher vos contacts sur l'accueil
        </Text>
        <View style={styles(currentTheme).viewOptionsRow}>
          <TouchableOpacity
            style={[
              styles(currentTheme).viewOption,
              defaultView === 'graph' && styles(currentTheme).viewOptionSelected,
            ]}
            onPress={() => handleSelectDefaultView('graph')}>
            <Text style={styles(currentTheme).viewOptionIcon}>⊙</Text>
            <Text style={[
              styles(currentTheme).viewOptionLabel,
              defaultView === 'graph' && styles(currentTheme).viewOptionLabelSelected,
            ]}>Graphe</Text>
            {defaultView === 'graph' && (
              <View style={styles(currentTheme).viewOptionBadge}>
                <Text style={styles(currentTheme).viewOptionBadgeText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles(currentTheme).viewOption,
              defaultView === 'list' && styles(currentTheme).viewOptionSelected,
            ]}
            onPress={() => handleSelectDefaultView('list')}>
            <Text style={styles(currentTheme).viewOptionIcon}>☰</Text>
            <Text style={[
              styles(currentTheme).viewOptionLabel,
              defaultView === 'list' && styles(currentTheme).viewOptionLabelSelected,
            ]}>Liste</Text>
            {defaultView === 'list' && (
              <View style={styles(currentTheme).viewOptionBadge}>
                <Text style={styles(currentTheme).viewOptionBadgeText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
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
    padding: 20,
    paddingTop: 40,
    paddingBottom: 30,
    backgroundColor: theme.primary,
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#E3F2FD',
  },
  themesContainer: {
    padding: 15,
  },
  themeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeCardSelected: {
    borderColor: theme.primary,
    shadowColor: theme.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  themeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  themeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  selectedBadge: {
    backgroundColor: theme.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  colorPreview: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  colorBox: {
    flex: 1,
    height: 60,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  backgroundPreview: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  defaultViewSection: {
    margin: 15,
    marginTop: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 15,
  },
  viewOptionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  viewOption: {
    flex: 1,
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fafafa',
    position: 'relative',
  },
  viewOptionSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primary + '15',
  },
  viewOptionIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  viewOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  viewOptionLabelSelected: {
    color: theme.primary,
  },
  viewOptionBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: theme.primary,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewOptionBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default ThemeSettingsScreen;
