import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import {ContactGroup, GroupType, Contact} from '../types';
import StorageService from '../services/StorageService';
import ContactService from '../services/ContactService';

interface MyGroupsScreenProps {
  navigation: any;
}

const MyGroupsScreen: React.FC<MyGroupsScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<GroupType>(GroupType.OTHER);
  const [groupDescription, setGroupDescription] = useState('');
  const [groupColor, setGroupColor] = useState('#4CAF50');
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [groupContacts, setGroupContacts] = useState<Contact[]>([]);
  const [contactsModalVisible, setContactsModalVisible] = useState(false);

  const availableColors = [
    '#4CAF50', // Vert
    '#E91E63', // Rose
    '#2196F3', // Bleu
    '#FF9800', // Orange
    '#9C27B0', // Violet
    '#F44336', // Rouge
    '#00BCD4', // Cyan
    '#FFC107', // Jaune
    '#795548', // Marron
    '#607D8B', // Gris bleu
  ];

  useEffect(() => {
    loadGroups();
    const unsubscribe = navigation.addListener('focus', () => {
      loadGroups();
    });
    return unsubscribe;
  }, [navigation]);

  const loadGroups = async () => {
    const loadedGroups = await StorageService.getGroups();
    setGroups(loadedGroups);
  };

  const handleAddGroup = async () => {
    if (!groupName) {
      Alert.alert('Erreur', 'Le nom du groupe est obligatoire');
      return;
    }

    try {
      await ContactService.createGroup({
        name: groupName,
        type: groupType,
        description: groupDescription,
        color: groupColor,
      });

      setModalVisible(false);
      setGroupName('');
      setGroupDescription('');
      setGroupType(GroupType.OTHER);
      setGroupColor('#4CAF50');
      loadGroups();
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };

  const handleDeleteGroup = (group: ContactGroup) => {
    Alert.alert(
      'Supprimer le groupe',
      `Êtes-vous sûr de vouloir supprimer "${group.name}" ?`,
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteGroup(group.id);
            loadGroups();
          },
        },
      ],
    );
  };

  const handleGroupClick = async (group: ContactGroup) => {
    setSelectedGroup(group);
    
    // Charger les contacts du groupe
    const allContacts = await StorageService.getContacts();
    const contactsInGroup = allContacts.filter(c => group.contactIds.includes(c.id));
    setGroupContacts(contactsInGroup);
    setContactsModalVisible(true);
  };

  const getGroupTypeLabel = (type: GroupType): string => {
    switch (type) {
      case GroupType.FAMILY:
        return 'Famille';
      case GroupType.FRIENDS:
        return 'Amis';
      case GroupType.WORK:
        return 'Travail';
      default:
        return 'Autre';
    }
  };

  const getGroupTypeIcon = (type: GroupType): string => {
    switch (type) {
      case GroupType.FAMILY:
        return '👨‍👩‍👧‍👦';
      case GroupType.FRIENDS:
        return '👥';
      case GroupType.WORK:
        return '💼';
      default:
        return '📁';
    }
  };

  const renderGroupItem = ({item}: {item: ContactGroup}) => (
    <TouchableOpacity
      style={styles(theme).groupCard}
      onPress={() => handleGroupClick(item)}
      onLongPress={() => handleDeleteGroup(item)}>
      <View style={styles(theme).groupHeader}>
        <View style={styles(theme).groupTitleContainer}>
          <View style={[styles(theme).groupColorDot, {backgroundColor: item.color || '#4CAF50'}]} />
          <Text style={styles(theme).groupIcon}>{getGroupTypeIcon(item.type)}</Text>
          <View>
            <Text style={styles(theme).groupName}>{item.name}</Text>
            <Text style={styles(theme).groupType}>{getGroupTypeLabel(item.type)}</Text>
          </View>
        </View>
        <View style={styles(theme).groupBadge}>
          <Text style={styles(theme).groupCount}>{item.contactIds.length}</Text>
        </View>
      </View>
      {item.description && (
        <Text style={styles(theme).groupDescription}>{item.description}</Text>
      )}
    </TouchableOpacity>
  );

  const renderContactInGroup = ({item}: {item: Contact}) => (
    <TouchableOpacity
      style={styles(theme).contactCard}
      onPress={() => {
        setContactsModalVisible(false);
        navigation.navigate('ContactDetail', {contactId: item.id});
      }}>
      {item.photo ? (
        <Image source={{uri: item.photo}} style={styles(theme).contactAvatar} />
      ) : (
        <View style={[styles(theme).contactAvatar, styles(theme).avatarPlaceholder]}>
          <Text style={styles(theme).avatarText}>
            {item.firstName?.charAt(0)}{item.lastName?.charAt(0)}
          </Text>
        </View>
      )}
      <View style={styles(theme).contactInfo}>
        <Text style={styles(theme).contactName}>
          {item.firstName} {item.lastName}
        </Text>
        {item.email && (
          <Text style={styles(theme).contactEmail}>{item.email}</Text>
        )}
      </View>
      <Text style={styles(theme).chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles(theme).container}>
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <View style={styles(theme).backBtnCircle}>
              <MaterialIcons name="arrow-back" size={22} color="#383830" />
            </View>
          </TouchableOpacity>
          <View>
            <Text style={styles(theme).headerTitle}>Mes groupes</Text>
            <Text style={styles(theme).headerSubtitle}>Organisez vos contacts en groupes</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={groups}
        renderItem={renderGroupItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles(theme).listContent}
        ListEmptyComponent={
          <View style={styles(theme).emptyContainer}>
            <Text style={styles(theme).emptyIcon}>📁</Text>
            <Text style={styles(theme).emptyText}>Aucun groupe</Text>
            <Text style={styles(theme).emptySubtext}>
              Créez votre premier groupe pour organiser vos contacts
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles(theme).addButton}
        onPress={() => setModalVisible(true)}>
        <Text style={styles(theme).addButtonText}>+ Créer un groupe</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={{paddingBottom: 20}}>
              <Text style={styles(theme).modalTitle}>Nouveau groupe</Text>

              <Text style={styles(theme).label}>Nom du groupe *</Text>
              <TextInput
                style={styles(theme).input}
                placeholder="Ex: Famille, Amis proches..."
                value={groupName}
                onChangeText={setGroupName}
                autoFocus
              />

              <Text style={styles(theme).label}>Type de groupe</Text>
              <View style={styles(theme).pickerContainer}>
                <Picker
                  selectedValue={groupType}
                  onValueChange={(value) => setGroupType(value)}
                  style={styles(theme).picker}>
                  <Picker.Item label="👨‍👩‍👧‍👦 Famille" value={GroupType.FAMILY} />
                  <Picker.Item label="👥 Amis" value={GroupType.FRIENDS} />
                  <Picker.Item label="💼 Travail" value={GroupType.WORK} />
                  <Picker.Item label="📁 Autre" value={GroupType.OTHER} />
                </Picker>
              </View>

              <Text style={styles(theme).label}>Description (optionnelle)</Text>
              <TextInput
                style={[styles(theme).input, styles(theme).textArea]}
                placeholder="Décrivez ce groupe..."
                value={groupDescription}
                onChangeText={setGroupDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              <Text style={styles(theme).label}>Couleur</Text>
              <View style={styles(theme).colorPicker}>
                {availableColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles(theme).colorOption,
                      {backgroundColor: color},
                      groupColor === color && styles(theme).colorOptionSelected,
                    ]}
                    onPress={() => setGroupColor(color)}>
                    {groupColor === color && (
                      <Text style={styles(theme).colorCheckmark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles(theme).modalButtons}>
                <TouchableOpacity
                  style={[styles(theme).modalButton, styles(theme).cancelButton]}
                  onPress={() => {
                    setModalVisible(false);
                    setGroupName('');
                    setGroupDescription('');
                    setGroupType(GroupType.OTHER);
                    setGroupColor('#4CAF50');
                  }}>
                  <Text style={styles(theme).cancelButtonText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles(theme).modalButton, styles(theme).createButton]}
                  onPress={handleAddGroup}>
                  <Text style={styles(theme).createButtonText}>Créer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal pour afficher les contacts du groupe */}
      <Modal
        visible={contactsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setContactsModalVisible(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <View style={styles(theme).modalHeader}>
              <Text style={styles(theme).modalTitle}>
                {selectedGroup?.name}
              </Text>
              <TouchableOpacity
                onPress={() => setContactsModalVisible(false)}
                style={styles(theme).closeButton}>
                <Text style={styles(theme).closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {groupContacts.length > 0 ? (
              <FlatList
                data={groupContacts}
                renderItem={renderContactInGroup}
                keyExtractor={item => item.id}
                style={styles(theme).contactsList}
              />
            ) : (
              <View style={styles(theme).emptyContactsContainer}>
                <Text style={styles(theme).emptyIcon}>📭</Text>
                <Text style={styles(theme).emptyText}>Aucun contact dans ce groupe</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f0',
  },
  header: {
    backgroundColor: '#fcf9f0',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 0,
  },
  backBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#383830',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#65655c',
    marginTop: 2,
  },
  listContent: {
    padding: 15,
    paddingBottom: 80,
  },
  groupCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  groupTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  groupName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  groupType: {
    fontSize: 13,
    color: '#666',
  },
  groupBadge: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  groupCount: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  groupDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 15,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    left: 15,
    right: 15,
    backgroundColor: theme.primary,
    padding: 16,
    borderRadius: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  textArea: {
    minHeight: 80,
  },
  pickerContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#333',
    borderWidth: 3,
  },
  colorCheckmark: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  groupColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 25,
    gap: 10,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: theme.primary,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactsList: {
    maxHeight: '80%',
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  contactAvatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  contactEmail: {
    fontSize: 12,
    color: '#666',
  },
  chevron: {
    fontSize: 20,
    color: '#ccc',
  },
  emptyContactsContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
});

export default MyGroupsScreen;
