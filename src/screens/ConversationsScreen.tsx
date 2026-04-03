import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Modal,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography} from '../theme/designSystem';
import MessageService, { Conversation } from '../services/MessageService';
import StorageService from '../services/StorageService';
import FriendRequestService from '../services/FriendRequestService';
import OnlineStatusService from '../services/OnlineStatusService';
import GroupChatService from '../services/GroupChatService';
import OnlineIndicator from '../components/OnlineIndicator';
import { Contact, GroupChat, GroupMember } from '../types';

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
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, boolean>>({});

  // Groupes
  const [activeTab, setActiveTab] = useState<'messages' | 'groups'>('messages');
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<GroupChat[]>([]);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupStep, setGroupStep] = useState<1 | 2>(1);
  const [groupName, setGroupName] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [allLocalContacts, setAllLocalContacts] = useState<Contact[]>([]);
  const [loadingAllContacts, setLoadingAllContacts] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadConversations();
      loadGroupChats();
      
      // Polling toutes les 5 secondes pour les conversations et les notifications
      const interval = setInterval(async () => {
        loadConversations(true);
        loadGroupChats();
        try {
          await MessageService.checkNewMessages();
          await FriendRequestService.checkNewFriendRequests();
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

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredGroups(groupChats);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredGroups(groupChats.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.members.some(m =>
          m.firstName.toLowerCase().includes(q) || m.lastName.toLowerCase().includes(q)
        )
      ));
    }
  }, [searchQuery, groupChats]);

  const loadConversations = async (silent: boolean = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await MessageService.getConversations();
      setConversations(data);
      const ids = data.map(c => c.otherUserId);
      if (ids.length > 0) {
        OnlineStatusService.getStatuses(ids).then(setOnlineStatuses);
      }
      const unreadCount = data.reduce((sum, conv) => sum + conv.unreadCount, 0);
      setTotalUnread(unreadCount);
    } catch (error) {
      console.error('Erreur chargement conversations:', error);
      if (!silent) Alert.alert('Erreur', 'Impossible de charger les conversations');
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };

  const loadGroupChats = async () => {
    const groups = await GroupChatService.getAll();
    // trier par date de dernier message
    groups.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setGroupChats(groups);
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

  const handleNewGroup = async () => {
    setLoadingAllContacts(true);
    try {
      const contacts = await StorageService.getContacts();
      // Seuls les contacts GoodFriends peuvent rejoindre un groupe de conversation
      setAllLocalContacts(contacts.filter(c => !!c.goodfriendsUserId));
    } catch {
      Alert.alert('Erreur', 'Impossible de charger les contacts');
    } finally {
      setLoadingAllContacts(false);
    }
    setSelectedContactIds([]);
    setGroupName('');
    setGroupStep(1);
    setShowCreateGroupModal(true);
  };

  const toggleContactSelection = (id: string) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom pour le groupe');
      return;
    }
    if (selectedContactIds.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins un contact');
      return;
    }
    const members: GroupMember[] = selectedContactIds.map(cid => {
      const c = allLocalContacts.find(x => x.id === cid)!;
      return {
        userId: c.goodfriendsUserId ?? '',
        contactId: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        photo: c.photo,
      };
    });
    const newGroup = await GroupChatService.create(groupName.trim(), members);
    setShowCreateGroupModal(false);
    setGroupChats(prev => [newGroup, ...prev]);
    setActiveTab('groups');
    navigation.navigate('GroupChat', { groupId: newGroup.id });
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

  const renderGroup = ({ item }: { item: GroupChat }) => {
    const { text, time } = GroupChatService.getLastMessage(item);
    return (
      <TouchableOpacity
        style={styles(theme).conversationItem}
        onPress={() => navigation.navigate('GroupChat', { groupId: item.id })}
        activeOpacity={0.7}>
        <View style={[styles(theme).avatarCircle, { backgroundColor: theme.secondary || '#6d4c41' }]}>
          <MaterialIcons name="group" size={22} color="#FFF" />
        </View>
        <View style={styles(theme).conversationInfo}>
          <View style={styles(theme).conversationTop}>
            <Text style={styles(theme).conversationName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles(theme).timeText}>{formatTime(time)}</Text>
          </View>
          <Text style={styles(theme).lastMessage} numberOfLines={1}>
            {item.messages.length > 0
              ? `${item.messages[item.messages.length - 1].senderName}: ${text}`
              : `${item.members.length} membre${item.members.length > 1 ? 's' : ''}`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const name = formatUserName(item.otherUserFirstName, item.otherUserLastName, item.otherUserEmail);
    const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    return (
      <TouchableOpacity
        style={[styles(theme).conversationItem, item.unreadCount > 0 ? styles(theme).unreadItem : null]}
        onPress={() => handleOpenChat(item)}
        activeOpacity={0.7}>
        <View style={styles(theme).avatarCircle}>
          <Text style={styles(theme).avatarText}>{initials}</Text>
          <OnlineIndicator isOnline={onlineStatuses[item.otherUserId] ?? false} size={13} />
        </View>
        <View style={styles(theme).conversationInfo}>
          <View style={styles(theme).conversationTop}>
            <Text style={styles(theme).conversationName} numberOfLines={1}>{name}</Text>
            <Text style={styles(theme).timeText}>{formatTime(item.lastMessageTime)}</Text>
          </View>
          <View style={styles(theme).conversationBottom}>
            <Text style={styles(theme).lastMessage} numberOfLines={1}>{item.lastMessage || '…'}</Text>
            {item.unreadCount > 0 && (
              <View style={styles(theme).badgeContainer}>
                <Text style={styles(theme).badgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles(theme).container}>
        <View style={styles(theme).header}>
          <Text style={styles(theme).headerTitle}>Messages</Text>
        </View>
        <View style={styles(theme).loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles(theme).container}>
      {/* Header */}
      <View style={styles(theme).header}>
        <View style={styles(theme).headerContent}>
          <Text style={styles(theme).headerTitle}>Messages</Text>
          {totalUnread > 0 && (
            <Text style={styles(theme).headerSubtitle}>
              {totalUnread} non lu{totalUnread > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={activeTab === 'messages' ? handleNewMessage : handleNewGroup}
          style={styles(theme).headerBtn}>
          <MaterialIcons name={activeTab === 'messages' ? 'edit' : 'group-add'} size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles(theme).tabRow}>
        <TouchableOpacity
          style={[styles(theme).tab, activeTab === 'messages' && styles(theme).tabActive]}
          onPress={() => setActiveTab('messages')}>
          <MaterialIcons name="chat" size={16} color={activeTab === 'messages' ? theme.primary : Neutral[500]} />
          <Text style={[styles(theme).tabText, activeTab === 'messages' && styles(theme).tabTextActive]}>
            Individuels
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles(theme).tab, activeTab === 'groups' && styles(theme).tabActive]}
          onPress={() => setActiveTab('groups')}>
          <MaterialIcons name="group" size={16} color={activeTab === 'groups' ? theme.primary : Neutral[500]} />
          <Text style={[styles(theme).tabText, activeTab === 'groups' && styles(theme).tabTextActive]}>
            Groupes {groupChats.length > 0 ? `(${groupChats.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Recherche */}
      <View style={styles(theme).searchContainer}>
        <MaterialIcons name="search" size={20} color={Neutral[400]} style={{marginRight: 8}} />
        <TextInput
          placeholder="Rechercher..."
          placeholderTextColor={Neutral[400]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles(theme).searchInput}
        />
      </View>

      {/* Liste selon l'onglet actif */}
      {activeTab === 'messages' ? (
        <FlatList
          data={filteredConversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.otherUserId}
          contentContainerStyle={styles(theme).list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles(theme).emptyContainer}>
              <Text style={styles(theme).emptyText}>Aucune conversation</Text>
              <Text style={styles(theme).emptySubtext}>
                {searchQuery ? 'Aucun résultat trouvé' : 'Commencez à discuter avec vos contacts GoodFriends'}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredGroups}
          renderItem={renderGroup}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles(theme).list}
          ListEmptyComponent={
            <View style={styles(theme).emptyContainer}>
              <MaterialIcons name="group" size={48} color={Neutral[300]} />
              <Text style={styles(theme).emptyText}>Aucun groupe</Text>
              <Text style={styles(theme).emptySubtext}>
                {searchQuery ? 'Aucun résultat trouvé' : 'Créez un groupe pour discuter avec plusieurs contacts'}
              </Text>
              <TouchableOpacity style={styles(theme).createGroupBtn} onPress={handleNewGroup}>
                <MaterialIcons name="group-add" size={18} color="#FFF" />
                <Text style={styles(theme).createGroupBtnText}>Créer un groupe</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles(theme).fab}
        onPress={activeTab === 'messages' ? handleNewMessage : handleNewGroup}
        activeOpacity={0.85}>
        <MaterialIcons name={activeTab === 'messages' ? 'edit' : 'group-add'} size={22} color="#FFF" />
        <Text style={styles(theme).fabLabel}>
          {activeTab === 'messages' ? 'Nouveau message' : 'Nouveau groupe'}
        </Text>
      </TouchableOpacity>

      {/* Modal nouveau message (1-à-1) */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={styles(theme).modalContent}>
            <View style={styles(theme).modalHeader}>
              <Text style={styles(theme).modalTitle}>Choisir un contact</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles(theme).closeButton}>
                <MaterialIcons name="close" size={22} color={Neutral[500]} />
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
                      <Image source={{ uri: item.photo }} style={styles(theme).contactAvatar} />
                    ) : (
                      <View style={styles(theme).contactAvatarPlaceholder}>
                        <Text style={styles(theme).contactAvatarText}>
                          {item.firstName.charAt(0)}{item.lastName.charAt(0)}
                        </Text>
                      </View>
                    )}
                    <View style={styles(theme).contactInfo}>
                      <Text style={styles(theme).contactName}>{item.firstName} {item.lastName}</Text>
                      <Text style={styles(theme).contactEmail}>{item.email}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Modal créer un groupe */}
      <Modal
        visible={showCreateGroupModal}
        animationType="slide"
        transparent={true}
        statusBarTranslucent={true}
        onRequestClose={() => setShowCreateGroupModal(false)}>
        <View style={styles(theme).modalContainer}>
          <View style={[styles(theme).modalContent, { paddingBottom: 24 }]}>
            <View style={styles(theme).modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  if (groupStep === 2) setGroupStep(1);
                  else setShowCreateGroupModal(false);
                }}>
                <MaterialIcons name={groupStep === 2 ? 'arrow-back' : 'close'} size={22} color={Neutral[500]} />
              </TouchableOpacity>
              <Text style={styles(theme).modalTitle}>
                {groupStep === 1 ? 'Sélectionner des contacts' : 'Nommer le groupe'}
              </Text>
              {groupStep === 1 ? (
                <TouchableOpacity
                  onPress={() => {
                    if (selectedContactIds.length < 1) {
                      Alert.alert('', 'Sélectionnez au moins 1 contact');
                      return;
                    }
                    setGroupStep(2);
                  }}
                  style={[styles(theme).nextBtn, selectedContactIds.length < 1 && { opacity: 0.4 }]}>
                  <Text style={styles(theme).nextBtnText}>Suivant</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 60 }} />
              )}
            </View>

            {groupStep === 1 ? (
              loadingAllContacts ? (
                <ActivityIndicator size="large" style={styles(theme).modalLoading} />
              ) : allLocalContacts.length === 0 ? (
                <View style={styles(theme).modalEmpty}>
                  <MaterialIcons name="group" size={40} color={Neutral[300]} />
                  <Text style={[styles(theme).emptyText, { marginTop: 12 }]}>Aucun ami GoodFriends</Text>
                  <Text style={styles(theme).emptySubtext}>
                    Seuls vos contacts ayant un compte GoodFriends peuvent rejoindre un groupe de conversation.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles(theme).selectionCount}>
                    {selectedContactIds.length} contact{selectedContactIds.length > 1 ? 's' : ''} sélectionné{selectedContactIds.length > 1 ? 's' : ''}
                  </Text>
                  <FlatList
                    data={allLocalContacts}
                    keyExtractor={item => item.id}
                    style={{ maxHeight: 400 }}
                    renderItem={({ item }) => {
                      const selected = selectedContactIds.includes(item.id);
                      return (
                        <TouchableOpacity
                          style={[styles(theme).contactItem, selected && styles(theme).contactItemSelected]}
                          onPress={() => toggleContactSelection(item.id)}>
                          <View style={[styles(theme).contactAvatarPlaceholder, selected && { backgroundColor: theme.primary }]}>
                            <Text style={styles(theme).contactAvatarText}>
                              {item.firstName.charAt(0)}{item.lastName.charAt(0)}
                            </Text>
                          </View>
                          <View style={styles(theme).contactInfo}>
                            <Text style={styles(theme).contactName}>{item.firstName} {item.lastName}</Text>
                            {item.email && <Text style={styles(theme).contactEmail}>{item.email}</Text>}
                          </View>
                          <MaterialIcons
                            name={selected ? 'check-circle' : 'radio-button-unchecked'}
                            size={22}
                            color={selected ? theme.primary : Neutral[400]}
                          />
                        </TouchableOpacity>
                      );
                    }}
                  />
                </>
              )
            ) : (
              <View style={{ padding: Spacing.base }}>
                <Text style={styles(theme).groupNameLabel}>Nom du groupe *</Text>
                <TextInput
                  style={styles(theme).groupNameInput}
                  placeholder="Ex: Famille, Amis du lycée..."
                  placeholderTextColor={Neutral[400]}
                  value={groupName}
                  onChangeText={setGroupName}
                  autoFocus
                  maxLength={60}
                />
                <Text style={styles(theme).groupMembersHint}>
                  {selectedContactIds.length} membre{selectedContactIds.length > 1 ? 's' : ''} :{'  '}
                  {selectedContactIds.map(id => {
                    const c = allLocalContacts.find(x => x.id === id);
                    return c ? c.firstName : '';
                  }).join(', ')}
                </Text>
                <TouchableOpacity
                  style={[styles(theme).createGroupConfirmBtn, !groupName.trim() && { opacity: 0.5 }]}
                  onPress={handleCreateGroup}
                  disabled={!groupName.trim()}>
                  <MaterialIcons name="group-add" size={20} color="#FFF" />
                  <Text style={styles(theme).createGroupConfirmText}>Créer le groupe</Text>
                </TouchableOpacity>
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
    backgroundColor: Neutral[50],
  },
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
    overflow: 'visible',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.title,
    color: '#FFF',
  },
  headerSubtitle: {
    ...Typography.bodyMd,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Neutral[0],
    margin: Spacing.base,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    ...Shadow.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Neutral[800],
    paddingVertical: 0,
  },
  list: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  unreadItem: {
    backgroundColor: theme.background,
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    color: '#FFF',
    ...Typography.titleMd,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  conversationName: {
    ...Typography.titleSm,
    color: Neutral[800],
    flex: 1,
    marginRight: Spacing.sm,
  },
  timeText: {
    ...Typography.label,
    color: Neutral[500],
  },
  conversationBottom: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    ...Typography.bodyMd,
    color: Neutral[500],
    flex: 1,
    marginRight: Spacing.sm,
  },
  badgeContainer: {
    backgroundColor: theme.primary,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#FFF',
    ...Typography.label,
    fontWeight: '700',
  },
  rightContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 10,
  },
  badge: {
    backgroundColor: theme.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xxxl,
  },
  emptyText: {
    ...Typography.titleMd,
    color: Neutral[700],
    marginBottom: Spacing.sm,
  },
  emptySubtext: {
    ...Typography.body,
    color: Neutral[500],
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 88,
    backgroundColor: theme.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    borderRadius: Radius.full,
    ...Shadow.md,
    gap: 6,
  },
  fabLabel: {
    color: '#FFF',
    ...Typography.label,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.50)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Neutral[0],
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    maxHeight: '80%',
    paddingBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  modalTitle: {
    ...Typography.titleMd,
    color: Neutral[900],
  },
  closeButton: {
    padding: 4,
  },
  modalLoading: {
    marginTop: 40,
  },
  modalEmpty: {
    padding: Spacing.xxxl,
    alignItems: 'center',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  contactAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: Spacing.md,
  },
  contactAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  contactAvatarText: {
    color: '#FFF',
    ...Typography.titleMd,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    ...Typography.titleSm,
    color: Neutral[800],
    marginBottom: 3,
  },
  contactEmail: {
    ...Typography.bodyMd,
    color: Neutral[600],
  },
  contactItemSelected: {
    backgroundColor: theme.primary + '18',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.primary,
  },
  tabText: {
    ...Typography.label,
    color: Neutral[500],
    fontWeight: '600',
  },
  tabTextActive: {
    color: theme.primary,
  },
  createGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    borderRadius: Radius.full,
    marginTop: Spacing.xl,
  },
  createGroupBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  nextBtn: {
    backgroundColor: theme.primary,
    paddingHorizontal: Spacing.base,
    paddingVertical: 7,
    borderRadius: Radius.full,
  },
  nextBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  selectionCount: {
    ...Typography.label,
    color: Neutral[500],
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    backgroundColor: Neutral[50],
  },
  groupNameLabel: {
    ...Typography.label,
    color: Neutral[600],
    marginBottom: 8,
    fontWeight: '600',
  },
  groupNameInput: {
    borderWidth: 1,
    borderColor: Neutral[300],
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Neutral[900],
    marginBottom: Spacing.base,
  },
  groupMembersHint: {
    ...Typography.bodyMd,
    color: Neutral[500],
    marginBottom: Spacing.xl,
  },
  createGroupConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    paddingVertical: 14,
    borderRadius: Radius.md,
  },
  createGroupConfirmText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
});

export default ConversationsScreen;
