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
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography, Semantic} from '../theme/designSystem';
import FriendRequestService, {FriendRequest, GoodFriendsUser} from '../services/FriendRequestService';
import StorageService from '../services/StorageService';
import OnlineStatusService from '../services/OnlineStatusService';
import OnlineIndicator from '../components/OnlineIndicator';
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
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, boolean>>({});

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
      const ids = goodFriendsContacts.map(c => c.goodfriendsUserId as string);
      if (ids.length > 0) {
        OnlineStatusService.getStatuses(ids).then(setOnlineStatuses);
      }
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
      onPress={() => navigation.navigate('ContactProfile', {contactId: item.id})}>
      <View style={styles(theme).requestInfo}>
        <View style={{position: 'relative'}}>
          {item.photo ? (
            <Image source={{uri: item.photo}} style={styles(theme).avatar} />
          ) : (
            <View style={[styles(theme).avatar, styles(theme).avatarPlaceholder]}>
              <Text style={styles(theme).avatarText}>
                {item.firstName?.charAt(0)}{item.lastName?.charAt(0)}
              </Text>
            </View>
          )}
          {item.goodfriendsUserId ? (
            <OnlineIndicator isOnline={onlineStatuses[item.goodfriendsUserId] ?? false} size={13} />
          ) : null}
        </View>
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
            <View style={styles(theme).backBtnCircle}>
              <MaterialIcons name="arrow-back" size={22} color="#383830" />
            </View>
          </TouchableOpacity>
          <View>
            <Text style={styles(theme).headerTitle}>Mes amis GoodFriends</Text>
            <Text style={styles(theme).headerSubtitle}>Gérez vos connexions et demandes d’amis</Text>
          </View>
        </View>
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
    backgroundColor: '#fcf9f0',
  },
  header: {
    backgroundColor: '#fcf9f0',
    paddingHorizontal: Spacing.xl,
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
    ...Typography.title,
    color: '#383830',
    fontSize: 20,
  },
  headerSubtitle: {
    ...Typography.bodySm,
    color: '#65655c',
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
    marginTop: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.primary,
  },
  tabText: {
    ...Typography.label,
    fontWeight: '600',
    color: Neutral[500],
  },
  activeTabText: {
    color: theme.primary,
    fontWeight: '700',
  },
  listContent: {
    padding: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  requestCard: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  requestInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: Spacing.md,
  },
  avatarPlaceholder: {
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    ...Typography.titleMd,
  },
  requestDetails: {
    flex: 1,
  },
  requestName: {
    ...Typography.titleSm,
    color: Neutral[800],
    marginBottom: 3,
  },
  requestEmail: {
    ...Typography.bodySm,
    color: Neutral[600],
    marginBottom: 2,
  },
  requestPhone: {
    ...Typography.bodySm,
    color: Neutral[400],
  },
  requestActions: {
    flexDirection: 'row',
    gap: 10,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: Semantic.success,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFF',
    ...Typography.label,
    fontWeight: '700',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: Semantic.error,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#FFF',
    ...Typography.label,
    fontWeight: '700',
  },
  pendingBadge: {
    backgroundColor: Semantic.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  pendingText: {
    color: '#FFF',
    ...Typography.label,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 22,
    color: Neutral[300],
    alignSelf: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.lg,
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
    paddingHorizontal: Spacing.xl,
  },
});

export default MyFriendsScreen;
