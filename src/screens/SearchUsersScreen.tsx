import React, {useState, useMemo} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Image,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography} from '../theme/designSystem';
import FriendRequestService, {GoodFriendsUser} from '../services/FriendRequestService';

interface SearchUsersScreenProps {
  navigation: any;
}

const SearchUsersScreen: React.FC<SearchUsersScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const S = useMemo(() => styles(theme), [theme]);
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
        <View style={S.statusContainer}>
          <Text style={S.statusText}>En attente</Text>
        </View>
      );
    } else if (user.requestStatus === 'accepted') {
      return (
        <View style={S.statusContainer}>
          <Text style={S.statusTextAccepted}>Déjà ami</Text>
        </View>
      );
    } else {
      return (
        <TouchableOpacity
          style={S.addButton}
          onPress={() => handleSendRequest(user.id, `${user.firstName} ${user.lastName}`)}>
          <Text style={S.addButtonText}>+ Ajouter</Text>
        </TouchableOpacity>
      );
    }
  };

  const renderUser = ({item}: {item: GoodFriendsUser}) => (
    <View style={S.userItem}>
      <View style={S.userInfo}>
        {item.photo ? (
          <Image source={{uri: item.photo}} style={S.avatar} />
        ) : (
          <View style={[S.avatar, S.avatarPlaceholder]}>
            <Text style={S.avatarText}>
              {item.firstName?.charAt(0)}{item.lastName?.charAt(0)}
            </Text>
          </View>
        )}
        <View style={S.userDetails}>
          <Text style={S.userName}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={S.userEmail}>{item.email}</Text>
          {item.phone && <Text style={S.userPhone}>{item.phone}</Text>}
        </View>
      </View>
      {getStatusButton(item)}
    </View>
  );

  return (
    <View style={S.root}>
      <StatusBar barStyle="light-content" backgroundColor={theme.primary} />
      {/* ── Header ── */}
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backButton}>
          <MaterialIcons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={S.headerContent}>
          <Text style={S.title}>Rechercher des amis</Text>
          <Text style={S.subtitle}>Par email ou numéro de téléphone</Text>
        </View>
      </View>

      {/* ── Barre de recherche ── */}
      <View style={S.searchBar}>
        <MaterialIcons name="search" size={20} color={Neutral[400]} style={{marginRight: 8}} />
        <TextInput
          style={S.searchInput}
          placeholder="Email ou téléphone..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor={Neutral[400]}
          autoCapitalize="none"
          keyboardType="email-address"
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={S.searchButton}
          onPress={handleSearch}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={S.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={S.loadingText}>Recherche en cours...</Text>
        </View>
      ) : searched ? (
        users.length > 0 ? (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            contentContainerStyle={S.listContainer}
          />
        ) : (
          <View style={S.emptyContainer}>
            <MaterialIcons name="person-search" size={56} color={Neutral[300]} />
            <Text style={S.emptyTitle}>Aucun résultat</Text>
            <Text style={S.emptySubtitle}>
              Essayez avec un autre email ou numéro de téléphone
            </Text>
          </View>
        )
      ) : (
        <View style={S.emptyContainer}>
          <MaterialIcons name="group-add" size={56} color={Neutral[300]} />
          <Text style={S.emptyTitle}>Trouvez vos amis</Text>
          <Text style={S.emptySubtitle}>
            Entrez un email ou un numéro de téléphone pour commencer
          </Text>
        </View>
      )}
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
  subtitle: {
    ...Typography.bodyMd,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  // ── Search bar ──
  searchBar: {
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
    marginLeft: Spacing.sm,
  },
  searchButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── States ──
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.sm,
    ...Typography.body,
    color: Neutral[500],
  },
  listContainer: {
    padding: Spacing.base,
    paddingBottom: 40,
  },
  // ── User item ──
  userItem: {
    backgroundColor: Neutral[0],
    padding: Spacing.base,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...Shadow.sm,
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
    marginRight: Spacing.md,
  },
  avatarPlaceholder: {
    backgroundColor: theme.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFF',
    ...Typography.titleSm,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    ...Typography.titleSm,
    color: Neutral[800],
    marginBottom: 2,
  },
  userEmail: {
    ...Typography.bodyMd,
    color: Neutral[500],
  },
  userPhone: {
    ...Typography.bodyMd,
    color: Neutral[400],
    marginTop: 2,
  },
  addButton: {
    backgroundColor: theme.primary,
    paddingHorizontal: Spacing.base,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  addButtonText: {
    color: '#FFF',
    ...Typography.label,
    fontWeight: '700',
  },
  statusContainer: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Neutral[100],
  },
  statusText: {
    color: '#F57C00',
    ...Typography.label,
    fontWeight: '600',
  },
  statusTextAccepted: {
    color: '#4CAF50',
    ...Typography.label,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    ...Typography.titleMd,
    color: Neutral[700],
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    ...Typography.body,
    color: Neutral[500],
    textAlign: 'center',
  },
});

export default SearchUsersScreen;
