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
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import {useTheme} from '../context/ThemeContext';
import {ContactGroup, GroupType} from '../types';
import StorageService from '../services/StorageService';
import ContactService from '../services/ContactService';

interface GroupsScreenProps {
  navigation: any;
}

const GroupsScreen: React.FC<GroupsScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<GroupType>(GroupType.OTHER);
  const [groupDescription, setGroupDescription] = useState('');

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
      });

      setModalVisible(false);
      setGroupName('');
      setGroupDescription('');
      setGroupType(GroupType.OTHER);
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

  return (
    <View style={styles(theme).container}>
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <Text style={styles(theme).backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles(theme).title}>Mes groupes</Text>
          <TouchableOpacity
            style={styles(theme).addButton}
            onPress={() => setModalVisible(true)}>
            <Text style={styles(theme).addButtonText}>+ Ajouter</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(item) => item.id}
        renderItem={({item}) => (
          <View style={styles(theme).groupItem}>
            <View style={styles(theme).groupInfo}>
              <Text style={styles(theme).groupName}>{item.name}</Text>
              <Text style={styles(theme).groupType}>
                {getGroupTypeLabel(item.type)} • {(item.contactIds || []).length} contact
                {(item.contactIds || []).length > 1 ? 's' : ''}
              </Text>
              {item.description && (
                <Text style={styles(theme).groupDescription}>{item.description}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles(theme).deleteButton}
              onPress={() => handleDeleteGroup(item)}>
              <Text style={styles(theme).deleteButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles(theme).emptyContainer}>
            <Text style={styles(theme).emptyText}>Aucun groupe créé</Text>
            <Text style={styles(theme).emptySubtext}>
              Créez des groupes pour organiser vos contacts
            </Text>
          </View>
        }
      />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <Text style={styles(theme).modalTitle}>Nouveau groupe</Text>

            <Text style={styles(theme).label}>Nom du groupe *</Text>
            <TextInput
              style={styles(theme).input}
              placeholder="Famille, Amis, Collègues..."
              value={groupName}
              onChangeText={setGroupName}
            />

            <Text style={styles(theme).label}>Type</Text>
            <View style={styles(theme).pickerContainer}>
              <Picker
                selectedValue={groupType}
                onValueChange={(itemValue) => setGroupType(itemValue)}
                style={styles(theme).picker}>
                <Picker.Item label="Famille" value={GroupType.FAMILY} />
                <Picker.Item label="Amis" value={GroupType.FRIENDS} />
                <Picker.Item label="Travail" value={GroupType.WORK} />
                <Picker.Item label="Autre" value={GroupType.OTHER} />
              </Picker>
            </View>

            <Text style={styles(theme).label}>Description</Text>
            <TextInput
              style={[styles(theme).input, styles(theme).textArea]}
              placeholder="Description du groupe..."
              value={groupDescription}
              onChangeText={setGroupDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles(theme).modalButtons}>
              <TouchableOpacity
                style={[styles(theme).button, styles(theme).cancelButton]}
                onPress={() => setModalVisible(false)}>
                <Text style={styles(theme).cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles(theme).button, styles(theme).saveButton]}
                onPress={handleAddGroup}>
                <Text style={styles(theme).saveButtonText}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'column',
    padding: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: theme.primary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: 10,
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
    flex: 1,
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  groupItem: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    marginHorizontal: 15,
    marginVertical: 5,
    borderRadius: 10,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  groupType: {
    fontSize: 14,
    color: '#666',
    marginBottom: 3,
  },
  groupDescription: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  deleteButton: {
    padding: 10,
  },
  deleteButtonText: {
    fontSize: 20,
    color: '#f44336',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#999',
    marginBottom: 10,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
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
});

export default GroupsScreen;
