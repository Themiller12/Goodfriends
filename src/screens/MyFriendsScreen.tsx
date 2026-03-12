import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import FriendRequestService, {FriendRequest, GoodFriendsUser} from '../services/FriendRequestService';
import StorageService from '../services/StorageService';
import {Contact} from '../types';

interface MyFriendsScreenProps {
  navigation: any;
}

const MyFriendsScreen: React.FC<MyFriendsScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [pendingReceived, setPendingReceived] = useState<FriendRequest[]>([]);
  const [pendingSent, setPendingSent] = useState<GoodFriendsUser[]>([]);
  const [acceptedFriends, setAcceptedFriends] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'received' | 'sent' | 'friends'>('received');

  useEffect(() => {
    loadData();
    
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    
    return unsubscribe;
  }, [navigation]);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadPendingReceived(),
        loadPendingSent(),
        loadAcceptedFriends(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingReceived = async () => {
    try {
      const requests = await FriendRequestService.getPendingRequests();
      setPendingReceived(requests);
    } catch (error) {
      console.error('Error loading pending requests:', error);
    }
  };

  const loadPendingSent = async () => {
    try {
      const sentRequests = await FriendRequestService.getSentRequests();
      setPendingSent(sentRequests);
    } catch (error) {
      console.error('Error loading sent requests:', error);
    }
  };

  const loadAcceptedFriends = async () => {
    try {
      const contacts = await StorageService.getContacts();
      // Filtrer uniquement les contacts qui sont des utilisateurs GoodFriends (ont un goodfriendsUserId)
      const goodFriendsContacts = contacts.filter(c => c.goodfriendsUserId);
      setAcceptedFriends(goodFriendsContacts);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const handleAcceptRequest = async (request: FriendRequest) => {
    const senderName = `${request.firstName} ${request.lastName}`;
    Alert.alert(
      'Accepter la demande',
      `Voulez-vous accepter la demande de ${senderName} ?`,
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Accepter',
          onPress: async () => {
            try {
              await FriendRequestService.acceptFriendRequest(request.id);
              Alert.alert('Succès', `${senderName} a été ajouté à vos contacts.`);
              await loadData();
            } catch (error: any) {
              Alert.alert('Erreur', 'Impossible d\'accepter la demande');
            }
          },
        },
      ]
    );
  };

  const handleRejectRequest = async (request: FriendRequest) => {
    const senderName = `${request.firstName} ${request.lastName}`;
    Alert.alert(
      'Refuser la demande',
      `Voulez-vous refuser la demande de ${senderName} ?`,
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Refuser',
          style: 'destructive',
          onPress: async () => {
            try {
              await FriendRequestService.rejectFriendRequest(request.id);
              Alert.alert('Succès', 'Demande refusée');
              await loadData();
            } catch (error: any) {
              Alert.alert('Erreur', 'Impossible de refuser la demande');
            }
          },
        },
      ]
    );
  };

  const renderReceivedRequest = ({item}: {item: FriendRequest}) => (
    <View style={styles(theme).requestCard}>
      <View style={styles(theme).requestInfo}>
        {item.photo ? (
          <Image source={{uri: item.photo}} style={styles(theme).avatar} />
        ) : (
          <View style={[styles(theme).avatar, styles(theme).avatarPlaceholder]}>
            <Text style={styles(theme).avatarText}>
              {item.firstName?.charAt(0)}{item.lastName?.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles(theme).requestDetails}>
          <Text style={styles(theme).requestName}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={styles(theme).requestEmail}>{item.email}</Text>
          {item.phone && (
            <Text style={styles(theme).requestPhone}>{item.phone}</Text>
          )}
        </View>
      </View>
      <View style={styles(theme).requestActions}>
        <TouchableOpacity
          style={styles(theme).acceptButton}
          onPress={() => handleAcceptRequest(item)}>
          <Text style={styles(theme).acceptButtonText}>Accepter</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles(theme).rejectButton}
          onPress={() => handleRejectRequest(item)}>
          <Text style={styles(theme).rejectButtonText}>Refuser</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSentRequest = ({item}: {item: GoodFriendsUser}) => (
    <View style={styles(theme).requestCard}>
      <View style={styles(theme).requestInfo}>
        {item.photo ? (
          <Image source={{uri: item.photo}} style={styles(theme).avatar} />
        ) : (
          <View style={[styles(theme).avatar, styles(theme).avatarPlaceholder]}>
            <Text style={styles(theme).avatarText}>
              {item.firstName?.charAt(0)}{item.lastName?.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles(theme).requestDetails}>
          <Text style={styles(theme).requestName}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={styles(theme).requestEmail}>{item.email}</Text>
          {item.phone && (
            <Text style={styles(theme).requestPhone}>{item.phone}</Text>
          )}
        </View>
      </View>
      <View style={styles(theme).pendingBadge}>
        <Text style={styles(theme).pendingText}>En attente</Text>
      </View>
    </View>
  );

  const renderFriend = ({item}: {item: Contact}) => (
    <TouchableOpacity
      style={styles(theme).requestCard}
      onPress={() => navigation.navigate('ContactDetail', {contactId: item.id})}>
      <View style={styles(theme).requestInfo}>
        {item.photo ? (
          <Image source={{uri: item.photo}} style={styles(theme).avatar} />
        ) : (
          <View style={[styles(theme).avatar, styles(theme).avatarPlaceholder]}>
            <Text style={styles(theme).avatarText}>
              {item.firstName?.charAt(0)}{item.lastName?.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles(theme).requestDetails}>
          <Text style={styles(theme).requestName}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={styles(theme).requestEmail}>{item.email || 'Pas d\'email'}</Text>
          {item.phone && (
            <Text style={styles(theme).requestPhone}>{item.phone}</Text>
          )}
        </View>
      </View>
      <Text style={styles(theme).chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles(theme).container}>
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <Text style={styles(theme).backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles(theme).headerTitle}>Mes amis GoodFriends</Text>
        </View>
        <Text style={styles(theme).headerSubtitle}>
          Gérez vos connexions et demandes d'amis
        </Text>
      </View>

      <View style={styles(theme).tabContainer}>
        <TouchableOpacity
          style={[
            styles(theme).tab,
            activeTab === 'received' && styles(theme).activeTab,
          ]}
          onPress={() => setActiveTab('received')}>
          <Text
            style={[
              styles(theme).tabText,
              activeTab === 'received' && styles(theme).activeTabText,
            ]}>
            Reçues ({pendingReceived.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles(theme).tab,
            activeTab === 'sent' && styles(theme).activeTab,
          ]}
          onPress={() => setActiveTab('sent')}>
          <Text
            style={[
              styles(theme).tabText,
              activeTab === 'sent' && styles(theme).activeTabText,
            ]}>
            Envoyées ({pendingSent.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles(theme).tab,
            activeTab === 'friends' && styles(theme).activeTab,
          ]}
          onPress={() => setActiveTab('friends')}>
          <Text
            style={[
              styles(theme).tabText,
              activeTab === 'friends' && styles(theme).activeTabText,
            ]}>
            Amis ({acceptedFriends.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'received' && (
        <FlatList
          data={pendingReceived}
          renderItem={renderReceivedRequest}
          keyExtractor={item => item.id}
          contentContainerStyle={styles(theme).listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadData} />
          }
          ListEmptyComponent={
            <View style={styles(theme).emptyContainer}>
              <Text style={styles(theme).emptyIcon}>📨</Text>
              <Text style={styles(theme).emptyText}>Aucune demande reçue</Text>
            </View>
          }
        />
      )}

      {activeTab === 'sent' && (
        <FlatList
          data={pendingSent}
          renderItem={renderSentRequest}
          keyExtractor={item => item.id}
          contentContainerStyle={styles(theme).listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadData} />
          }
          ListEmptyComponent={
            <View style={styles(theme).emptyContainer}>
              <Text style={styles(theme).emptyIcon}>📤</Text>
              <Text style={styles(theme).emptyText}>Aucune demande envoyée</Text>
            </View>
          }
        />
      )}

      {activeTab === 'friends' && (
        <FlatList
          data={acceptedFriends}
          renderItem={renderFriend}
          keyExtractor={item => item.id}
          contentContainerStyle={styles(theme).listContent}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={loadData} />
          }
          ListEmptyComponent={
            <View style={styles(theme).emptyContainer}>
              <Text style={styles(theme).emptyIcon}>👥</Text>
              <Text style={styles(theme).emptyText}>Aucun ami</Text>
              <Text style={styles(theme).emptySubtext}>
                Recherchez des utilisateurs et envoyez des demandes d'amis
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: theme.primary,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 30,
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
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E3F2FD',
    marginTop: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: theme.primary,
  },
  listContent: {
    padding: 15,
  },
  requestCard: {
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
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  requestDetails: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  requestEmail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  requestPhone: {
    fontSize: 12,
    color: '#999',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#f44336',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pendingBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  pendingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  chevron: {
    fontSize: 24,
    color: '#ccc',
    alignSelf: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 15,
  },
  emptyText: {
    fontSize: 18,
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
});

export default MyFriendsScreen;
