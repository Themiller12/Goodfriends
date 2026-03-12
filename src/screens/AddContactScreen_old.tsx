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
  Modal,
  PermissionsAndroid,
  FlatList,
  Image,
} from 'react-native';
import Contacts from 'react-native-contacts';
import {launchImageLibrary} from 'react-native-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import ContactService from '../services/ContactService';
import StorageService from '../services/StorageService';
import {ContactGroup, GroupType} from '../types';

interface AddContactScreenProps {
  navigation: any;
}

const AddContactScreen: React.FC<AddContactScreenProps> = ({navigation}) => {
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
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>(GroupType.OTHER);
  const [showContactPickerModal, setShowContactPickerModal] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<any[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [showGroupPickerModal, setShowGroupPickerModal] = useState(false);
  const [showGroupTypePickerModal, setShowGroupTypePickerModal] = useState(false);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    const loadedGroups = await StorageService.getGroups();
    setGroups(loadedGroups);
  };

  const handleQuickCreateGroup = async () => {
    if (!newGroupName) {
      Alert.alert('Erreur', 'Le nom du groupe est obligatoire');
      return;
    }

    try {
      const newGroup = await ContactService.createGroup({
        name: newGroupName,
        type: newGroupType,
      });
      
      setShowGroupModal(false);
      setNewGroupName('');
      setNewGroupType(GroupType.OTHER);
      
      await loadGroups();
      setSelectedGroupId(newGroup.id);
      
      Alert.alert('Succès', 'Groupe créé avec succès');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };

  const handleSave = async () => {
    if (!firstName || !lastName) {
      Alert.alert('Erreur', 'Le prénom et le nom sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      const contact = await ContactService.createContact({
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        notes,
        photo: photoUri,
        groupIds: selectedGroupId ? [selectedGroupId] : [],
      });

      Alert.alert('Succès', 'Contact créé avec succès', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndAddRelations = async () => {
    if (!firstName || !lastName) {
      Alert.alert('Erreur', 'Le prénom et le nom sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      const contact = await ContactService.createContact({
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        notes,
        photo: photoUri,
        groupIds: selectedGroupId ? [selectedGroupId] : [],
      });

      navigation.replace('ManageRelations', {contactId: contact.id});
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
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
          Alert.alert('Erreur', 'Impossible de charger la photo');
          return;
        }
        if (response.assets && response.assets[0]) {
          setPhotoUri(response.assets[0].uri);
        }
      },
    );
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateOfBirth(selectedDate);
    }
  };

  const requestContactsPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: 'Permission d\'accès aux contacts',
            message: 'Goodfriends a besoin d\'accéder à vos contacts pour les importer',
            buttonPositive: 'Autoriser',
            buttonNegative: 'Refuser',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const handleImportContact = async () => {
    const hasPermission = await requestContactsPermission();
    
    if (!hasPermission) {
      Alert.alert('Permission refusée', 'Impossible d\'accéder aux contacts du téléphone');
      return;
    }

    try {
      const contacts = await Contacts.getAll();
      setPhoneContacts(contacts);
      setShowContactPickerModal(true);
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Erreur', 'Impossible de charger les contacts');
    }
  };

  const handleSelectPhoneContact = (contact: any) => {
    setFirstName(contact.givenName || '');
    setLastName(contact.familyName || '');
    
    if (contact.emailAddresses && contact.emailAddresses.length > 0) {
      setEmail(contact.emailAddresses[0].email || '');
    }
    
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      setPhone(contact.phoneNumbers[0].number || '');
    }
    
    if (contact.birthday) {
      const birthDate = new Date(contact.birthday.year, contact.birthday.month - 1, contact.birthday.day);
      setDateOfBirth(birthDate);
    }
    
    setShowContactPickerModal(false);
    setContactSearchQuery('');
    Alert.alert('Succès', 'Contact importé, vous pouvez modifier les informations avant de l\'enregistrer');
  };

  const filteredPhoneContacts = phoneContacts.filter(contact => {
    const searchLower = contactSearchQuery.toLowerCase();
    const fullName = `${contact.givenName || ''} ${contact.familyName || ''}`.toLowerCase();
    return fullName.includes(searchLower);
  });

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Nouveau contact</Text>
          <TouchableOpacity
            style={styles.importButton}
            onPress={handleImportContact}>
            <Text style={styles.importButtonText}>📱 Importer</Text>
          </TouchableOpacity>
        </View>

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

        <View style={styles.groupRow}>
          <View style={styles.groupLabelContainer}>
            <Text style={styles.label}>Groupe</Text>
            <TouchableOpacity
              style={styles.addGroupButton}
              onPress={() => setShowGroupModal(true)}>
              <Text style={styles.addGroupButtonText}>+ Nouveau</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={styles.groupSelector}
          onPress={() => setShowGroupPickerModal(true)}>
          <Text style={styles.groupSelectorText}>
            {selectedGroupId
              ? groups.find(g => g.id === selectedGroupId)?.name || 'Aucun groupe'
              : 'Aucun groupe'}
          </Text>
          <Text style={styles.groupSelectorIcon}>▼</Text>
        </TouchableOpacity>

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
        <TouchableOpacity
          style={styles.photoButton}
          onPress={handleSelectPhoto}>
          {photoUri ? (
            <Image source={{uri: photoUri}} style={styles.photoPreview} />
          ) : (
            <Text style={styles.photoButtonText}>📷 Ajouter une photo</Text>
          )}
        </TouchableOpacity>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => navigation.goBack()}>
            <Text style={styles.cancelButtonText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.saveButton, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}>
            <Text style={styles.saveButtonText}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.relationsButton, loading && styles.buttonDisabled]}
          onPress={handleSaveAndAddRelations}
          disabled={loading}>
          <Text style={styles.relationsButtonText}>
            {loading ? 'Enregistrement...' : '👨‍👩‍👧‍👦 Ajouter enfants ou relations'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={showGroupModal}
        onRequestClose={() => setShowGroupModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nouveau groupe</Text>

            <Text style={styles.modalLabel}>Nom du groupe *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Famille, Amis, Collègues..."
              value={newGroupName}
              onChangeText={setNewGroupName}
            />

            <Text style={styles.modalLabel}>Type</Text>
            <TouchableOpacity
              style={styles.groupSelector}
              onPress={() => setShowGroupTypePickerModal(true)}>
              <Text style={styles.groupSelectorText}>
                {newGroupType === GroupType.FAMILY ? 'Famille' :
                 newGroupType === GroupType.FRIENDS ? 'Amis' :
                 newGroupType === GroupType.WORK ? 'Travail' : 'Autre'}
              </Text>
              <Text style={styles.groupSelectorIcon}>▼</Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowGroupModal(false)}>
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={handleQuickCreateGroup}>
                <Text style={styles.modalSaveButtonText}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Importer Contact */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showContactPickerModal}
        onRequestClose={() => setShowContactPickerModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sélectionner un contact</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Rechercher..."
              value={contactSearchQuery}
              onChangeText={setContactSearchQuery}
            />

            <FlatList
              data={filteredPhoneContacts}
              keyExtractor={(item) => item.recordID}
              style={styles.contactList}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles.contactItem}
                  onPress={() => handleSelectPhoneContact(item)}>
                  <Text style={styles.contactName}>
                    {item.givenName || ''} {item.familyName || ''}
                  </Text>
                  {item.phoneNumbers && item.phoneNumbers.length > 0 && (
                    <Text style={styles.contactPhone}>
                      {item.phoneNumbers[0].number}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>Aucun contact trouvé</Text>
              }
            />

            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => {
                setShowContactPickerModal(false);
                setContactSearchQuery('');
              }}>
              <Text style={styles.modalCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Sélectionner Groupe */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showGroupPickerModal}
        onRequestClose={() => setShowGroupPickerModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Sélectionner un groupe</Text>

            <TouchableOpacity
              style={styles.groupPickerOption}
              onPress={() => {
                setSelectedGroupId('');
                setShowGroupPickerModal(false);
              }}>
              <Text style={styles.groupPickerOptionText}>Aucun groupe</Text>
            </TouchableOpacity>

            <ScrollView style={styles.groupPickerList}>
              {groups.map((group) => (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.groupPickerOption,
                    selectedGroupId === group.id && styles.groupPickerOptionSelected
                  ]}
                  onPress={() => {
                    setSelectedGroupId(group.id);
                    setShowGroupPickerModal(false);
                  }}>
                  <Text style={[
                    styles.groupPickerOptionText,
                    selectedGroupId === group.id && styles.groupPickerOptionTextSelected
                  ]}>
                    {group.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => setShowGroupPickerModal(false)}>
              <Text style={styles.modalCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Sélectionner Type de Groupe */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showGroupTypePickerModal}
        onRequestClose={() => setShowGroupTypePickerModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Type de groupe</Text>

            <TouchableOpacity
              style={[
                styles.groupPickerOption,
                newGroupType === GroupType.FAMILY && styles.groupPickerOptionSelected
              ]}
              onPress={() => {
                setNewGroupType(GroupType.FAMILY);
                setShowGroupTypePickerModal(false);
              }}>
              <Text style={[
                styles.groupPickerOptionText,
                newGroupType === GroupType.FAMILY && styles.groupPickerOptionTextSelected
              ]}>Famille</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.groupPickerOption,
                newGroupType === GroupType.FRIENDS && styles.groupPickerOptionSelected
              ]}
              onPress={() => {
                setNewGroupType(GroupType.FRIENDS);
                setShowGroupTypePickerModal(false);
              }}>
              <Text style={[
                styles.groupPickerOptionText,
                newGroupType === GroupType.FRIENDS && styles.groupPickerOptionTextSelected
              ]}>Amis</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.groupPickerOption,
                newGroupType === GroupType.WORK && styles.groupPickerOptionSelected
              ]}
              onPress={() => {
                setNewGroupType(GroupType.WORK);
                setShowGroupTypePickerModal(false);
              }}>
              <Text style={[
                styles.groupPickerOptionText,
                newGroupType === GroupType.WORK && styles.groupPickerOptionTextSelected
              ]}>Travail</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.groupPickerOption,
                newGroupType === GroupType.OTHER && styles.groupPickerOptionSelected
              ]}
              onPress={() => {
                setNewGroupType(GroupType.OTHER);
                setShowGroupTypePickerModal(false);
              }}>
              <Text style={[
                styles.groupPickerOptionText,
                newGroupType === GroupType.OTHER && styles.groupPickerOptionTextSelected
              ]}>Autre</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.modalCancelButton]}
              onPress={() => setShowGroupTypePickerModal(false)}>
              <Text style={styles.modalCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  importButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 30,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  groupRow: {
    marginTop: 10,
  },
  groupLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  addGroupButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addGroupButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
  },
  modalPickerContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    overflow: 'hidden',
  },
  modalPicker: {
    height: 50,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#f5f5f5',
  },
  modalCancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalSaveButton: {
    backgroundColor: '#4CAF50',
  },
  modalSaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactList: {
    maxHeight: 400,
    marginVertical: 10,
  },
  contactItem: {
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 10,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  contactPhone: {
    fontSize: 14,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
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
  relationsButton: {
    backgroundColor: '#FF9800',
    marginTop: 10,
  },
  relationsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  groupSelector: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupSelectorText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  groupSelectorIcon: {
    fontSize: 12,
    color: '#666',
  },
  groupPickerList: {
    maxHeight: 300,
  },
  groupPickerOption: {
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 10,
  },
  groupPickerOptionSelected: {
    backgroundColor: '#2196F3',
  },
  groupPickerOptionText: {
    fontSize: 16,
    color: '#333',
  },
  groupPickerOptionTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default AddContactScreen;
