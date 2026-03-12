import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Modal,
  Image,
} from 'react-native';
import {
  Appbar,
  List,
  Badge,
  Text,
  ActivityIndicator,
  Searchbar,
  FAB,
} from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {useTheme} from '../context/ThemeContext';
import MessageService, { Conversation } from '../services/MessageService';
import StorageService from '../services/StorageService';
import FriendRequestService from '../services/FriendRequestService';
import { Contact } from '../types';

type NavigationProp = NativeStackNavigationProp<any>;

const ConversationsScreen: React.FC = () => {
  const {theme} = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalUnread, setTotalUnread] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [goodFriendsContacts, setGoodFriendsContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
      
      // Polling toutes les 5 secondes pour les conversations et les notifications
      const interval = setInterval(async () => {
        loadConversations(true);
        try {
          await MessageService.checkNewMessages(); // Vérifier les nouveaux messages
          await FriendRequestService.checkNewFriendRequests(); // Vérifier les nouvelles demandes d'ami
        } catch (error) {
          console.error('Error checking notifications:', error);
        }
      }, 5000);

      return () => clearInterval(interval);
    }, [])
  );

  useEffect(() => {
    filterConversations();
  }, [searchQuery, conversations]);

  const loadConversations = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const data = await MessageService.getConversations();
      setConversations(data);
      
      // Calculer le total de messages non lus
      const unreadCount = data.reduce((sum, conv) => sum + conv.unreadCount, 0);
      setTotalUnread(unreadCount);
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
      if (!silent) {
        Alert.alert('Erreur', 'Impossible de charger les conversations');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  };

  const formatUserName = (firstName: string | null, lastName: string | null, email: string) => {
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else if (lastName) {
      return lastName;
    }
    return email;
  };

  const filterConversations = () => {
    if (!searchQuery.trim()) {
      setFilteredConversations(conversations);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = conversations.filter(
      (conv) =>
        conv.otherUserFirstName?.toLowerCase().includes(query) ||
        conv.otherUserLastName?.toLowerCase().includes(query) ||
        conv.otherUserEmail?.toLowerCase().includes(query) ||
        conv.otherUserPhone?.includes(query) ||
        conv.lastMessage?.toLowerCase().includes(query)
    );
    setFilteredConversations(filtered);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadConversations();
  };

  const loadGoodFriendsContacts = async () => {
    setLoadingContacts(true);
    try {
      const contacts = await StorageService.getContacts();
      const goodFriends = contacts.filter(contact => contact.goodfriendsUserId);
      setGoodFriendsContacts(goodFriends);
    } catch (error) {
      console.error('Erreur chargement contacts:', error);
      Alert.alert('Erreur', 'Impossible de charger les contacts');
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleNewMessage = () => {
    setModalVisible(true);
    loadGoodFriendsContacts();
  };

  const handleSelectContact = (contact: Contact) => {
    setModalVisible(false);
    navigation.navigate('Chat', {
      otherUserId: contact.goodfriendsUserId,
      otherUserFirstName: contact.firstName,
      otherUserLastName: contact.lastName,
      otherUserEmail: contact.email,
    });
  };

  const handleOpenChat = (conversation: Conversation) => {
    navigation.navigate('Chat', {
      otherUserId: conversation.otherUserId,
      otherUserFirstName: conversation.otherUserFirstName,
      otherUserLastName: conversation.otherUserLastName,
      otherUserEmail: conversation.otherUserEmail,
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Hier';
    } else if (days < 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    return (
      <List.Item
        title={formatUserName(item.otherUserFirstName, item.otherUserLastName, item.otherUserEmail)}
        description={item.lastMessage}
        descriptionNumberOfLines={2}
        left={(props) => (
          <List.Icon {...props} icon="account-circle" />
        )}
        right={() => (
          <View style={styles(theme).rightContainer}>
            <Text style={styles(theme).timeText}>{formatTime(item.lastMessageTime)}</Text>
            {item.unreadCount > 0 && (
              <Badge style={styles(theme).badge}>{item.unreadCount}</Badge>
            )}
          </View>
        )}
        onPress={() => handleOpenChat(item)}
        style={item.unreadCount > 0 ? styles(theme).unreadItem : undefined}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles(theme).container}>
        <Appbar.Header style={{backgroundColor: theme.primary, height: 80}}>
          <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
          <Appbar.Content title="Messages" titleStyle={{color: '#fff'}} />
        </Appbar.Header>
        <View style={styles(theme).loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles(theme).container}>
      <Appbar.Header style={{backgroundColor: theme.primary, height: 80}}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
        <Appbar.Content title="Messages" titleStyle={{color: '#fff'}} />
        {totalUnread > 0 && (
          <Badge style={styles(theme).headerBadge}>{totalUnread}</Badge>
        )}
      </Appbar.Header>

      <Searchbar
        placeholder="Rechercher..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles(theme).searchbar}
      />

      <FlatList
        data={filteredConversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.otherUserId}
        contentContainerStyle={styles(theme).list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles(theme).emptyContainer}>
            <Text style={styles(theme).emptyText}>Aucune conversation</Text>
            <Text style={styles(theme).emptySubtext}>
              {searchQuery
                ? 'Aucun résultat trouvé'
                : 'Commencez à discuter avec vos contacts GoodFriends'}
            </Text>
          </View>
        }
      />

      {/* Bouton flottant pour nouveau message */}
      <FAB
        style={styles(theme).fab}
        icon="message-plus"
        onPress={handleNewMessage}
        label="Nouveau message"
      />

      {/* Modale de sélection de contact */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <View style={styles(theme).modalHeader}>
              <Text style={styles(theme).modalTitle}>Choisir un contact</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles(theme).closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingContacts ? (
              <ActivityIndicator size="large" style={styles(theme).modalLoading} />
            ) : goodFriendsContacts.length === 0 ? (
              <View style={styles(theme).modalEmpty}>
                <Text style={styles(theme).emptyText}>Aucun contact GoodFriends</Text>
                <Text style={styles(theme).emptySubtext}>
                  Ajoutez des amis pour commencer à discuter
                </Text>
              </View>
            ) : (
              <FlatList
                data={goodFriendsContacts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles(theme).contactItem}
                    onPress={() => handleSelectContact(item)}>
                    {item.photo ? (
                      <Image
                        source={{ uri: item.photo }}
                        style={styles(theme).contactAvatar}
                      />
                    ) : (
                      <View style={styles(theme).contactAvatarPlaceholder}>
                        <Text style={styles(theme).contactAvatarText}>
                          {item.firstName.charAt(0)}{item.lastName.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles(theme).contactInfo}>
                      <Text style={styles(theme).contactName}>
                        {item.firstName} {item.lastName}
                      </Text>
                      <Text style={styles(theme).contactEmail}>{item.email}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
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
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchbar: {
    margin: 10,
    elevation: 2,
  },
  list: {
    flexGrow: 1,
  },
  rightContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 10,
  },
  timeText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  badge: {
    backgroundColor: theme.primary,
  },
  headerBadge: {
    backgroundColor: '#f44336',
    marginRight: 15,
  },
  unreadItem: {
    backgroundColor: '#f0f8ff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#2196F3',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
    padding: 5,
  },
  modalLoading: {
    marginTop: 50,
  },
  modalEmpty: {
    padding: 50,
    alignItems: 'center',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  contactAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  contactAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  contactAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  contactEmail: {
    fontSize: 14,
    color: '#666',
  },
});

export default ConversationsScreen;
