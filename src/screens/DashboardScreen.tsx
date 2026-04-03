/**
 * DashboardScreen — Écran d'accueil GoodFriends
 * Inspiré du design Stitch "The Tactile Sanctuary"
 * Prochains anniversaires + rappels pour prendre des nouvelles
 */
import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  Platform,
  BackHandler,
  Alert,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {Contact, Child} from '../types';
import StorageService from '../services/StorageService';
import CacheService from '../services/CacheService';
import MessageService from '../services/MessageService';
import FriendRequestService from '../services/FriendRequestService';
import AuthService from '../services/AuthService';
import {getLastCallDate, invalidateCallCache} from '../services/PhoneActivityService';
import {useTheme} from '../context/ThemeContext';
import {Spacing, Radius, Shadow, Typography} from '../theme/designSystem';
import {Linking} from 'react-native';

// ─── Durée avant laquelle un contact est considéré "à recontacter" ──────────
const REMINDER_THRESHOLD_DAYS = 14;
// Nombre de jours avant anniversaire à afficher dans la section
const BIRTHDAY_LOOKAHEAD_DAYS = 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getDaysUntilBirthday = (dateOfBirth: any): number | null => {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return null;
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const getNextBirthdayAge = (dateOfBirth: any): number | null => {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return null;
  return new Date().getFullYear() - birth.getFullYear() + 1;
};

const daysSince = (date: any): number => {
  if (!date) return 9999;
  const d = new Date(date);
  if (isNaN(d.getTime())) return 9999;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
};

// Retourne la date la plus récente parmi : lastContactedAt, appel natif
// (updatedAt exclu pour ne pas être perturbé par les modifs de groupe etc.)
const bestContactDate = (contact: Contact, callLogMap: Map<string, Date>): Date => {
  const candidates: Date[] = [new Date(contact.createdAt)];
  if (contact.lastContactedAt) candidates.push(new Date(contact.lastContactedAt));
  const callDate = callLogMap.get(contact.id);
  if (callDate) candidates.push(callDate);
  return candidates.reduce((a, b) => (a > b ? a : b));
};

const formatDaysUntil = (days: number): string => {
  if (days === 0) return "Aujourd'hui !";
  if (days === 1) return 'Demain';
  return `Dans ${days} jours`;
};

const formatBirthdayDate = (dateOfBirth: any): string => {
  if (!dateOfBirth) return '';
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return '';
  return birth.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'});
};

// ─── Type entrée anniversaire (contact ou enfant) ───────────────────────────
interface BirthdayEntry {
  id: string;
  firstName: string;
  lastName?: string;
  photo?: string;
  dateOfBirth: any;
  daysUntil: number;
  isChild?: boolean;
  parentName?: string;
  contactId?: string; // pour navigation
}

// ─── Composant avatar ─────────────────────────────────────────────────────────
const AvatarCircle: React.FC<{contact: Contact; size?: number; primaryColor: string}> = ({
  contact,
  size = 56,
  primaryColor,
}) => {
  if (contact.photo) {
    return (
      <Image
        source={{uri: contact.photo}}
        style={{width: size, height: size, borderRadius: size / 2}}
      />
    );
  }
  const initials =
    (contact.firstName?.[0] || '').toUpperCase() +
    (contact.lastName?.[0] || '').toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: primaryColor + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{fontSize: size * 0.35, fontWeight: '700', color: primaryColor}}>
        {initials || '?'}
      </Text>
    </View>
  );
};

// ─── Composant principal ──────────────────────────────────────────────────────
interface DashboardScreenProps {
  navigation: any;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [userName, setUserName] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  // Dates des derniers appels natifs (Android) — key = contact.id
  const [callLogDates, setCallLogDates] = useState<Map<string, Date>>(new Map());

  // ── Chargement données ──────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      // Affichage instantané depuis le cache
      const cached = await CacheService.getCachedContacts();
      if (cached && cached.length > 0) {
        setContacts(cached);
      }
      // Rafraîchissement en fond (invalide le cache pour forcer un appel API)
      await CacheService.invalidateCache('contacts');
      const fresh = await StorageService.getContacts();
      setContacts(fresh);
    } catch (e) {
      console.log('[Dashboard] loadData error:', e);
    }
  }, []);

  const loadUnreadCount = useCallback(async () => {
    try {
      const userStr = await AsyncStorage.getItem('@current_user');
      if (!userStr) return;
      const count = await MessageService.getUnreadCount();
      setUnreadCount(count);
    } catch (_) {}
  }, []);

  const checkFriendRequests = useCallback(async () => {
    try {
      const userStr = await AsyncStorage.getItem('@current_user');
      if (!userStr) return;
      await FriendRequestService.checkNewFriendRequests();
    } catch (_) {}
  }, []);

  // Charge les dates du journal d'appels pour les contacts ayant un numéro
  const loadCallLogDates = useCallback(async (contactList: Contact[]) => {
    const withPhone = contactList.filter(c => !!c.phone);
    if (!withPhone.length) return;
    const entries = await Promise.all(
      withPhone.map(async c => {
        const date = await getLastCallDate(c.phone!);
        return date ? [c.id, date] as [string, Date] : null;
      }),
    );
    const map = new Map<string, Date>();
    entries.forEach(e => { if (e) map.set(e[0], e[1]); });
    setCallLogDates(map);
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      const user = await AuthService.getCurrentUser();
      if (user?.profile?.firstName) setUserName(user.profile.firstName);
    };
    loadUser();
    loadData();
    loadUnreadCount();

    const unsub = navigation.addListener('focus', () => {
      loadData();
      loadUnreadCount();
      checkFriendRequests();
    });

    // Charger les dates d'appels après le premier chargement des contacts
    const unsubAfterLoad = navigation.addListener('focus', () => {
      // Utiliser un léger délai pour ne pas bloquer l'UI
      setTimeout(() => {
        setContacts(prev => { loadCallLogDates(prev); return prev; });
      }, 800);
    });

    const interval = setInterval(() => {
      loadUnreadCount();
      checkFriendRequests();
    }, 5000);

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.isFocused()) return false;
      Alert.alert(
        'Quitter l\'application',
        'Voulez-vous vraiment quitter GoodFriends ?',
        [
          {text: 'Annuler', style: 'cancel'},
          {text: 'Quitter', style: 'destructive', onPress: () => BackHandler.exitApp()},
        ],
        {cancelable: true},
      );
      return true;
    });

    return () => {
      unsub();
      unsubAfterLoad();
      clearInterval(interval);
      backHandler.remove();
    };
  }, [navigation, loadData, loadUnreadCount, checkFriendRequests]);

  // ── Calculs dérivés ─────────────────────────────────────────────────────────
  const upcomingBirthdays = useMemo(() => {
    const entries: BirthdayEntry[] = [];

    contacts.forEach(c => {
      // Contact lui-même
      const days = getDaysUntilBirthday(c.dateOfBirth);
      if (days !== null && days <= BIRTHDAY_LOOKAHEAD_DAYS) {
        entries.push({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          photo: c.photo,
          dateOfBirth: c.dateOfBirth,
          daysUntil: days,
          isChild: false,
          contactId: c.id,
        });
      }

      // Enfants du contact
      (c.children || []).forEach((child: Child) => {
        if (!child.dateOfBirth) return;
        const childDays = getDaysUntilBirthday(child.dateOfBirth);
        if (childDays !== null && childDays <= BIRTHDAY_LOOKAHEAD_DAYS) {
          entries.push({
            id: `${c.id}-${child.id}`,
            firstName: child.firstName,
            dateOfBirth: child.dateOfBirth,
            daysUntil: childDays,
            isChild: true,
            parentName: `${c.firstName} ${c.lastName}`,
            contactId: c.id,
          });
        }
      });
    });

    return entries.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 10);
  }, [contacts]);

  const reminders = useMemo(() => {
    return contacts
      .filter(c => daysSince(bestContactDate(c, callLogDates)) >= REMINDER_THRESHOLD_DAYS)
      .sort((a, b) =>
        daysSince(bestContactDate(b, callLogDates)) - daysSince(bestContactDate(a, callLogDates)),
      )
      .slice(0, 10);
  }, [contacts, callLogDates]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bonjour';
    return 'Bonsoir';
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const openContact = (contactId: string) => {
    navigation.navigate('ContactProfile', {contactId});
  };

  // ─── Rendu section anniversaires ───────────────────────────────────────────
  const renderBirthdayCard = ({item}: {item: BirthdayEntry}) => {
    const age = getNextBirthdayAge(item.dateOfBirth);
    const daysLabel = formatDaysUntil(item.daysUntil);
    const isToday = item.daysUntil === 0;
    const isSoon = item.daysUntil <= 3;
    // Avatar simplifié pour enfants (pas de photo)
    const initials = (item.firstName?.[0] || '').toUpperCase() + (item.lastName?.[0] || (item.isChild ? '👶' : '')).toUpperCase();
    return (
      <TouchableOpacity
        style={[s.birthdayCard, isToday && s.birthdayCardToday]}
        onPress={() => item.contactId && openContact(item.contactId)}
        activeOpacity={0.8}>
        <View style={s.birthdayAvatarWrapper}>
          {item.photo ? (
            <View style={{width: 60, height: 60, borderRadius: 30, overflow: 'hidden'}}>
              <Image source={{uri: item.photo}} style={{width: 60, height: 60}} />
            </View>
          ) : (
            <View style={{width: 60, height: 60, borderRadius: 30, backgroundColor: item.isChild ? '#f7c59f30' : theme.primary + '22', alignItems: 'center', justifyContent: 'center'}}>
              {item.isChild ? (
                <Text style={{fontSize: 26}}>👶</Text>
              ) : (
                <Text style={{fontSize: 21, fontWeight: '700', color: theme.primary}}>{initials || '?'}</Text>
              )}
            </View>
          )}
          {isToday && (
            <View style={[s.birthdayBadge, {backgroundColor: theme.primary}]}>
              <Text style={s.birthdayBadgeText}>🎂</Text>
            </View>
          )}
        </View>
        <Text style={s.birthdayName} numberOfLines={1}>
          {item.firstName}
        </Text>
        {item.isChild && item.parentName && (
          <Text style={[s.birthdayDateSmall, {fontSize: 10}]} numberOfLines={1}>
            Enf. de {item.parentName.split(' ')[0]}
          </Text>
        )}
        <Text
          style={[
            s.birthdayDate,
            isSoon && !isToday && {color: theme.primary, fontWeight: '600'},
            isToday && {color: theme.primary, fontWeight: '700'},
          ]}>
          {isToday ? "Aujourd'hui !" : daysLabel}
        </Text>
        <Text style={s.birthdayDateSmall}>
          {formatBirthdayDate(item.dateOfBirth)}{age ? ` • ${age} ans` : ''}
        </Text>
      </TouchableOpacity>
    );
  };

  // ─── Rendu card rappel ──────────────────────────────────────────────────────
  const renderReminderCard = (contact: Contact) => {
    const best = bestContactDate(contact, callLogDates);
    const days = daysSince(best);
    const hasCallLog = callLogDates.has(contact.id);
    const daysLabel =
      days >= 9999 ? 'Depuis longtemps' : `Pas de nouvelles depuis ${days} jour${days > 1 ? 's' : ''}`;

    const handleCall = async () => {
      if (!contact.phone) return;
      // Ouvrir le téléphone
      Linking.openURL(`tel:${contact.phone}`);
      // Enregistrer la date de contact + invalider le cache d'appels
      const now = new Date();
      try {
        await invalidateCallCache(contact.phone);
        await StorageService.updateContact({...contact, lastContactedAt: now});
        setContacts(prev =>
          prev.map(c => c.id === contact.id ? {...c, lastContactedAt: now} : c),
        );
      } catch (_) {}
    };

    const handleChat = () => {
      navigation.navigate('Chat', {
        otherUserId: contact.goodfriendsUserId,
        otherUserFirstName: contact.firstName,
        otherUserLastName: contact.lastName,
        otherUserEmail: contact.email,
      });
    };

    return (
      <TouchableOpacity
        key={contact.id}
        style={s.reminderCard}
        onPress={() => openContact(contact.id)}
        activeOpacity={0.8}>
        <AvatarCircle contact={contact} size={48} primaryColor={theme.primary} />
        <View style={s.reminderInfo}>
          <Text style={s.reminderName}>
            {contact.firstName} {contact.lastName}
          </Text>
          {(hasCallLog || !!contact.lastContactedAt) && (
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
              {hasCallLog && (
                <MaterialIcons name="call" size={11} color={theme.primary} style={{opacity: 0.7}} />
              )}
              <Text style={s.reminderSubtitle}>{daysLabel}</Text>
            </View>
          )}
        </View>
        <View style={s.reminderActions}>
          {contact.phone ? (
            <TouchableOpacity
              style={[s.reminderActionBtn, {backgroundColor: theme.primary + '15'}]}
              onPress={handleCall}>
              <MaterialIcons name="call" size={18} color={theme.primary} />
            </TouchableOpacity>
          ) : null}
          {contact.goodfriendsUserId ? (
            <TouchableOpacity
              style={[s.reminderActionBtn, {backgroundColor: theme.secondary + '15'}]}
              onPress={handleChat}>
              <MaterialIcons name="chat-bubble-outline" size={18} color={theme.secondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Rendu principal ────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* ── Header greeting ── */}
        <View style={s.header}>
          <View>
            <Text style={s.appName}>Goodfriends</Text>
            <Text style={s.greeting}>
              {greeting}{userName ? `, ${userName}` : ''}.
            </Text>
            <Text style={s.subGreeting}>Gardons le contact.</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity
              style={s.notifBtn}
              onPress={() => navigation.navigate('Conversations', {_animDir: 'right'})}>
              <MaterialIcons name="chat-bubble-outline" size={22} color="#383830" />
              {unreadCount > 0 && (
                <View style={[s.notifBadge, {backgroundColor: theme.primary}]}>
                  <Text style={s.notifBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.settingsBtn}
              onPress={() => navigation.navigate('Settings')}>
              <MaterialIcons name="tune" size={22} color="#383830" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Section Anniversaires ── */}
        {upcomingBirthdays.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Prochains anniversaires</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Birthdays')}>
                <Text style={[s.sectionLink, {color: theme.primary}]}>Voir tout</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={upcomingBirthdays}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={item => item.id}
              renderItem={renderBirthdayCard}
              contentContainerStyle={s.birthdayList}
              snapToInterval={100}
              decelerationRate="fast"
            />
          </View>
        )}

        {/* ── Section Prendre des nouvelles ── */}
        {reminders.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Prendre des nouvelles</Text>
            </View>
            <View style={s.reminderList}>
              {reminders.map(c => renderReminderCard(c))}
            </View>
          </View>
        )}

        {/* ── Tous les contacts vide ── */}
        {contacts.length === 0 && (
          <View style={s.emptyState}>
            <MaterialIcons name="people-outline" size={64} color="#bbbaaf" />
            <Text style={s.emptyTitle}>Aucun proche pour l'instant</Text>
            <Text style={s.emptySubtitle}>
              Ajoutez vos premiers contacts pour commencer à prendre soin de vos relations.
            </Text>
            <TouchableOpacity
              style={[s.emptyBtn, {backgroundColor: theme.primary}]}
              onPress={() => navigation.navigate('AddContact')}>
              <Text style={s.emptyBtnText}>Ajouter un proche</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Espace pour la nav flottante */}
        <View style={{height: 96}} />
      </ScrollView>

      {/* ── FAB ajout contact ── */}
      <TouchableOpacity
        style={[s.fab, {backgroundColor: theme.primary}]}
        onPress={() => navigation.navigate('AddContact')}
        activeOpacity={0.9}>
        <MaterialIcons name="person-add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const createStyles = (theme: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#fcf9f0',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: Platform.OS === 'android' ? 48 : 56,
    },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: Spacing.xl,
      paddingBottom: Spacing.xl,
    },
    appName: {
      ...Typography.label,
      color: theme.primary,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    greeting: {
      ...Typography.headline,
      fontSize: 26,
      color: '#383830',
      lineHeight: 32,
    },
    subGreeting: {
      ...Typography.body,
      color: '#65655c',
      marginTop: 2,
      lineHeight: 22,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: 4,
    },
    notifBtn: {
      width: 42,
      height: 42,
      borderRadius: Radius.full,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadow.sm,
    },
    notifBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notifBadgeText: {
      color: '#fff',
      fontSize: 9,
      fontWeight: '700',
    },
    settingsBtn: {
      width: 42,
      height: 42,
      borderRadius: Radius.full,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadow.sm,
    },

    // Sections
    section: {
      marginBottom: Spacing.xl,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.xl,
      marginBottom: Spacing.md,
    },
    sectionTitle: {
      ...Typography.titleSm,
      color: '#383830',
    },
    sectionLink: {
      ...Typography.bodyMd,
      fontWeight: '600',
    },

    // Birthday cards
    birthdayList: {
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.sm,
    },
    birthdayCard: {
      width: 92,
      marginHorizontal: Spacing.xs,
      backgroundColor: '#ffffff',
      borderRadius: Radius.xl,
      alignItems: 'center',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.sm,
      ...Shadow.sm,
    },
    birthdayCardToday: {
      backgroundColor: theme.primary + '12',
      borderWidth: 1.5,
      borderColor: theme.primary + '40',
    },
    birthdayAvatarWrapper: {
      position: 'relative',
      marginBottom: Spacing.sm,
    },
    birthdayBadge: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    birthdayBadgeText: {
      fontSize: 11,
    },
    birthdayName: {
      ...Typography.labelLg,
      color: '#383830',
      textAlign: 'center',
      marginBottom: 2,
    },
    birthdayDate: {
      ...Typography.label,
      color: '#65655c',
      textAlign: 'center',
    },
    birthdayDateSmall: {
      fontSize: 10,
      color: '#818177',
      textAlign: 'center',
      marginTop: 2,
    },

    // Reminder cards
    reminderList: {
      paddingHorizontal: Spacing.xl,
      gap: Spacing.sm,
    },
    reminderCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#ffffff',
      borderRadius: Radius.lg,
      padding: Spacing.base,
      ...Shadow.sm,
    },
    reminderInfo: {
      flex: 1,
      marginLeft: Spacing.md,
    },
    reminderName: {
      ...Typography.titleSm,
      color: '#383830',
    },
    reminderSubtitle: {
      ...Typography.bodyMd,
      color: '#65655c',
      marginTop: 2,
    },
    reminderActions: {
      flexDirection: 'row',
      gap: Spacing.xs,
    },
    reminderActionBtn: {
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Empty state
    emptyState: {
      alignItems: 'center',
      paddingHorizontal: Spacing.xxxl,
      paddingTop: Spacing.xxxl,
    },
    emptyTitle: {
      ...Typography.titleMd,
      color: '#383830',
      textAlign: 'center',
      marginTop: Spacing.base,
    },
    emptySubtitle: {
      ...Typography.body,
      color: '#65655c',
      textAlign: 'center',
      lineHeight: 22,
      marginTop: Spacing.sm,
    },
    emptyBtn: {
      marginTop: Spacing.xl,
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.md,
      borderRadius: Radius.full,
    },
    emptyBtnText: {
      color: '#fff',
      ...Typography.titleSm,
    },

    // FAB
    fab: {
      position: 'absolute',
      right: Spacing.xl,
      bottom: 88,
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadow.lg,
    },
  });

export default DashboardScreen;
