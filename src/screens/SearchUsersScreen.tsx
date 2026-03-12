import React, {useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import FriendRequestService, {GoodFriendsUser} from '../services/FriendRequestService';

interface SearchUsersScreenProps {
  navigation: any;
}

const SearchUsersScreen: React.FC<SearchUsersScreenProps> = ({navigation}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<GoodFriendsUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un email ou un numéro de téléphone');
      return;
    }

    setLoading(true);
    try {
      const results = await FriendRequestService.searchUsers(searchQuery);
      setUsers(results);
      setSearched(true);
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible de rechercher des utilisateurs');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRequest = async (userId: string, userName: string) => {
    Alert.alert(
      'Envoyer une demande',
      `Voulez-vous envoyer une demande d'ami à ${userName} ?`,
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Envoyer',
          onPress: async () => {
            try {
              await FriendRequestService.sendFriendRequest(userId);
              Alert.alert('Succès', 'Demande envoyée avec succès');
              // Rafraîchir la recherche pour mettre à jour le statut
              handleSearch();
            } catch (error: any) {
              Alert.alert('Erreur', error.message || 'Impossible d\'envoyer la demande');
            }
          },
        },
      ]
    );
  };

  const getStatusButton = (user: GoodFriendsUser) => {
    if (user.requestStatus === 'pending') {
      return (
        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>En attente</Text>
        </View>
      );
    } else if (user.requestStatus === 'accepted') {
      return (
        <View style={styles.statusContainer}>
          <Text style={styles.statusTextAccepted}>Déjà ami</Text>
        </View>
      );
    } else {
      return (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => handleSendRequest(user.id, `${user.firstName} ${user.lastName}`)}>
          <Text style={styles.addButtonText}>+ Ajouter</Text>
        </TouchableOpacity>
      );
    }
  };

  const renderUser = ({item}: {item: GoodFriendsUser}) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        {item.photo ? (
          <Image source={{uri: item.photo}} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {item.firstName?.charAt(0)}{item.lastName?.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles.userDetails}>
          <Text style={styles.userName}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={styles.userEmail}>{item.email}</Text>
          {item.phone && <Text style={styles.userPhone}>{item.phone}</Text>}
        </View>
      </View>
      {getStatusButton(item)}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rechercher des utilisateurs</Text>
        <Text style={styles.subtitle}>
          Recherchez vos amis par email ou numéro de téléphone
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Email ou téléphone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TouchableOpacity
          style={styles.searchButton}
          onPress={handleSearch}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.searchButtonText}>🔍 Rechercher</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Recherche en cours...</Text>
        </View>
      ) : searched ? (
        users.length > 0 ? (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            contentContainerStyle={styles.listContainer}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>😔</Text>
            <Text style={styles.emptyTitle}>Aucun résultat</Text>
            <Text style={styles.emptySubtitle}>
              Essayez avec un autre email ou numéro de téléphone
            </Text>
          </View>
        )
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>🔍</Text>
          <Text style={styles.emptyTitle}>Recherchez des amis</Text>
          <Text style={styles.emptySubtitle}>
            Entrez un email ou un numéro de téléphone pour commencer
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  searchContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  searchButton: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  listContainer: {
    padding: 15,
  },
  userItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  avatarPlaceholder: {
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 3,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  userPhone: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statusContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFF3E0',
  },
  statusText: {
    color: '#F57C00',
    fontSize: 14,
    fontWeight: '600',
  },
  statusTextAccepted: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

export default SearchUsersScreen;
