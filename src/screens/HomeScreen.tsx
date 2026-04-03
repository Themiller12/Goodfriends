import React, {useState, useEffect, useMemo, useRef} from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Dimensions,
  ScrollView,
  Image,
  BackHandler,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, {Line} from 'react-native-svg';
import {GestureDetector, Gesture} from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedReaction,
  withDecay,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import {Platform} from 'react-native';
import {Contact, GraphNode, GraphLink, ContactGroup, RelationType} from '../types';
import {Neutral, Radius, Shadow, Spacing, Typography} from '../theme/designSystem';
import StorageService from '../services/StorageService';
import ContactService from '../services/ContactService';
import CacheService from '../services/CacheService';
import MessageService from '../services/MessageService';
import FriendRequestService from '../services/FriendRequestService';
import OnlineStatusService from '../services/OnlineStatusService';
import OnlineIndicator from '../components/OnlineIndicator';
import {useTheme} from '../context/ThemeContext';

interface HomeScreenProps {
  navigation: any;
}

const {width, height} = Dimensions.get('window');

const HomeScreen: React.FC<HomeScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [rotationY, setRotationY] = useState(0);
  const [rotationX, setRotationX] = useState(0);
  const rotYShared = useSharedValue(0);
  const rotXShared = useSharedValue(0);
  const startRotYShared = useSharedValue(0);
  const startRotXShared = useSharedValue(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [onlineStatuses, setOnlineStatuses] = useState<Record<string, boolean>>({});

  useAnimatedReaction(
    () => [rotXShared.value, rotYShared.value] as [number, number],
    ([nextX, nextY]) => {
      runOnJS(setRotationX)(nextX);
      runOnJS(setRotationY)(nextY);
    },
  );

  useEffect(() => {
    loadContacts();
    loadGroups();
    loadUnreadCount();
    const unsubscribe = navigation.addListener('focus', () => {
      loadContacts();
      loadGroups();
      loadUnreadCount();
    });
    
    // Polling pour le nombre de messages non lus et les demandes d'ami toutes les 5 secondes
    const interval = setInterval(() => {
      loadUnreadCount();
      checkFriendRequests();
    }, 5000);
    
    // Gérer le bouton retour Android sur l'écran Home
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.isFocused()) return false;
      Alert.alert(
        'Quitter l\'application',
        'Voulez-vous vraiment quitter GoodFriends ?',
        [
          {text: 'Annuler', style: 'cancel', onPress: () => {}},
          {text: 'Quitter', style: 'destructive', onPress: () => BackHandler.exitApp()},
        ],
        {cancelable: true}
      );
      return true; // Empêche le comportement par défaut
    });
    
    return () => {
      unsubscribe();
      clearInterval(interval);
      backHandler.remove();
    };
  }, [navigation]);

  useEffect(() => {
    AsyncStorage.getItem('@default_view_mode').then(saved => {
      if (saved === 'graph' || saved === 'list') {
        setViewMode(saved as 'graph' | 'list');
      }
    });
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = contacts.filter(
        contact =>
          contact.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          contact.lastName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      setFilteredContacts(filtered);
    } else {
      setFilteredContacts(contacts);
    }
  }, [searchQuery, contacts]);

  

  const loadContacts = async () => {
    // Affichage instantané depuis le cache
    const cached = await CacheService.getCachedContacts();
    if (cached && cached.length > 0) {
      setContacts(cached);
      setFilteredContacts(cached);
    }
    // Rafraîchissement en fond
    await CacheService.invalidateCache('contacts');
    const loadedContacts = await StorageService.getContacts();
    setContacts(loadedContacts);
    setFilteredContacts(loadedContacts);
  };

  useEffect(() => {
    const ids = contacts
      .map(c => c.goodfriendsUserId)
      .filter((id): id is string => !!id);
    if (ids.length > 0) {
      OnlineStatusService.getStatuses(ids).then(setOnlineStatuses);
    }
  }, [contacts]);

  const loadGroups = async () => {
    const loadedGroups = await StorageService.getGroups();
    setGroups(loadedGroups);
  };

  const toggleGroupVisibility = (groupId: string) => {
    setHiddenGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const loadUnreadCount = async () => {
    try {
      // Vérifier si l'utilisateur est authentifié avant d'appeler l'API
      const userStr = await AsyncStorage.getItem('@current_user');
      if (!userStr) {
        console.log('[HomeScreen] User not authenticated (@current_user not found), skipping unread count');
        return;
      }
      console.log('[HomeScreen] Loading unread count...');
      const count = await MessageService.getUnreadCount();
      console.log(`[HomeScreen] Unread count: ${count}`);
      setUnreadCount(count);
    } catch (error) {
      // Ignorer les erreurs silencieusement (notamment 401 si non authentifié)
      console.log('[HomeScreen] Erreur chargement messages non lus:', error);
    }
  };

  const checkFriendRequests = async () => {
    try {
      // Vérifier si l'utilisateur est authentifié avant d'appeler l'API
      const userStr = await AsyncStorage.getItem('@current_user');
      if (!userStr) {
        return;
      }
      await FriendRequestService.checkNewFriendRequests();
    } catch (error) {
      // Ignorer les erreurs silencieusement
      console.log('Erreur vérification demandes ami:', error);
    }
  };

  const calcChildAge = (dateOfBirth?: Date): string | null => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let years = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years--;
    if (years < 1) {
      let months = today.getMonth() - birth.getMonth() + (today.getFullYear() - birth.getFullYear()) * 12;
      if (today.getDate() < birth.getDate()) months--;
      return months <= 0 ? null : `${months} mois`;
    }
    return `${years} ans`;
  };

  const buildSummary = (contact: Contact): string => {
    try {
      // Résumé = détails uniquement (le nom est géré par le titre / l'en-tête photo)
      let summary = '';

      // Âge : champ direct ou calculé depuis la date de naissance
      const age = contact.age || (contact.dateOfBirth ? (() => {
        const today = new Date();
        const dob = new Date(contact.dateOfBirth as unknown as string);
        let y = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) y--;
        return y >= 0 ? y : null;
      })() : null);

      if (age) {
        summary += `A ${age} ans`;
      }

      const children = Array.isArray(contact.children) ? contact.children : [];
      if (children.length > 0) {
        const childLabel = `${children.length} enfant${children.length > 1 ? 's' : ''}`;
        summary += summary ? `, ${childLabel}` : childLabel.charAt(0).toUpperCase() + childLabel.slice(1);
        const childNames = children.map(c => {
          const a = calcChildAge(c.dateOfBirth ? new Date(c.dateOfBirth) : undefined);
          return a ? `${c.firstName} (${a})` : c.firstName;
        }).join(', ');
        summary += ` : ${childNames}`;
      }

      const relationships = Array.isArray(contact.relationships) ? contact.relationships : [];

      const childContacts = relationships
        .filter(r => r.relationType === RelationType.CHILD)
        .map(r => contacts.find(c => String(c.id) === String(r.contactId)))
        .filter((c): c is Contact => c !== undefined);

      if (childContacts.length > 0) {
        if (children.length === 0) {
          const cl = `${childContacts.length} enfant${childContacts.length > 1 ? 's' : ''}`;
          summary += summary ? `, ${cl}` : cl.charAt(0).toUpperCase() + cl.slice(1);
        } else {
          summary += ` (et ${childContacts.length} autre${childContacts.length > 1 ? 's' : ''})`;
        }
        summary += ` : ${childContacts.map(c => {
          const a = c.age ? `${c.age} ans` : calcChildAge(c.dateOfBirth ? new Date(c.dateOfBirth as unknown as string) : undefined);
          return a ? `${c.firstName} (${a})` : c.firstName;
        }).join(', ')}`;
      }

      const spouseRel = relationships.find(r => r.relationType === RelationType.SPOUSE);
      if (spouseRel) {
        const spouse = contacts.find(c => String(c.id) === String(spouseRel.contactId));
        if (spouse) {
          const spouseText = `Conjoint\u00b7e : ${spouse.firstName}`;
          summary += summary ? `\n${spouseText}` : spouseText;
        }
      }

      if (contact.allergies) {
        summary += summary ? `\n\nAllergies : ${contact.allergies}` : `Allergies : ${contact.allergies}`;
      }

      const travels = Array.isArray(contact.travels) ? contact.travels : [];
      if (travels.length > 0) {
        summary += summary ? `\n\nVoyages : ${travels.join(', ')}` : `Voyages : ${travels.join(', ')}`;
      }

      // Profession / études
      const profs = Array.isArray((contact as any).professionsStudies) ? (contact as any).professionsStudies : [];
      if (profs.length > 0) {
        const profTitles = profs.map((p: any) => p.year ? `${p.title} (${p.year})` : p.title).join(', ');
        summary += summary ? `\n${profTitles}` : profTitles;
      }

      if (contact.notes) {
        summary += summary ? `\n\nNote :\n${contact.notes}` : `Note :\n${contact.notes}`;
      }

      if (__DEV__) {
        console.log('[HomeScreen][buildSummary] result', {
          contactId: contact.id,
          hasPhoto: !!contact.photo,
          firstName: contact.firstName,
          lastName: contact.lastName,
          summaryLength: summary.length,
          summaryPreview: summary.slice(0, 120),
        });
      }

      return summary || 'Aucune information complémentaire.';
    } catch (_e) {
      if (__DEV__) {
        console.log('[HomeScreen][buildSummary] error fallback', {
          contactId: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
        });
      }
      return 'Aucune information complémentaire.';
    }
  };

  const handleContactPress = async (contact: Contact) => {
    // Naviguer directement vers le profil du contact
    navigation.navigate('ContactProfile', {contactId: contact.id});

    // Rafraîchir en arrière-plan
    try {
      await CacheService.invalidateCache('contacts');
      const freshContacts = await StorageService.getContacts();
      setContacts(freshContacts);
      setFilteredContacts(freshContacts);
    } catch (error) {
      console.log('[HomeScreen] Erreur refresh contacts:', error);
    }
  };

  // Générer les positions 3D fixes sur une sphère (une seule fois par liste de contacts)
  const sphereNodes = useMemo(() => {
    const contactsByGroup: {[key: string]: Contact[]} = {};
    const noGroupContacts: Contact[] = [];

    filteredContacts.forEach(contact => {
      if (contact.groupIds && contact.groupIds.length > 0) {
        const groupId = contact.groupIds[0];
        // Ne pas inclure les contacts des groupes masqués
        if (!hiddenGroups.has(groupId)) {
          if (!contactsByGroup[groupId]) {
            contactsByGroup[groupId] = [];
          }
          contactsByGroup[groupId].push(contact);
        }
      } else {
        noGroupContacts.push(contact);
      }
    });

    let allContactsWithGroups: {contact: Contact; groupId: string | null; groupColor: string}[] = [];
    
    Object.entries(contactsByGroup).forEach(([groupId, groupContacts]) => {
      const group = groups.find(g => g.id === groupId);
      const groupColor = group?.color || '#4CAF50';
      groupContacts.forEach(contact => {
        allContactsWithGroups.push({
          contact,
          groupId,
          groupColor,
        });
      });
    });
    
    noGroupContacts.forEach(contact => {
      allContactsWithGroups.push({
        contact,
        groupId: null,
        groupColor: '#4CAF50',
      });
    });

    // Placer les bulles sur une sphère
    const bubbleMinSize = 74;
    const bubbleMaxSize = 102;
    const sphereRadius = Math.min(width, height) * 0.35;
    
    const nodes: (GraphNode & {groupColor: string; size: number; x3d: number; y3d: number; z3d: number})[] = [];
    
    allContactsWithGroups.forEach(({contact, groupColor}, index) => {
      const size = bubbleMinSize + Math.random() * (bubbleMaxSize - bubbleMinSize);
      
      // Distribution de Fibonacci sur une sphère pour un placement uniforme
      const goldenRatio = (1 + Math.sqrt(5)) / 2;
      const theta = 2 * Math.PI * index / goldenRatio;
      const phi = Math.acos(1 - 2 * (index + 0.5) / allContactsWithGroups.length);
      
      const x3d = sphereRadius * Math.sin(phi) * Math.cos(theta);
      const y3d = sphereRadius * Math.sin(phi) * Math.sin(theta);
      const z3d = sphereRadius * Math.cos(phi);
      
      nodes.push({
        ...contact,
        position: {x: x3d, y: y3d},
        groupColor: groupColor,
        size,
        x3d,
        y3d,
        z3d,
      });
    });
    
    return nodes;
  }, [filteredContacts, groups, hiddenGroups, theme]);

  const renderGraphView = () => {
    // Fonction de projection 3D vers 2D avec rotation
    const project3D = (x3d: number, y3d: number, z3d: number) => {
      // Rotation autour de l'axe X (vertical)
      const cosX = Math.cos(rotationX);
      const sinX = Math.sin(rotationX);
      
      const y1 = y3d * cosX - z3d * sinX;
      const z1 = y3d * sinX + z3d * cosX;
      
      // Rotation autour de l'axe Y (horizontal)
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      
      const xRotated = x3d * cosY + z1 * sinY;
      const zRotated = -x3d * sinY + z1 * cosY;
      
      // Projection perspective
      const perspective = 800;
      const scale = perspective / (perspective + zRotated);
      
      return {
        x: width / 2 + xRotated * scale,
        y: (height * 0.35) + y1 * scale,
        scale: Math.max(0.4, Math.min(1.2, scale)),
        z: zRotated,
      };
    };

    // Projeter tous les nodes et trier par profondeur (du plus loin au plus proche)
    const projectedNodes = sphereNodes.map(node => ({
      ...node,
      projected: project3D(node.x3d, node.y3d, node.z3d),
    })).sort((a, b) => a.projected.z - b.projected.z);

    // Créer les liens entre contacts ayant des relations
    const links: GraphLink[] = [];
    projectedNodes.forEach(node => {
      if (node.relationships && node.relationships.length > 0) {
        node.relationships.forEach(rel => {
          const targetNode = projectedNodes.find(n => n.id === rel.contactId);
          if (targetNode) {
            links.push({
              source: node.id,
              target: rel.contactId,
              relationType: rel.relationType,
            });
          }
        });
      }
    });

    return (
      <View style={styles.graphContainer}>
        {/* Dessiner les liens */}
        <Svg height={height} width={width} style={styles.svgContainer}>
            {links.map((link, index) => {
              const sourceNode = projectedNodes.find(n => n.id === link.source);
              const targetNode = projectedNodes.find(n => n.id === link.target);
              
              if (sourceNode && targetNode) {
                return (
                  <Line
                    key={`${link.source}-${link.target}-${index}`}
                    x1={sourceNode.projected.x}
                    y1={sourceNode.projected.y}
                    x2={targetNode.projected.x}
                    y2={targetNode.projected.y}
                    stroke="rgba(144,202,249,0.6)"
                    strokeWidth="1.2"
                    opacity="0.8"
                  />
                );
              }
              return null;
            })}
          </Svg>

          {/* Dessiner les bulles */}
          {projectedNodes.map((node) => {
            const size = node.size * node.projected.scale;
            const opacity = 0.45 + node.projected.scale * 0.55;
            const borderSz = Math.max(2, size * 0.045);
            return (
              <TouchableOpacity
                key={node.id}
                style={[
                  styles.bubble,
                  {
                    left: node.projected.x - size / 2,
                    top: node.projected.y - size / 2,
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: node.groupColor,
                    opacity,
                    borderWidth: borderSz,
                    borderColor: 'rgba(255,255,255,0.45)',
                    shadowColor: node.groupColor,
                    shadowOffset: {width: 0, height: size * 0.06},
                    shadowOpacity: 0.7,
                    shadowRadius: size * 0.25,
                    elevation: Math.round(4 + node.projected.scale * 10),
                  },
                ]}
                onPress={() => handleContactPress(node)}>
                {node.photo ? (
                  <Image source={{uri: node.photo}} style={styles.bubbleImage} />
                ) : (
                  <Text style={[styles.bubbleInitials, {fontSize: size * 0.3}]}>
                    {(node.firstName?.[0] || '').toUpperCase()}{(node.lastName?.[0] || '').toUpperCase()}
                  </Text>
                )}
                {/* Barre de nom en bas */}
                <View style={[styles.bubbleNameBar, {borderBottomLeftRadius: size / 2, borderBottomRightRadius: size / 2}]}>
                  <Text style={[styles.bubbleText, {fontSize: Math.max(7, size / 7.5)}]} numberOfLines={1}>
                    {node.firstName}
                  </Text>
                </View>
                {/* Reflet lumineux */}
                <View style={[
                  styles.bubbleShine,
                  {width: size * 0.38, height: size * 0.22, borderRadius: size * 0.19, top: size * 0.09, left: size * 0.15},
                ]} />
              </TouchableOpacity>
            );
          })}
        </View>
    );
  };

  const renderListView = () => {
    const visibleContacts = filteredContacts.filter(contact => {
      if (!contact.groupIds || contact.groupIds.length === 0) return true;
      return contact.groupIds.every(gid => !hiddenGroups.has(gid));
    });

    const renderListItem = ({item}: {item: Contact}) => {
      const groupId = item.groupIds?.[0];
      const group = groups.find(g => g.id === groupId);
      const initials =
        (item.firstName?.[0] || '').toUpperCase() +
        (item.lastName?.[0] || '').toUpperCase();
      const subtitle = item.age
        ? `${item.age} ans`
        : item.email || item.phone || '';

      return (
        <TouchableOpacity
          style={styles.listItem}
          onPress={() => handleContactPress(item)}
          activeOpacity={0.75}>
          <View style={{position: 'relative'}}>
            {item.photo ? (
              <Image source={{uri: item.photo}} style={styles.listAvatar} />
            ) : (
              <View style={[styles.listAvatarPlaceholder, {backgroundColor: theme.primary + '22'}]}>
                <Text style={[styles.listAvatarInitials, {color: theme.primary}]}>
                  {initials || '?'}
                </Text>
              </View>
            )}
            {item.goodfriendsUserId ? (
              <OnlineIndicator isOnline={onlineStatuses[item.goodfriendsUserId] ?? false} size={13} />
            ) : null}
          </View>
          <View style={styles.listInfo}>
            <Text style={styles.listName}>
              {item.firstName} {item.lastName}
            </Text>
            <View style={styles.listMeta}>
              {group && (
                <View style={[styles.groupBadge, {backgroundColor: (group.color || theme.primary) + '22'}]}>
                  <Text style={[styles.groupBadgeText, {color: group.color || theme.primary}]}>
                    {group.name.toUpperCase()}
                  </Text>
                </View>
              )}
              {subtitle ? (
                <Text style={styles.listSubtitle} numberOfLines={1}>{subtitle}</Text>
              ) : null}
            </View>
          </View>
          {item.goodfriendsUserId ? (
            <TouchableOpacity
              style={styles.listActionBtn}
              onPress={() =>
                navigation.navigate('Chat', {
                  otherUserId: item.goodfriendsUserId,
                  otherUserFirstName: item.firstName,
                  otherUserLastName: item.lastName,
                  otherUserEmail: item.email,
                })
              }>
              <MaterialIcons name="chat-bubble-outline" size={20} color={theme.secondary || theme.primary} />
            </TouchableOpacity>
          ) : (
            <MaterialIcons name="chevron-right" size={22} color={Neutral[300]} />
          )}
        </TouchableOpacity>
      );
    };

    return (
      <FlatList
        data={visibleContacts}
        keyExtractor={item => item.id}
        renderItem={renderListItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="people-outline" size={48} color={Neutral[300]} />
            <Text style={styles.emptyText}>Aucun contact trouvé</Text>
          </View>
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mon Répertoire</Text>
          <Text style={styles.headerSubtitle}>
            {filteredContacts.length} proche{filteredContacts.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => navigation.navigate('Conversations')}>
            <MaterialIcons name="chat-bubble-outline" size={22} color="#383830" />
            {unreadCount > 0 && (
              <View style={[styles.notifBadge, {backgroundColor: theme.primary}]}>
                <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => navigation.navigate('Settings')}>
            <MaterialIcons name="tune" size={22} color="#383830" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={Neutral[400]} style={{marginRight: 8}} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un proche…"
          placeholderTextColor={Neutral[400]}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity
          style={[styles.viewModeToggle, {backgroundColor: theme.primary + '18'}]}
          onPress={() => setViewMode(viewMode === 'graph' ? 'list' : 'graph')}>
          <MaterialIcons
            name={viewMode === 'graph' ? 'format-list-bulleted' : 'bubble-chart'}
            size={20}
            color={theme.primary}
          />
        </TouchableOpacity>
      </View>

      {groups.length > 0 && (
        <View style={styles.legendRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.legendContent}>
            {groups.map(group => {
              const color = group.color || '#4CAF50';
              const isHidden = hiddenGroups.has(group.id);
              return (
                <TouchableOpacity
                  key={group.id}
                  style={[
                    styles.legendItem,
                    {borderColor: color, borderStyle: isHidden ? 'dashed' : 'solid'},
                    isHidden && styles.legendItemHidden,
                  ]}
                  onPress={() => toggleGroupVisibility(group.id)}
                  activeOpacity={0.7}>
                  <View style={[styles.legendDot, {backgroundColor: color}]} />
                  <Text style={[styles.legendText, isHidden && styles.legendTextHidden]}>
                    {group.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {viewMode === 'graph' ? (
        <GestureDetector
          gesture={Gesture.Pan()
            .onBegin(() => {
              cancelAnimation(rotYShared);
              cancelAnimation(rotXShared);
              startRotYShared.value = rotYShared.value;
              startRotXShared.value = rotXShared.value;
            })
            .onUpdate((e) => {
              rotYShared.value = startRotYShared.value + e.translationX * 0.005;
              rotXShared.value = startRotXShared.value - e.translationY * 0.005;
            })
            .onEnd((e) => {
              rotYShared.value = withDecay({velocity: e.velocityX * 0.005, deceleration: 0.993});
              rotXShared.value = withDecay({velocity: -e.velocityY * 0.005, deceleration: 0.993});
            })
          }>
          {renderGraphView()}
        </GestureDetector>
      ) : (
        renderListView()
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddContact')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: Spacing.base,
    backgroundColor: '#fcf9f0',
  },
  headerTitle: {
    ...Typography.title,
    color: '#383830',
    fontSize: 22,
  },
  headerSubtitle: {
    ...Typography.bodySm,
    color: Neutral[500],
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fcf9f0',
  },
  notifBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    ...Shadow.sm,
    gap: 0,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Neutral[800],
    paddingVertical: 0,
  },
  viewModeToggle: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: Spacing.base,
    minHeight: 44,
  },
  legendContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  graphContainer: {
    flex: 1,
    position: 'relative',
  },
  svgContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 0,
  },
  bubble: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    zIndex: 1,
  },
  bubbleImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  bubbleInitials: {
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  bubbleNameBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '36%',
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  bubbleShine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  bubbleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 2,
  },
  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: 96,
    gap: 8,
  },
  listItem: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    ...Shadow.sm,
  },
  listAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: Spacing.md,
  },
  listAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listAvatarInitials: {
    fontSize: 18,
    fontWeight: '700',
  },
  listInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  listName: {
    ...Typography.titleSm,
    color: '#383830',
    marginBottom: 4,
  },
  listMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  groupBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  groupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  listSubtitle: {
    ...Typography.bodySm,
    color: Neutral[500],
  },
  listActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Neutral[100],
    marginLeft: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  emptyText: {
    ...Typography.bodyMd,
    color: Neutral[400],
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 92,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabText: {
    fontSize: 30,
    color: '#fff',
    fontWeight: 'bold',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  legendItemHidden: {
    backgroundColor: 'rgba(240,240,240,0.5)',
    opacity: 0.7,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
  },
  legendTextHidden: {
    color: '#aaa',
  },
  legendEye: {
    fontSize: 11,
  },
  legendEyeHidden: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalInner: {
    width: '85%',
    maxHeight: '85%',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxHeight: '100%',
    flexShrink: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalContainerWithPhoto: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalScrollView: {
    maxHeight: 320,
    minHeight: 0,
    flexShrink: 1,
    marginBottom: 20,
  },
  modalScrollContent: {
    paddingTop: 2,
    paddingBottom: 6,
  },
  modalMessage: {
    fontSize: 16,
    color: '#1f1f1f',
    lineHeight: 24,
  },
  modalCloseIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ebebeb',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  modalCloseIconText: {
    fontSize: 13,
    color: '#555',
    fontWeight: 'bold',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  modalActionButton: {
    flex: 1,
    maxWidth: '50%',
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 3,
  },
  modalActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 0.2,
  },
  modalButtonPrimary: {
    backgroundColor: themeColors.primary,
  },
  modalButtonCall: {
    backgroundColor: '#43a047',
  },
  modalButtonMessage: {
    backgroundColor: '#1e88e5',
  },
  modalButtonSecondary: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalPhotoHeader: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  modalPhotoHeaderImage: {
    width: '100%',
    height: '100%',
  },
  modalPhotoHeaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPhotoHeaderName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
});

export default HomeScreen;

