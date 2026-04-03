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
  Modal,
  FlatList,
  Image,
  StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Contacts from 'react-native-contacts';
import {launchImageLibrary} from 'react-native-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography} from '../theme/designSystem';
import ContactService from '../services/ContactService';
import StorageService from '../services/StorageService';
import NotificationService from '../services/NotificationService';
import {ContactGroup, GroupType, Contact, Child, RelationType} from '../types';

interface AddContactScreenProps {
  navigation: any;
}

const AddContactScreen: React.FC<AddContactScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const S = useMemo(() => styles(theme), [theme]);
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
  const [childGender, setChildGender] = useState<'male' | 'female' | 'other'>('male');
  const [childGifts, setChildGifts] = useState<string[]>([]);
  const [newGiftText, setNewGiftText] = useState('');
  
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
      gender: childGender,
      notes: childNotes,
      gifts: childGifts.length > 0 ? [...childGifts] : undefined,
    };

    setChildren([...children, newChild]);
    setShowChildModal(false);
    setChildFirstName('');
    setChildDateOfBirth(undefined);
    setChildNotes('');
    setChildGender('male');
    setChildGifts([]);
    setNewGiftText('');
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
    try {
      const permission = await Contacts.requestPermission();
      return permission === 'authorized';
    } catch (err) {
      console.warn(err);
      return false;
    }
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
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={theme.primary} />
      {/* ── Header ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backButton}>
          <MaterialIcons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={S.headerContent}>
          <Text style={S.title}>Nouveau contact</Text>
        </View>
      </View>

      <ScrollView style={S.scroll} contentContainerStyle={S.content} keyboardShouldPersistTaps="handled">

        {/* ── Raccourcis import ── */}
        <View style={S.quickActions}>
          <TouchableOpacity style={S.quickActionBtn} onPress={handleImportContact}>
            <MaterialIcons name="phone-android" size={22} color={theme.primary} />
            <Text style={[S.quickActionText, {color: theme.primary}]}>Importer des contacts</Text>
          </TouchableOpacity>
          <View style={S.quickActionDivider} />
          <TouchableOpacity style={S.quickActionBtn} onPress={() => navigation.navigate('SearchUsers')}>
            <MaterialIcons name="group" size={22} color={theme.primary} />
            <Text style={[S.quickActionText, {color: theme.primary}]}>Rechercher sur Goodfriends</Text>
          </TouchableOpacity>
        </View>

        {/* Prénom */}
        <Text style={S.label}>Prénom *</Text>
        <TextInput
          style={S.input}
          placeholder="Prénom"
          placeholderTextColor={Neutral[400]}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />

        {/* Nom */}
        <Text style={S.label}>Nom *</Text>
        <TextInput
          style={S.input}
          placeholder="Nom"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />

        {/* Date de naissance */}
        <Text style={S.label}>Date de naissance</Text>
        <TouchableOpacity
          style={S.dateButton}
          onPress={() => setShowDatePicker(true)}>
          <Text style={S.dateButtonText}>
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
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Enfants</Text>
            <TouchableOpacity
              style={S.addButton}
              onPress={() => setShowChildModal(true)}>
              <Text style={S.addButtonText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>

          {children.length === 0 ? (
            <Text style={S.emptyText}>Aucun enfant ajouté</Text>
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
                  <View key={child.id} style={S.item}>
                    <View style={S.itemContent}>
                      <Text style={S.itemName}>{child.firstName}</Text>
                      {ageText && <Text style={S.itemDetail}>{ageText}</Text>}
                      {child.dateOfBirth && (
                        <Text style={S.itemDetail}>
                          Né(e) le {new Date(child.dateOfBirth).toLocaleDateString('fr-FR')}
                        </Text>
                      )}
                      {child.notes && (
                        <Text style={S.itemNotes}>{child.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={S.deleteButton}
                      onPress={() => handleDeleteChild(child.id)}>
                      <Text style={S.deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Section Relations */}
        <View style={S.section}>
          <View style={S.sectionHeader}>
            <Text style={S.sectionTitle}>Relations</Text>
            <TouchableOpacity
              style={S.addButton}
              onPress={() => setShowRelationModal(true)}>
              <Text style={S.addButtonText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>

          {relationships.length === 0 ? (
            <Text style={S.emptyText}>Aucune relation ajoutée</Text>
          ) : (
            <>
              {relationships.map((relation) => {
                const relatedContact = allContacts.find(c => c.id === relation.contactId);
                if (!relatedContact) return null;
                return (
                  <View key={relation.contactId} style={S.item}>
                    <View style={S.itemContent}>
                      <Text style={S.itemType}>
                        {getRelationLabel(relation.relationType)}
                      </Text>
                      <Text style={S.itemName}>
                        {relatedContact.firstName} {relatedContact.lastName}
                      </Text>
                      {relation.notes && (
                        <Text style={S.itemNotes}>{relation.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={S.deleteButton}
                      onPress={() => handleDeleteRelation(relation.contactId)}>
                      <Text style={S.deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Profession */}
        <Text style={S.label}>Profession</Text>
        <TextInput
          style={S.input}
          placeholder="Profession"
          value={profession}
          onChangeText={setProfession}
        />

        {/* Groupe */}
        <View style={S.groupRow}>
          <View style={S.groupLabelContainer}>
            <Text style={S.label}>Groupe</Text>
            <TouchableOpacity
              style={S.addGroupButton}
              onPress={() => setShowGroupModal(true)}>
              <Text style={S.addGroupButtonText}>+ Nouveau</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity
          style={S.groupSelector}
          onPress={() => setShowGroupPickerModal(true)}>
          <Text style={S.groupSelectorText}>
            {selectedGroupId
              ? groups.find(g => g.id === selectedGroupId)?.name || 'Aucun groupe'
              : 'Aucun groupe'}
          </Text>
          <Text style={S.groupSelectorIcon}>▼</Text>
        </TouchableOpacity>

        {/* Notes */}
        <Text style={S.label}>Notes</Text>
        <TextInput
          style={[S.input, S.textArea]}
          placeholder="Notes sur cette personne..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Téléphone */}
        <Text style={S.label}>Téléphone</Text>
        <TextInput
          style={S.input}
          placeholder="+33 6 12 34 56 78"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        {/* Email */}
        <Text style={S.label}>Email</Text>
        <TextInput
          style={S.input}
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Photo */}
        <Text style={S.label}>Photo</Text>
        <TouchableOpacity
          style={S.photoButton}
          onPress={handleSelectPhoto}>
          {photoUri ? (
            <Image source={{uri: photoUri}} style={S.photoPreview} />
          ) : (
            <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
              <MaterialIcons name="photo-camera" size={22} color={theme.primary} />
              <Text style={S.photoButtonText}>Ajouter une photo</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Boutons */}
        <View style={S.buttonContainer}>
          <TouchableOpacity
            style={[S.button, S.cancelButton]}
            onPress={() => navigation.goBack()}>
            <Text style={S.cancelButtonText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[S.button, S.saveButton, loading && S.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}>
            <Text style={S.saveButtonText}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>
        </View>

      {/* Modal Ajouter un enfant */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        visible={showChildModal}
        onRequestClose={() => setShowChildModal(false)}>
        <View style={S.modalContainer}>
          <ScrollView style={{width: '100%'}} contentContainerStyle={{flexGrow: 1, justifyContent: 'center', alignItems: 'center'}} keyboardShouldPersistTaps="handled">
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Ajouter un enfant</Text>

            <Text style={S.modalLabel}>Prénom *</Text>
            <TextInput
              style={S.modalInput}
              placeholder="Prénom de l'enfant"
              value={childFirstName}
              onChangeText={setChildFirstName}
              autoCapitalize="words"
            />

            <Text style={S.modalLabel}>Date de naissance</Text>
            <TouchableOpacity
              style={S.dateButton}
              onPress={() => setShowChildDatePicker(true)}>
              <Text style={S.dateButtonText}>
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

            <Text style={S.modalLabel}>Sexe</Text>
            <View style={S.genderRow}>
              {(['male', 'female', 'other'] as const).map(g => (
                <TouchableOpacity
                  key={g}
                  style={[S.genderBtn, childGender === g && S.genderBtnActive]}
                  onPress={() => setChildGender(g)}>
                  <Text style={[S.genderBtnText, childGender === g && S.genderBtnTextActive]}>
                    {g === 'male' ? 'Garçon' : g === 'female' ? 'Fille' : 'Autre'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={S.modalLabel}>Notes</Text>
            <TextInput
              style={[S.modalInput, S.textArea]}
              placeholder="Notes..."
              value={childNotes}
              onChangeText={setChildNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <Text style={S.modalLabel}>Cadeaux offerts</Text>
            {childGifts.map((gift, idx) => (
              <View key={idx} style={S.giftRow}>
                <Text style={S.giftText}>{gift}</Text>
                <TouchableOpacity onPress={() => setChildGifts(childGifts.filter((_, i) => i !== idx))}>
                  <MaterialIcons name="close" size={18} color="#e53935" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={S.giftInputRow}>
              <TextInput
                style={[S.modalInput, {flex: 1, marginBottom: 0, marginRight: 8}]}
                placeholder="Ex: Lego, livre..."
                value={newGiftText}
                onChangeText={setNewGiftText}
              />
              <TouchableOpacity
                style={S.giftAddBtn}
                onPress={() => {
                  if (newGiftText.trim()) {
                    setChildGifts([...childGifts, newGiftText.trim()]);
                    setNewGiftText('');
                  }
                }}>
                <MaterialIcons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={S.modalButtons}>
              <TouchableOpacity
                style={[S.button, S.cancelButton]}
                onPress={() => {
                  setShowChildModal(false);
                  setChildFirstName('');
                  setChildDateOfBirth(undefined);
                  setChildNotes('');
                  setChildGender('male');
                  setChildGifts([]);
                  setNewGiftText('');
                }}>
                <Text style={S.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.button, S.saveButton]}
                onPress={handleAddChild}>
                <Text style={S.saveButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal Ajouter une relation */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        visible={showRelationModal}
        onRequestClose={() => setShowRelationModal(false)}>
        <View style={S.modalContainer}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Ajouter une relation</Text>

            <Text style={S.modalLabel}>Rechercher un contact *</Text>
            <TextInput
              style={S.modalInput}
              placeholder="Nom ou prénom..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <View style={S.contactList}>
              <FlatList
                data={filteredContacts}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={[
                      S.contactItem,
                      selectedContactId === item.id && S.contactItemSelected,
                    ]}
                    onPress={() => setSelectedContactId(item.id)}>
                    <Text style={S.contactItemText}>
                      {item.firstName} {item.lastName}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={S.emptyText}>Aucun contact trouvé</Text>
                }
              />
            </View>

            <Text style={S.modalLabel}>Type de relation *</Text>
            <TouchableOpacity
              style={S.relationTypeSelector}
              onPress={() => setShowRelationTypePickerModal(true)}>
              <Text style={S.relationTypeSelectorText}>
                {getRelationLabel(relationType)}
              </Text>
              <Text style={S.relationTypeSelectorIcon}>▼</Text>
            </TouchableOpacity>

            <Text style={S.modalLabel}>Notes</Text>
            <TextInput
              style={[S.modalInput, S.textArea]}
              placeholder="Notes..."
              value={relationNotes}
              onChangeText={setRelationNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={S.modalButtons}>
              <TouchableOpacity
                style={[S.button, S.cancelButton]}
                onPress={() => {
                  setShowRelationModal(false);
                  setSelectedContactId('');
                  setRelationType(RelationType.FRIEND);
                  setRelationNotes('');
                  setSearchQuery('');
                }}>
                <Text style={S.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.button, S.saveButton]}
                onPress={handleAddRelation}>
                <Text style={S.saveButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Nouveau groupe */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        visible={showGroupModal}
        onRequestClose={() => setShowGroupModal(false)}>
        <View style={S.modalContainer}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Nouveau groupe</Text>

            <Text style={S.modalLabel}>Nom du groupe *</Text>
            <TextInput
              style={S.modalInput}
              placeholder="Famille, Amis, Collègues..."
              value={newGroupName}
              onChangeText={setNewGroupName}
            />

            <Text style={S.modalLabel}>Type</Text>
            <TouchableOpacity
              style={S.groupSelector}
              onPress={() => setShowGroupTypePickerModal(true)}>
              <Text style={S.groupSelectorText}>
                {newGroupType === GroupType.FAMILY ? 'Famille' :
                 newGroupType === GroupType.FRIENDS ? 'Amis' :
                 newGroupType === GroupType.WORK ? 'Travail' : 'Autre'}
              </Text>
              <Text style={S.groupSelectorIcon}>▼</Text>
            </TouchableOpacity>

            <View style={S.modalButtons}>
              <TouchableOpacity
                style={[S.modalButton, S.modalCancelButton]}
                onPress={() => setShowGroupModal(false)}>
                <Text style={S.modalCancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.modalButton, S.modalSaveButton]}
                onPress={handleQuickCreateGroup}>
                <Text style={S.modalSaveButtonText}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Importer Contact */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        visible={showContactPickerModal}
        onRequestClose={() => setShowContactPickerModal(false)}>
        <View style={S.modalContainer}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Sélectionner un contact</Text>

            <TextInput
              style={S.modalInput}
              placeholder="Rechercher..."
              value={contactSearchQuery}
              onChangeText={setContactSearchQuery}
            />

            <FlatList
              data={filteredPhoneContacts}
              keyExtractor={(item) => item.recordID}
              style={S.phoneContactList}
              renderItem={({item}) => (
                <TouchableOpacity
                  style={S.phoneContactItem}
                  onPress={() => handleSelectPhoneContact(item)}>
                  <Text style={S.phoneContactName}>
                    {item.givenName || ''} {item.familyName || ''}
                  </Text>
                  {item.phoneNumbers && item.phoneNumbers.length > 0 && (
                    <Text style={S.phoneContactPhone}>
                      {item.phoneNumbers[0].number}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={S.emptyText}>Aucun contact trouvé</Text>
              }
            />

            <TouchableOpacity
              style={[S.modalButton, S.modalCancelButton]}
              onPress={() => {
                setShowContactPickerModal(false);
                setContactSearchQuery('');
              }}>
              <Text style={S.modalCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Sélectionner Groupe */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        visible={showGroupPickerModal}
        onRequestClose={() => setShowGroupPickerModal(false)}>
        <View style={S.modalContainer}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Sélectionner un groupe</Text>

            <TouchableOpacity
              style={S.groupPickerOption}
              onPress={() => {
                setSelectedGroupId('');
                setShowGroupPickerModal(false);
              }}>
              <Text style={S.groupPickerOptionText}>Aucun groupe</Text>
            </TouchableOpacity>

            <ScrollView style={S.groupPickerList}>
              {groups.map((group) => (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    S.groupPickerOption,
                    selectedGroupId === group.id && S.groupPickerOptionSelected
                  ]}
                  onPress={() => {
                    setSelectedGroupId(group.id);
                    setShowGroupPickerModal(false);
                  }}>
                  <Text style={[
                    S.groupPickerOptionText,
                    selectedGroupId === group.id && S.groupPickerOptionTextSelected
                  ]}>
                    {group.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[S.modalButton, S.modalCancelButton]}
              onPress={() => setShowGroupPickerModal(false)}>
              <Text style={S.modalCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Sélectionner Type de Groupe */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        visible={showGroupTypePickerModal}
        onRequestClose={() => setShowGroupTypePickerModal(false)}>
        <View style={S.modalContainer}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Type de groupe</Text>

            {[
              {type: GroupType.FAMILY, label: 'Famille'},
              {type: GroupType.FRIENDS, label: 'Amis'},
              {type: GroupType.WORK, label: 'Travail'},
              {type: GroupType.OTHER, label: 'Autre'},
            ].map(({type, label}) => (
              <TouchableOpacity
                key={type}
                style={[
                  S.groupPickerOption,
                  newGroupType === type && S.groupPickerOptionSelected
                ]}
                onPress={() => {
                  setNewGroupType(type);
                  setShowGroupTypePickerModal(false);
                }}>
                <Text style={[
                  S.groupPickerOptionText,
                  newGroupType === type && S.groupPickerOptionTextSelected
                ]}>{label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[S.modalButton, S.modalCancelButton]}
              onPress={() => setShowGroupTypePickerModal(false)}>
              <Text style={S.modalCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Sélectionner Type de Relation */}
      <Modal
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        visible={showRelationTypePickerModal}
        onRequestClose={() => setShowRelationTypePickerModal(false)}>
        <View style={S.modalContainer}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Type de relation</Text>

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
                  S.relationTypeOption,
                  relationType === type && S.relationTypeOptionSelected
                ]}
                onPress={() => {
                  setRelationType(type);
                  setShowRelationTypePickerModal(false);
                }}>
                <Text style={[
                  S.relationTypeOptionText,
                  relationType === type && S.relationTypeOptionTextSelected
                ]}>{label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[S.button, S.cancelButton]}
              onPress={() => setShowRelationTypePickerModal(false)}>
              <Text style={S.cancelButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </View>
  );
};

const styles = (theme: any) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Neutral[50],
  },
  // ── Header ──
  header: {
    backgroundColor: theme.primary,
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: Radius.xxl,
    borderBottomRightRadius: Radius.xxl,
    ...Shadow.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    ...Typography.title,
    color: '#FFF',
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: Radius.lg,
    marginBottom: Spacing.xl,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  quickActionText: {
    ...Typography.body,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  quickActionDivider: {
    width: 1,
    backgroundColor: Neutral[100],
    marginVertical: 10,
  },
  // ── Scroll & form ──
  scroll: {
    flex: 1,
  },
  content: {
    padding: Spacing.base,
    paddingTop: Spacing.xl,
    paddingBottom: 40,
  },
  label: {
    ...Typography.label,
    color: Neutral[600],
    marginBottom: 5,
    marginTop: Spacing.base,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Neutral[0],
    padding: Spacing.base,
    borderRadius: Radius.md,
    ...Typography.body,
    color: Neutral[800],
    borderWidth: 1,
    borderColor: Neutral[200],
  },
  textArea: {
    height: 100,
    paddingTop: Spacing.base,
    textAlignVertical: 'top',
  },
  dateButton: {
    backgroundColor: Neutral[0],
    padding: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Neutral[200],
  },
  dateButtonText: {
    ...Typography.body,
    color: Neutral[700],
  },
  section: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginTop: Spacing.base,
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.titleSm,
    color: Neutral[800],
  },
  addButton: {
    backgroundColor: theme.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Neutral[50],
    borderRadius: Radius.md,
    marginBottom: 6,
  },
  itemContent: {
    flex: 1,
  },
  itemType: {
    fontSize: 11,
    color: theme.primary,
    fontWeight: '700',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  itemName: {
    ...Typography.titleSm,
    color: Neutral[800],
    marginBottom: 2,
  },
  itemDetail: {
    ...Typography.bodyMd,
    color: Neutral[500],
  },
  itemNotes: {
    fontSize: 12,
    color: Neutral[400],
    fontStyle: 'italic',
    marginTop: 3,
  },
  deleteButton: {
    padding: 6,
  },
  deleteButtonText: {
    fontSize: 20,
    color: '#EF5350',
  },
  emptyText: {
    fontSize: 13,
    color: Neutral[400],
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: Spacing.sm,
  },
  groupRow: {
    marginTop: Spacing.base,
  },
  groupLabelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  addGroupButton: {
    backgroundColor: theme.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  addGroupButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  groupSelector: {
    backgroundColor: Neutral[0],
    padding: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Neutral[200],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupSelectorText: {
    ...Typography.body,
    color: Neutral[700],
    flex: 1,
  },
  groupSelectorIcon: {
    fontSize: 12,
    color: Neutral[500],
  },
  photoButton: {
    backgroundColor: Neutral[100],
    padding: Spacing.base,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
    minHeight: 120,
    borderWidth: 1,
    borderColor: Neutral[200],
    borderStyle: 'dashed',
  },
  photoButtonText: {
    color: Neutral[500],
    ...Typography.body,
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    marginBottom: Spacing.base,
  },
  button: {
    flex: 1,
    padding: Spacing.base,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Neutral[0],
    borderWidth: 1,
    borderColor: Neutral[200],
  },
  cancelButtonText: {
    color: Neutral[600],
    ...Typography.body,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: theme.primary,
    ...Shadow.sm,
  },
  saveButtonText: {
    color: '#FFF',
    ...Typography.body,
    fontWeight: '700',
  },
  buttonDisabled: {
    backgroundColor: Neutral[300],
  },
  // ── Modales ──
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    ...Shadow.md,
  },
  modalTitle: {
    ...Typography.titleMd,
    color: Neutral[800],
    marginBottom: Spacing.base,
    textAlign: 'center',
  },
  modalLabel: {
    ...Typography.label,
    color: Neutral[500],
    marginBottom: 5,
    marginTop: Spacing.sm,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: Neutral[50],
    padding: Spacing.base,
    borderRadius: Radius.md,
    ...Typography.body,
    color: Neutral[800],
    borderWidth: 1,
    borderColor: Neutral[200],
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.base,
  },
  modalButton: {
    flex: 1,
    padding: Spacing.base,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: Neutral[100],
  },
  modalCancelButtonText: {
    color: Neutral[600],
    ...Typography.body,
    fontWeight: '600',
  },
  modalSaveButton: {
    backgroundColor: theme.primary,
  },
  modalSaveButtonText: {
    color: '#FFF',
    ...Typography.body,
    fontWeight: '700',
  },
  contactList: {
    maxHeight: 200,
    backgroundColor: Neutral[50],
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  contactItem: {
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  contactItemSelected: {
    backgroundColor: theme.primary + '18',
  },
  contactItemText: {
    ...Typography.body,
    color: Neutral[700],
  },
  phoneContactList: {
    maxHeight: 400,
    marginVertical: Spacing.sm,
  },
  phoneContactItem: {
    padding: Spacing.base,
    backgroundColor: Neutral[50],
    borderRadius: Radius.md,
    marginBottom: 6,
  },
  phoneContactName: {
    ...Typography.titleSm,
    color: Neutral[800],
    marginBottom: 4,
  },
  phoneContactPhone: {
    ...Typography.bodyMd,
    color: Neutral[500],
  },
  groupPickerList: {
    maxHeight: 300,
  },
  groupPickerOption: {
    padding: Spacing.base,
    borderRadius: Radius.md,
    backgroundColor: Neutral[50],
    marginBottom: Spacing.sm,
  },
  groupPickerOptionSelected: {
    backgroundColor: theme.primary,
  },
  groupPickerOptionText: {
    ...Typography.body,
    color: Neutral[700],
  },
  groupPickerOptionTextSelected: {
    color: '#FFF',
    fontWeight: '700',
  },
  relationTypeSelector: {
    backgroundColor: Neutral[0],
    padding: Spacing.base,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Neutral[200],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  relationTypeSelectorText: {
    ...Typography.body,
    color: Neutral[700],
    flex: 1,
  },
  relationTypeSelectorIcon: {
    fontSize: 12,
    color: Neutral[500],
  },
  relationTypeOption: {
    padding: Spacing.base,
    borderRadius: Radius.md,
    backgroundColor: Neutral[50],
    marginBottom: Spacing.sm,
  },
  relationTypeOptionSelected: {
    backgroundColor: theme.primary,
  },
  relationTypeOptionText: {
    ...Typography.body,
    color: Neutral[700],
  },
  relationTypeOptionTextSelected: {
    color: '#FFF',
    fontWeight: '700',
  },
  genderRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Neutral[300],
    alignItems: 'center',
    backgroundColor: Neutral[50],
  },
  genderBtnActive: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  genderBtnText: {
    ...Typography.body,
    color: Neutral[600],
    fontWeight: '600',
  },
  genderBtnTextActive: {
    color: '#FFF',
  },
  giftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Neutral[50],
    borderRadius: Radius.sm,
    marginBottom: 4,
  },
  giftText: {
    ...Typography.body,
    color: Neutral[700],
    flex: 1,
    marginRight: 8,
  },
  giftInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  giftAddBtn: {
    backgroundColor: theme.primary,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AddContactScreen;
