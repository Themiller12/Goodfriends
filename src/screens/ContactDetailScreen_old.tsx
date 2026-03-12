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
import {launchImageLibrary} from 'react-native-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Picker} from '@react-native-picker/picker';
import {Contact, ContactGroup, RelationType} from '../types';
import ContactService from '../services/ContactService';
import StorageService from '../services/StorageService';

interface ContactDetailScreenProps {
  navigation: any;
  route: any;
}

const ContactDetailScreen: React.FC<ContactDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const {contactId} = route.params;
  const [contact, setContact] = useState<Contact | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [relationships, setRelationships] = useState<Contact[]>([]);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    loadContact();
    loadGroups();
    
    // Recharger le contact quand l'écran redevient actif
    const unsubscribe = navigation.addListener('focus', () => {
      loadContact();
    });
    
    return unsubscribe;
  }, [navigation]);

  const loadContact = async () => {
    const contacts = await StorageService.getContacts();
    const foundContact = contacts.find(c => c.id === contactId);
    
    if (foundContact) {
      // S'assurer que children est initialisé
      if (!foundContact.children) {
        foundContact.children = [];
      }
      setContact(foundContact);
      setFirstName(foundContact.firstName);
      setLastName(foundContact.lastName);
      setEmail(foundContact.email || '');
      setPhone(foundContact.phone || '');
      setDateOfBirth(
        foundContact.dateOfBirth ? new Date(foundContact.dateOfBirth) : undefined,
      );
      setNotes(foundContact.notes || '');
      setSelectedGroupId(foundContact.groupIds[0] || '');
      setPhotoUri(foundContact.photo);
      
      // Charger les relations
      const relatedContacts = await ContactService.getContactRelationships(contactId);
      setRelationships(relatedContacts);
    }
  };

  const loadGroups = async () => {
    const loadedGroups = await StorageService.getGroups();
    setGroups(loadedGroups);
  };

  const handleSave = async () => {
    if (!firstName || !lastName) {
      Alert.alert('Erreur', 'Le prénom et le nom sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      const updatedContact: Contact = {
        ...contact!,
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        age: dateOfBirth ? ContactService.calculateAge(dateOfBirth) : undefined,
        notes,
        photo: photoUri,
        groupIds: selectedGroupId ? [selectedGroupId] : [],
        updatedAt: new Date(),
      };

      await StorageService.updateContact(updatedContact);
      Alert.alert('Succès', 'Contact mis à jour avec succès', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Supprimer le contact',
      `Êtes-vous sûr de vouloir supprimer ${firstName} ${lastName} ?`,
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteContact(contactId);
            Alert.alert('Succès', 'Contact supprimé', [
              {text: 'OK', onPress: () => navigation.goBack()},
            ]);
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

  const handleSelectPhoto = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 800,
        maxHeight: 800,
      },
      (response) => {
        if (response.didCancel) {
          return;
        }
        if (response.errorCode) {
          Alert.alert('Erreur', response.errorMessage || 'Erreur lors de la sélection de l\'image');
          return;
        }
        if (response.assets && response.assets[0]) {
          setPhotoUri(response.assets[0].uri);
        }
      },
    );
  };

  const getRelationLabel = (relationType: RelationType): string => {
    switch (relationType) {
      case RelationType.SPOUSE:
        return 'Conjoint(e)';
      case RelationType.CHILD:
        return 'Enfant';
      case RelationType.PARENT:
        return 'Parent';
      case RelationType.SIBLING:
        return 'Frère/Sœur';
      case RelationType.FRIEND:
        return 'Ami(e)';
      case RelationType.COLLEAGUE:
        return 'Collègue';
      default:
        return 'Autre';
    }
  };

  if (!contact) {
    return (
      <View style={styles.container}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {photoUri && (
        <View style={styles.photoHeader}>
          <Image 
            source={{uri: photoUri}} 
            style={styles.photoHeaderImage}
            resizeMode="cover"
          />
          <View style={styles.photoHeaderOverlay}>
            <Text style={styles.photoHeaderName}>
              {firstName} {lastName}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.content}>
        <Text style={styles.title}>{photoUri ? 'Informations' : 'Modifier le contact'}</Text>

        <Text style={styles.label}>Prénom *</Text>
        <TextInput
          style={styles.input}
          placeholder="Prénom"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Nom *</Text>
        <TextInput
          style={styles.input}
          placeholder="Nom"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Téléphone</Text>
        <TextInput
          style={styles.input}
          placeholder="+33 6 12 34 56 78"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Date de naissance</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateButtonText}>
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

        <Text style={styles.label}>Groupe</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedGroupId}
            onValueChange={(itemValue) => setSelectedGroupId(itemValue)}
            style={styles.picker}
            dropdownIconColor="#666">
            <Picker.Item label="Aucun groupe" value="" color="#666" />
            {groups.map((group) => (
              <Picker.Item key={group.id} label={group.name} value={group.id} color="#333" />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Notes sur cette personne..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Photo</Text>
        <TouchableOpacity style={styles.photoButton} onPress={handleSelectPhoto}>
          {photoUri ? (
            <Image source={{uri: photoUri}} style={styles.photoPreview} />
          ) : (
            <Text style={styles.photoButtonText}>📷 Ajouter une photo</Text>
          )}
        </TouchableOpacity>

        {relationships.length > 0 && (
          <View style={styles.relationshipsSection}>
            <Text style={styles.sectionTitle}>Relations</Text>
            {relationships.map((relatedContact) => {
              const relationship = contact.relationships.find(
                r => r.contactId === relatedContact.id,
              );
              if (!relationship) return null;
              return (
                <View key={relatedContact.id} style={styles.relationshipItem}>
                  <Text style={styles.relationshipText}>
                    {getRelationLabel(relationship.relationType)} :{' '}
                    {relatedContact.firstName} {relatedContact.lastName}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.saveButton, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}>
            <Text style={styles.saveButtonText}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.relationsButton]}
            onPress={() => navigation.navigate('ManageRelations', {contactId})}>
            <Text style={styles.relationsButtonText}>
              Gérer enfants et relations
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.deleteButton]}
            onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: '#333',
  },
  relationshipsSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  relationshipItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  relationshipText: {
    fontSize: 16,
    color: '#666',
  },
  buttonContainer: {
    gap: 10,
    marginTop: 30,
    marginBottom: 20,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#2196F3',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  relationsButton: {
    backgroundColor: '#9C27B0',
  },
  relationsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  photoButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  photoHeader: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  photoHeaderImage: {
    width: '100%',
    height: '100%',
  },
  photoHeaderOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 15,
  },
  photoHeaderName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  photoButtonText: {
    fontSize: 16,
    color: '#666',
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
});

export default ContactDetailScreen;
