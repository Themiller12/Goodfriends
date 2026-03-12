import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Platform,
  FlatList,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Contact, Child, RelationType, Relationship} from '../types';
import ContactService from '../services/ContactService';
import StorageService from '../services/StorageService';
import StorageServiceAPI from '../services/StorageServiceAPI';

interface ManageRelationsScreenProps {
  navigation: any;
  route: any;
}

const ManageRelationsScreen: React.FC<ManageRelationsScreenProps> = ({
  navigation,
  route,
}) => {
  const {contactId} = route.params;
  const [contact, setContact] = useState<Contact | null>(null);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  
  // Gestion des enfants
  const [showChildModal, setShowChildModal] = useState(false);
  const [childFirstName, setChildFirstName] = useState('');
  const [childDateOfBirth, setChildDateOfBirth] = useState<Date | undefined>(undefined);
  const [showChildDatePicker, setShowChildDatePicker] = useState(false);
  const [childNotes, setChildNotes] = useState('');
  
  // Gestion des relations
  const [showRelationModal, setShowRelationModal] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [relationType, setRelationType] = useState<RelationType>(RelationType.FRIEND);
  const [customRelationLabel, setCustomRelationLabel] = useState('');
  const [relationNotes, setRelationNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [showRelationTypePickerModal, setShowRelationTypePickerModal] = useState(false);

  useEffect(() => {
    loadContact();
    loadAllContacts();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = allContacts.filter(
        c =>
          c.id !== contactId &&
          (c.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.lastName.toLowerCase().includes(searchQuery.toLowerCase())),
      );
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts(allContacts.filter(c => c.id !== contactId));
    }
  }, [searchQuery, allContacts, contactId]);

  const loadContact = async () => {
    const contacts = await StorageService.getContacts();
    const foundContact = contacts.find(c => c.id === contactId);
    if (foundContact) {
      // S'assurer que children est initialisé
      if (!foundContact.children) {
        foundContact.children = [];
      }
      setContact(foundContact);
    }
  };

  const loadAllContacts = async () => {
    const contacts = await StorageService.getContacts();
    setAllContacts(contacts);
    setFilteredContacts(contacts.filter(c => c.id !== contactId));
  };

  const handleAddChild = async () => {
    if (!childFirstName) {
      Alert.alert('Erreur', 'Le prénom de l\'enfant est obligatoire');
      return;
    }

    try {
      const newChild = {
        firstName: childFirstName,
        dateOfBirth: childDateOfBirth,
        notes: childNotes,
      };

      await StorageServiceAPI.addChild(contactId, newChild);
      await loadContact();
      
      setShowChildModal(false);
      setChildFirstName('');
      setChildDateOfBirth(undefined);
      setChildNotes('');
      
      Alert.alert('Succès', 'Enfant ajouté avec succès');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };

  const handleAddRelation = async () => {
    if (!selectedContactId) {
      Alert.alert('Erreur', 'Veuillez sélectionner un contact');
      return;
    }

    try {
      await ContactService.addRelationship(
        contactId,
        selectedContactId,
        relationType,
        relationNotes,
        relationType === RelationType.OTHER && customRelationLabel.trim()
          ? customRelationLabel.trim()
          : undefined,
      );

      await loadContact();
      
      setShowRelationModal(false);
      setSelectedContactId('');
      setRelationType(RelationType.FRIEND);
      setRelationNotes('');
      setCustomRelationLabel('');
      setSearchQuery('');
      
      Alert.alert('Succès', 'Relation ajoutée avec succès');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };

  const handleDeleteChild = (childId: string) => {
    Alert.alert(
      'Supprimer l\'enfant',
      'Êtes-vous sûr de vouloir supprimer cet enfant ?',
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageServiceAPI.deleteChild(childId);
              await loadContact();
            } catch (error: any) {
              Alert.alert('Erreur', error.message);
            }
          },
        },
      ],
    );
  };

  const handleDeleteRelation = (relationshipId: string) => {
    Alert.alert(
      'Supprimer la relation',
      'Êtes-vous sûr de vouloir supprimer cette relation ?',
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              // Trouver la relation à supprimer
              const relationToDelete = contact!.relationships.find(r => r.id === relationshipId);
              
              if (relationToDelete) {
                // Utiliser l'API pour supprimer la relation (supprimer aussi la relation inverse)
                await StorageServiceAPI.deleteRelationship(contactId, relationToDelete.contactId);
                await loadContact();
                
                Alert.alert('Succès', 'Relation supprimée');
              }
            } catch (error) {
              console.error('Error deleting relation:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la relation');
            }
          },
        },
      ],
    );
  };

  const getRelationLabel = (relationType: RelationType, custom?: string): string => {
    if (custom) return custom;
    switch (relationType) {
      case RelationType.SPOUSE:     return 'Conjoint(e)';
      case RelationType.CHILD:      return 'Enfant';
      case RelationType.FATHER:     return 'Père';
      case RelationType.MOTHER:     return 'Mère';
      case RelationType.PARENT:     return 'Parent';
      case RelationType.SIBLING:    return 'Frère/Sœur';
      case RelationType.COUSIN:     return 'Cousin(e)';
      case RelationType.STEPMOTHER: return 'Belle-mère';
      case RelationType.STEPFATHER: return 'Beau-père';
      case RelationType.FRIEND:     return 'Ami(e)';
      case RelationType.COLLEAGUE:  return 'Collègue';
      default:                      return 'Autre';
    }
  };

  const onChildDateChange = (event: any, selectedDate?: Date) => {
    setShowChildDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setChildDateOfBirth(selectedDate);
    }
  };

  if (!contact) {
    return (
      <View style={styles.container}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  const relatedContacts = contact.relationships.map(r => {
    const relatedContact = allContacts.find(c => c.id === r.contactId);
    return {relationship: r, contact: relatedContact};
  });

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.mainTitle}>
          Relations de {contact.firstName} {contact.lastName}
        </Text>

        {/* Section Enfants */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Enfants</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowChildModal(true)}>
              <Text style={styles.addButtonText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>

          {contact.children.length === 0 ? (
            <Text style={styles.emptyText}>Aucun enfant ajouté</Text>
          ) : (
            <>
              {contact.children.map((child, index) => {
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
                  <View key={child.id || `child-${index}`} style={styles.item}>
                    <View style={styles.itemContent}>
                      <Text style={styles.itemName}>{child.firstName}</Text>
                      {ageText && <Text style={styles.itemDetail}>{ageText}</Text>}
                      {child.dateOfBirth && (
                        <Text style={styles.itemDetail}>
                          Né(e) le {new Date(child.dateOfBirth).toLocaleDateString('fr-FR')}
                        </Text>
                      )}
                      {child.notes && (
                        <Text style={styles.itemNotes}>{child.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteChild(child.id)}>
                      <Text style={styles.deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </View>

        {/* Section Relations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Relations avec d'autres contacts</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowRelationModal(true)}>
              <Text style={styles.addButtonText}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>

          {relatedContacts.length === 0 ? (
            <Text style={styles.emptyText}>Aucune relation ajoutée</Text>
          ) : (
            <>
              {relatedContacts.map(({relationship, contact: relatedContact}, index) => {
                if (!relatedContact) return null;
                return (
                  <View key={relationship.id || `relation-${index}`} style={styles.item}>
                    <View style={styles.itemContent}>
                      <Text style={styles.itemType}>
                        {getRelationLabel(relationship.relationType, relationship.customRelationLabel)}
                      </Text>
                      <Text style={styles.itemName}>
                        {relatedContact.firstName} {relatedContact.lastName}
                      </Text>
                      {relationship.notes && (
                        <Text style={styles.itemNotes}>{relationship.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteRelation(relationship.id)}>
                      <Text style={styles.deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </View>

      {/* Modal Ajouter un enfant */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showChildModal}
        onRequestClose={() => setShowChildModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajouter un enfant</Text>

            <Text style={styles.label}>Prénom *</Text>
            <TextInput
              style={styles.input}
              placeholder="Prénom de l'enfant"
              value={childFirstName}
              onChangeText={setChildFirstName}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Date de naissance</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowChildDatePicker(true)}>
              <Text style={styles.dateButtonText}>
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

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Notes..."
              value={childNotes}
              onChangeText={setChildNotes}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowChildModal(false)}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleAddChild}>
                <Text style={styles.saveButtonText}>Ajouter</Text>
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
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajouter une relation</Text>

            <Text style={styles.label}>Rechercher un contact *</Text>
            <TextInput
              style={styles.input}
              placeholder="Nom ou prénom..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <View style={styles.contactList}>
              <FlatList
                data={filteredContacts}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                  <TouchableOpacity
                    style={[
                      styles.contactItem,
                      selectedContactId === item.id && styles.contactItemSelected,
                    ]}
                    onPress={() => setSelectedContactId(item.id)}>
                    <Text style={styles.contactItemText}>
                      {item.firstName} {item.lastName}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Aucun contact trouvé</Text>
                }
              />
            </View>

            <Text style={styles.label}>Type de relation *</Text>
            <TouchableOpacity
              style={styles.relationTypeSelector}
              onPress={() => setShowRelationTypePickerModal(true)}>
              <Text style={styles.relationTypeSelectorText}>
                {getRelationLabel(relationType, relationType === RelationType.OTHER && customRelationLabel ? customRelationLabel : undefined)}
              </Text>
              <Text style={styles.relationTypeSelectorIcon}>▼</Text>
            </TouchableOpacity>

            {relationType === RelationType.OTHER && (
              <>
                <Text style={styles.label}>Label personnalisé</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Parrain, Marraine, Tuteur..."
                  value={customRelationLabel}
                  onChangeText={setCustomRelationLabel}
                />
              </>
            )}

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Notes..."
              value={relationNotes}
              onChangeText={setRelationNotes}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowRelationModal(false)}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleAddRelation}>
                <Text style={styles.saveButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Sélectionner Type de Relation */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showRelationTypePickerModal}
        onRequestClose={() => setShowRelationTypePickerModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Type de relation</Text>

            {[
              {label: 'Ami(e)',       value: RelationType.FRIEND},
              {label: 'Conjoint(e)', value: RelationType.SPOUSE},
              {label: 'Enfant',      value: RelationType.CHILD},
              {label: 'Père',        value: RelationType.FATHER},
              {label: 'Mère',        value: RelationType.MOTHER},
              {label: 'Frère/Sœur', value: RelationType.SIBLING},
              {label: 'Cousin(e)',   value: RelationType.COUSIN},
              {label: 'Belle-mère',  value: RelationType.STEPMOTHER},
              {label: 'Beau-père',   value: RelationType.STEPFATHER},
              {label: 'Collègue',    value: RelationType.COLLEAGUE},
              {label: 'Autre...',    value: RelationType.OTHER},
            ].map(({label, value}) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.relationTypeOption,
                  relationType === value && styles.relationTypeOptionSelected,
                ]}
                onPress={() => {
                  setRelationType(value);
                  if (value !== RelationType.OTHER) setCustomRelationLabel('');
                  setShowRelationTypePickerModal(false);
                }}>
                <Text style={[
                  styles.relationTypeOptionText,
                  relationType === value && styles.relationTypeOptionTextSelected,
                ]}>{label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => setShowRelationTypePickerModal(false)}>
              <Text style={styles.cancelButtonText}>Annuler</Text>
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
  mainTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
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
    marginBottom: 10,
  },
  itemContent: {
    flex: 1,
  },
  itemType: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  itemDetail: {
    fontSize: 14,
    color: '#666',
  },
  itemNotes: {
    fontSize: 13,
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
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: 20,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    paddingTop: 15,
    textAlignVertical: 'top',
  },
  dateButton: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
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
    fontSize: 16,
    color: '#333',
  },
  pickerContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
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
    backgroundColor: '#2196F3',
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

export default ManageRelationsScreen;
