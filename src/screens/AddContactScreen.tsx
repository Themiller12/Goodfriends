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
import {useTheme} from '../context/ThemeContext';
import ContactService from '../services/ContactService';
import StorageService from '../services/StorageService';
import NotificationService from '../services/NotificationService';
import {ContactGroup, GroupType, Contact, Child, RelationType} from '../types';

interface AddContactScreenProps {
  navigation: any;
}

const AddContactScreen: React.FC<AddContactScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  // Champs de base
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [profession, setProfession] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  
  // Groupes
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<GroupType>(GroupType.OTHER);
  const [showGroupPickerModal, setShowGroupPickerModal] = useState(false);
  const [showGroupTypePickerModal, setShowGroupTypePickerModal] = useState(false);
  
  // Enfants
  const [children, setChildren] = useState<Child[]>([]);
  const [showChildModal, setShowChildModal] = useState(false);
  const [childFirstName, setChildFirstName] = useState('');
  const [childDateOfBirth, setChildDateOfBirth] = useState<Date | undefined>(undefined);
  const [showChildDatePicker, setShowChildDatePicker] = useState(false);
  const [childNotes, setChildNotes] = useState('');
  
  // Relations
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [relationships, setRelationships] = useState<Array<{contactId: string; relationType: RelationType; notes?: string}>>([]);
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [relationType, setRelationType] = useState<RelationType>(RelationType.FRIEND);
  const [relationNotes, setRelationNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [showRelationTypePickerModal, setShowRelationTypePickerModal] = useState(false);
  
  // Import contact
  const [showContactPickerModal, setShowContactPickerModal] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<any[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadGroups();
    loadAllContacts();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = allContacts.filter(
        c =>
          c.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.lastName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts(allContacts);
    }
  }, [searchQuery, allContacts]);

  const loadGroups = async () => {
    const loadedGroups = await StorageService.getGroups();
    setGroups(loadedGroups);
  };

  const loadAllContacts = async () => {
    const contacts = await StorageService.getContacts();
    setAllContacts(contacts);
    setFilteredContacts(contacts);
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

  const handleAddChild = () => {
    if (!childFirstName) {
      Alert.alert('Erreur', 'Le prénom de l\'enfant est obligatoire');
      return;
    }

    const newChild: Child = {
      id: `temp-${Date.now()}`,
      firstName: childFirstName,
      dateOfBirth: childDateOfBirth,
      notes: childNotes,
    };

    setChildren([...children, newChild]);
    setShowChildModal(false);
    setChildFirstName('');
    setChildDateOfBirth(undefined);
    setChildNotes('');
  };

  const handleDeleteChild = (childId: string) => {
    setChildren(children.filter(c => c.id !== childId));
  };

  const handleAddRelation = () => {
    if (!selectedContactId) {
      Alert.alert('Erreur', 'Veuillez sélectionner un contact');
      return;
    }

    const existingRelation = relationships.find(r => r.contactId === selectedContactId);
    if (existingRelation) {
      Alert.alert('Erreur', 'Une relation existe déjà avec ce contact');
      return;
    }

    setRelationships([
      ...relationships,
      {
        contactId: selectedContactId,
        relationType,
        notes: relationNotes,
      },
    ]);

    setShowRelationModal(false);
    setSelectedContactId('');
    setRelationType(RelationType.FRIEND);
    setRelationNotes('');
    setSearchQuery('');
  };

  const handleDeleteRelation = (contactId: string) => {
    setRelationships(relationships.filter(r => r.contactId !== contactId));
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
        profession,
        notes,
        photo: photoUri,
        groupIds: selectedGroupId ? [selectedGroupId] : [],
      });

      // Ajouter les enfants
      for (const child of children) {
        await ContactService.addChild(contact.id, {
          firstName: child.firstName,
          dateOfBirth: child.dateOfBirth,
          notes: child.notes,
        });
      }

      // Ajouter les relations
      for (const relation of relationships) {
        await ContactService.addRelationship(
          contact.id,
          relation.contactId,
          relation.relationType,
          relation.notes,
        );
      }

      Alert.alert('Succès', 'Contact créé avec succès', [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
      
      // Planifier les notifications d'anniversaire pour le nouveau contact
      const allContacts = await StorageService.getContacts();
      const newContact = allContacts.find(c => c.id === contact.id);
      if (newContact) {
        await NotificationService.scheduleBirthdayNotificationsForContact(newContact);
      }
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

  const onChildDateChange = (event: any, selectedDate?: Date) => {
    setShowChildDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setChildDateOfBirth(selectedDate);
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

  const filteredPhoneContacts = phoneContacts.filter(contact => {
    const searchLower = contactSearchQuery.toLowerCase();
    const fullName = `${contact.givenName || ''} ${contact.familyName || ''}`.toLowerCase();
    return fullName.includes(searchLower);
  });

  return (
    <ScrollView style={styles(theme).container}>
      <View style={styles(theme).content}>
        <View style={styles(theme).header}>
          <View style={styles(theme).headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
              <Text style={styles(theme).backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles(theme).title}>Nouveau contact</Text>
          </View>
          <View style={styles(theme).headerButtons}>
            <TouchableOpacity
              style={styles(theme).importButton}
              onPress={handleImportContact}>
              <Text style={styles(theme).importButtonText}>📱 Importer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles(theme).importButton, styles(theme).goodFriendsButton]}
              onPress={() => navigation.navigate('SearchUsers')}>
              <Text style={styles(theme).importButtonText}>👥 GoodFriends</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Prénom */}
        <Text style={styles(theme).label}>Prénom *</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="Prénom"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />

        {/* Nom */}
        <Text style={styles(theme).label}>Nom *</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="Nom"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />

        {/* Date de naissance */}
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

        {/* Section Enfants */}
        <View style={styles(theme).section}>
          <View style={styles(theme).sectionHeader}>
            <Text style={styles(theme).sectionTitle}>Enfants</Text>
            <TouchableOpacity
              style={styles(theme).addButton}
              onPress={() => setShowChildModal(true)}>
              <Text style={styles(theme).addButtonText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>

          {children.length === 0 ? (
            <Text style={styles(theme).emptyText}>Aucun enfant ajouté</Text>
          ) : (
            <>
              {children.map((child) => {
                let ageText = null;
                if (child.dateOfBirth) {
                  const birthDate = new Date(child.dateOfBirth);
                  const today = new Date();
                  
                  let years = today.getFullYear() - birthDate.getFullYear();
                  let months = today.getMonth() - birthDate.getMonth();
                  
                  if (months < 0) {
                    years--;
                    months += 12;
                  }
                  
                  if (years > 0) {
                    ageText = `${years} an${years > 1 ? 's' : ''}`;
                    if (months > 0) {
                      ageText += ` et ${months} mois`;
                    }
                  } else if (months > 0) {
                    ageText = `${months} mois`;
                  } else {
                    ageText = 'Nouveau-né';
                  }
                }
                
                return (
                  <View key={child.id} style={styles(theme).item}>
                    <View style={styles(theme).itemContent}>
                      <Text style={styles(theme).itemName}>{child.firstName}</Text>
                      {ageText && <Text style={styles(theme).itemDetail}>{ageText}</Text>}
                      {child.dateOfBirth && (
                        <Text style={styles(theme).itemDetail}>
                          Né(e) le {new Date(child.dateOfBirth).toLocaleDateString('fr-FR')}
                        </Text>
                      )}
                      {child.notes && (
                        <Text style={styles(theme).itemNotes}>{child.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles(theme).deleteButton}
                      onPress={() => handleDeleteChild(child.id)}>
                      <Text style={styles(theme).deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Section Relations */}
        <View style={styles(theme).section}>
          <View style={styles(theme).sectionHeader}>
            <Text style={styles(theme).sectionTitle}>Relations</Text>
            <TouchableOpacity
              style={styles(theme).addButton}
              onPress={() => setShowRelationModal(true)}>
              <Text style={styles(theme).addButtonText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>

          {relationships.length === 0 ? (
            <Text style={styles(theme).emptyText}>Aucune relation ajoutée</Text>
          ) : (
            <>
              {relationships.map((relation) => {
                const relatedContact = allContacts.find(c => c.id === relation.contactId);
                if (!relatedContact) return null;
                return (
                  <View key={relation.contactId} style={styles(theme).item}>
                    <View style={styles(theme).itemContent}>
                      <Text style={styles(theme).itemType}>
                        {getRelationLabel(relation.relationType)}
                      </Text>
                      <Text style={styles(theme).itemName}>
                        {relatedContact.firstName} {relatedContact.lastName}
                      </Text>
                      {relation.notes && (
                        <Text style={styles(theme).itemNotes}>{relation.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles(theme).deleteButton}
                      onPress={() => handleDeleteRelation(relation.contactId)}>
                      <Text style={styles(theme).deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Profession */}
        <Text style={styles(theme).label}>Profession</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="Profession"
          value={profession}
          onChangeText={setProfession}
        />

        {/* Groupe */}
        <View style={styles(theme).groupRow}>
          <View style={styles(theme).groupLabelContainer}>
            <Text style={styles(theme).label}>Groupe</Text>
            <TouchableOpacity
              style={styles(theme).addGroupButton}
              onPress={() => setShowGroupModal(true)}>
              <Text style={styles(theme).addGroupButtonText}>+ Nouveau</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={styles(theme).groupSelector}
          onPress={() => setShowGroupPickerModal(true)}>
          <Text style={styles(theme).groupSelectorText}>
            {selectedGroupId
              ? groups.find(g => g.id === selectedGroupId)?.name || 'Aucun groupe'
              : 'Aucun groupe'}
          </Text>
          <Text style={styles(theme).groupSelectorIcon}>▼</Text>
        </TouchableOpacity>

        {/* Notes */}
        <Text style={styles(theme).label}>Notes</Text>
        <TextInput
          style={[styles(theme).input, styles(theme).textArea]}
          placeholder="Notes sur cette personne..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Téléphone */}
        <Text style={styles(theme).label}>Téléphone</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="+33 6 12 34 56 78"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        {/* Email */}
        <Text style={styles(theme).label}>Email</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Photo */}
        <Text style={styles(theme).label}>Photo</Text>
        <TouchableOpacity
          style={styles(theme).photoButton}
          onPress={handleSelectPhoto}>
          {photoUri ? (
            <Image source={{uri: photoUri}} style={styles(theme).photoPreview} />
          ) : (
            <Text style={styles(theme).photoButtonText}>📷 Ajouter une photo</Text>
          )}
        </TouchableOpacity>

        {/* Boutons */}
        <View style={styles(theme).buttonContainer}>
          <TouchableOpacity
            style={[styles(theme).button, styles(theme).cancelButton]}
            onPress={() => navigation.goBack()}>
            <Text style={styles(theme).cancelButtonText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles(theme).button, styles(theme).saveButton, loading && styles(theme).buttonDisabled]}
            onPress={handleSave}
            disabled={loading}>
            <Text style={styles(theme).saveButtonText}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal Ajouter un enfant */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showChildModal}
        onRequestClose={() => setShowChildModal(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <Text style={styles(theme).modalTitle}>Ajouter un enfant</Text>

            <Text style={styles(theme).modalLabel}>Prénom *</Text>
            <TextInput
              style={styles(theme).modalInput}
              placeholder="Prénom de l'enfant"
              value={childFirstName}
              onChangeText={setChildFirstName}
              autoCapitalize="words"
            />

            <Text style={styles(theme).modalLabel}>Date de naissance</Text>
            <TouchableOpacity
              style={styles(theme).dateButton}
              onPress={() => setShowChildDatePicker(true)}>
              <Text style={styles(theme).dateButtonText}>
                {childDateOfBirth
                  ? childDateOfBirth.toLocaleDateString('fr-FR')
                  : 'Sélectionner une date'}
              </Text>
            </TouchableOpacity>

            {showChildDatePicker && (
              <DateTimePicker
                value={childDateOfBirth || new Date()}
                mode="date"
                display="default"
                onChange={onChildDateChange}
                maximumDate={new Date()}
              />
            )}

            <Text style={styles(theme).modalLabel}>Notes</Text>
            <TextInput
              style={[styles(theme).modalInput, styles(theme).textArea]}
              placeholder="Notes..."
              value={childNotes}
              onChangeText={setChildNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles(theme).modalButtons}>
              <TouchableOpacity
                style={[styles(theme).button, styles(theme).cancelButton]}
                onPress={() => {
                  setShowChildModal(false);
                  setChildFirstName('');
                  setChildDateOfBirth(undefined);
                  setChildNotes('');
                }}>
                <Text style={styles(theme).cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles(theme).button, styles(theme).saveButton]}
                onPress={handleAddChild}>
                <Text style={styles(theme).saveButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Ajouter une relation */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showRelationModal}
        onRequestClose={() => setShowRelationModal(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <Text style={styles(theme).modalTitle}>Ajouter une relation</Text>

            <Text style={styles(theme).modalLabel}>Rechercher un contact *</Text>
            <TextInput
              style={styles(theme).modalInput}
              placeholder="Nom ou prénom..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <View style={styles(theme).contactList}>
              <FlatList
                data={filteredContacts}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={[
                      styles(theme).contactItem,
                      selectedContactId === item.id && styles(theme).contactItemSelected,
                    ]}
                    onPress={() => setSelectedContactId(item.id)}>
                    <Text style={styles(theme).contactItemText}>
                      {item.firstName} {item.lastName}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles(theme).emptyText}>Aucun contact trouvé</Text>
                }
              />
            </View>

            <Text style={styles(theme).modalLabel}>Type de relation *</Text>
            <TouchableOpacity
              style={styles(theme).relationTypeSelector}
              onPress={() => setShowRelationTypePickerModal(true)}>
              <Text style={styles(theme).relationTypeSelectorText}>
                {getRelationLabel(relationType)}
              </Text>
              <Text style={styles(theme).relationTypeSelectorIcon}>▼</Text>
            </TouchableOpacity>

            <Text style={styles(theme).modalLabel}>Notes</Text>
            <TextInput
              style={[styles(theme).modalInput, styles(theme).textArea]}
              placeholder="Notes..."
              value={relationNotes}
              onChangeText={setRelationNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles(theme).modalButtons}>
              <TouchableOpacity
                style={[styles(theme).button, styles(theme).cancelButton]}
                onPress={() => {
                  setShowRelationModal(false);
                  setSelectedContactId('');
                  setRelationType(RelationType.FRIEND);
                  setRelationNotes('');
                  setSearchQuery('');
                }}>
                <Text style={styles(theme).cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles(theme).button, styles(theme).saveButton]}
                onPress={handleAddRelation}>
                <Text style={styles(theme).saveButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Nouveau groupe */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showGroupModal}
        onRequestClose={() => setShowGroupModal(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <Text style={styles(theme).modalTitle}>Nouveau groupe</Text>

            <Text style={styles(theme).modalLabel}>Nom du groupe *</Text>
            <TextInput
              style={styles(theme).modalInput}
              placeholder="Famille, Amis, Collègues..."
              value={newGroupName}
              onChangeText={setNewGroupName}
            />

            <Text style={styles(theme).modalLabel}>Type</Text>
            <TouchableOpacity
              style={styles(theme).groupSelector}
              onPress={() => setShowGroupTypePickerModal(true)}>
              <Text style={styles(theme).groupSelectorText}>
                {newGroupType === GroupType.FAMILY ? 'Famille' :
                 newGroupType === GroupType.FRIENDS ? 'Amis' :
                 newGroupType === GroupType.WORK ? 'Travail' : 'Autre'}
              </Text>
              <Text style={styles(theme).groupSelectorIcon}>▼</Text>
            </TouchableOpacity>

            <View style={styles(theme).modalButtons}>
              <TouchableOpacity
                style={[styles(theme).modalButton, styles(theme).modalCancelButton]}
                onPress={() => setShowGroupModal(false)}>
                <Text style={styles(theme).modalCancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles(theme).modalButton, styles(theme).modalSaveButton]}
                onPress={handleQuickCreateGroup}>
                <Text style={styles(theme).modalSaveButtonText}>Créer</Text>
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
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <Text style={styles(theme).modalTitle}>Sélectionner un contact</Text>

            <TextInput
              style={styles(theme).modalInput}
              placeholder="Rechercher..."
              value={contactSearchQuery}
              onChangeText={setContactSearchQuery}
            />

            <FlatList
              data={filteredPhoneContacts}
              keyExtractor={(item) => item.recordID}
              style={styles(theme).phoneContactList}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={styles(theme).phoneContactItem}
                  onPress={() => handleSelectPhoneContact(item)}>
                  <Text style={styles(theme).phoneContactName}>
                    {item.givenName || ''} {item.familyName || ''}
                  </Text>
                  {item.phoneNumbers && item.phoneNumbers.length > 0 && (
                    <Text style={styles(theme).phoneContactPhone}>
                      {item.phoneNumbers[0].number}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles(theme).emptyText}>Aucun contact trouvé</Text>
              }
            />

            <TouchableOpacity
              style={[styles(theme).modalButton, styles(theme).modalCancelButton]}
              onPress={() => {
                setShowContactPickerModal(false);
                setContactSearchQuery('');
              }}>
              <Text style={styles(theme).modalCancelButtonText}>Annuler</Text>
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
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <Text style={styles(theme).modalTitle}>Sélectionner un groupe</Text>

            <TouchableOpacity
              style={styles(theme).groupPickerOption}
              onPress={() => {
                setSelectedGroupId('');
                setShowGroupPickerModal(false);
              }}>
              <Text style={styles(theme).groupPickerOptionText}>Aucun groupe</Text>
            </TouchableOpacity>

            <ScrollView style={styles(theme).groupPickerList}>
              {groups.map((group) => (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles(theme).groupPickerOption,
                    selectedGroupId === group.id && styles(theme).groupPickerOptionSelected
                  ]}
                  onPress={() => {
                    setSelectedGroupId(group.id);
                    setShowGroupPickerModal(false);
                  }}>
                  <Text style={[
                    styles(theme).groupPickerOptionText,
                    selectedGroupId === group.id && styles(theme).groupPickerOptionTextSelected
                  ]}>
                    {group.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles(theme).modalButton, styles(theme).modalCancelButton]}
              onPress={() => setShowGroupPickerModal(false)}>
              <Text style={styles(theme).modalCancelButtonText}>Annuler</Text>
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
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <Text style={styles(theme).modalTitle}>Type de groupe</Text>

            {[
              {type: GroupType.FAMILY, label: 'Famille'},
              {type: GroupType.FRIENDS, label: 'Amis'},
              {type: GroupType.WORK, label: 'Travail'},
              {type: GroupType.OTHER, label: 'Autre'},
            ].map(({type, label}) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles(theme).groupPickerOption,
                  newGroupType === type && styles(theme).groupPickerOptionSelected
                ]}
                onPress={() => {
                  setNewGroupType(type);
                  setShowGroupTypePickerModal(false);
                }}>
                <Text style={[
                  styles(theme).groupPickerOptionText,
                  newGroupType === type && styles(theme).groupPickerOptionTextSelected
                ]}>{label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles(theme).modalButton, styles(theme).modalCancelButton]}
              onPress={() => setShowGroupTypePickerModal(false)}>
              <Text style={styles(theme).modalCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Sélectionner Type de Relation */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showRelationTypePickerModal}
        onRequestClose={() => setShowRelationTypePickerModal(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <Text style={styles(theme).modalTitle}>Type de relation</Text>

            {[
              {type: RelationType.SPOUSE, label: 'Conjoint(e)'},
              {type: RelationType.PARENT, label: 'Parent'},
              {type: RelationType.SIBLING, label: 'Frère/Sœur'},
              {type: RelationType.FRIEND, label: 'Ami(e)'},
              {type: RelationType.COLLEAGUE, label: 'Collègue'},
              {type: RelationType.OTHER, label: 'Autre'},
            ].map(({type, label}) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles(theme).relationTypeOption,
                  relationType === type && styles(theme).relationTypeOptionSelected
                ]}
                onPress={() => {
                  setRelationType(type);
                  setShowRelationTypePickerModal(false);
                }}>
                <Text style={[
                  styles(theme).relationTypeOptionText,
                  relationType === type && styles(theme).relationTypeOptionTextSelected
                ]}>{label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles(theme).button, styles(theme).cancelButton]}
              onPress={() => setShowRelationTypePickerModal(false)}>
              <Text style={styles(theme).cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  header: {
    backgroundColor: theme.primary,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 20,
    marginBottom: 20,
    marginHorizontal: -20,
    marginTop: -20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
  headerButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  importButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  goodFriendsButton: {
    backgroundColor: theme.primary,
  },
  importButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
    marginTop: 15,
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
    textAlignVertical: 'top',
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
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  itemContent: {
    flex: 1,
  },
  itemType: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  itemDetail: {
    fontSize: 13,
    color: '#666',
  },
  itemNotes: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    fontSize: 20,
    color: '#f44336',
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  groupRow: {
    marginTop: 15,
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
  photoButton: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
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
    maxWidth: 500,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
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
    maxHeight: 200,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    marginBottom: 10,
  },
  contactItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  contactItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  contactItemText: {
    fontSize: 15,
    color: '#333',
  },
  phoneContactList: {
    maxHeight: 400,
    marginVertical: 10,
  },
  phoneContactItem: {
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  phoneContactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  phoneContactPhone: {
    fontSize: 14,
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
    backgroundColor: theme.primary,
  },
  groupPickerOptionText: {
    fontSize: 16,
    color: '#333',
  },
  groupPickerOptionTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  relationTypeSelector: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  relationTypeSelectorText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  relationTypeSelectorIcon: {
    fontSize: 12,
    color: '#666',
  },
  relationTypeOption: {
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 10,
  },
  relationTypeOptionSelected: {
    backgroundColor: theme.primary,
  },
  relationTypeOptionText: {
    fontSize: 16,
    color: '#333',
  },
  relationTypeOptionTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default AddContactScreen;
