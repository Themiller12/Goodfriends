/**
 * ContactProfileScreen — Profil d'un proche (vue lecture seule)
 * Inspiré du design Stitch "Profil d'un Proche"
 * Bouton édition → ContactDetailScreen
 */
import React, {useState, useEffect, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Linking,
  Platform,
  StatusBar,
  Alert,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {Contact, FamilyMemberInfo, NoteEntry, RelationType} from '../types';
import StorageService from '../services/StorageService';
import CacheService from '../services/CacheService';
import FriendRequestService from '../services/FriendRequestService';
import {useTheme} from '../context/ThemeContext';
import {Spacing, Radius, Shadow, Typography} from '../theme/designSystem';

interface Props {
  navigation: any;
  route: any;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getAge = (dateOfBirth: any): number | null => {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
};

const getDaysUntilBirthday = (dateOfBirth: any): number | null => {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const formatBirthdayFull = (dateOfBirth: any): string => {
  if (!dateOfBirth) return '';
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return '';
  return birth.toLocaleDateString('fr-FR', {day: 'numeric', month: 'long'});
};

const getZodiacSign = (dateOfBirth: any): string | null => {
  if (!dateOfBirth) return null;
  const date = new Date(dateOfBirth);
  if (isNaN(date.getTime())) return null;
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return '♈ Bélier';
  if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return '♉ Taureau';
  if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) return '♊ Gémeaux';
  if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) return '♋ Cancer';
  if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return '♌ Lion';
  if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return '♍ Vierge';
  if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) return '♎ Balance';
  if ((m === 10 && d >= 23) || (m === 11 && d <= 21)) return '♏ Scorpion';
  if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) return '♐ Sagittaire';
  if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return '♑ Capricorne';
  if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return '♒ Verseau';
  return '♓ Poissons';
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

const relLabel: Record<string, string> = {
  spouse: 'Conjoint·e',
  child: 'Enfant',
  parent: 'Parent',
  father: 'Père',
  mother: 'Mère',
  sibling: 'Frère / Sœur',
  cousin: 'Cousin·e',
  stepmother: 'Belle-mère',
  stepfather: 'Beau-père',
  friend: 'Ami·e',
  colleague: 'Collègue',
  other: 'Autre',
};

// ─── Composant avatar grand format ───────────────────────────────────────────
const LargeAvatar: React.FC<{contact: Contact; size: number; primaryColor: string}> = ({
  contact,
  size,
  primaryColor,
}) => {
  if (contact.photo) {
    return (
      <Image
        source={{uri: contact.photo}}
        style={{width: size, height: size, borderRadius: size / 2}}
        resizeMode="cover"
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
        backgroundColor: primaryColor + '30',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        style={{
          fontSize: size * 0.38,
          fontWeight: '700',
          color: primaryColor,
        }}>
        {initials || '?'}
      </Text>
    </View>
  );
};

// ─── Chip tag ─────────────────────────────────────────────────────────────────
const Chip: React.FC<{label: string; color?: string}> = ({label, color = '#e8e0d4'}) => (
  <View style={{backgroundColor: color, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, margin: 3}}>
    <Text style={{fontSize: 13, fontWeight: '500', color: '#383830'}}>{label}</Text>
  </View>
);

// ─── Composant principal ──────────────────────────────────────────────────────
const ContactProfileScreen: React.FC<Props> = ({navigation, route}) => {
  const {theme} = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const {contactId} = route.params;

  const [contact, setContact] = useState<Contact | null>(null);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  // Notes multiples
  const [noteEntries, setNoteEntries] = useState<NoteEntry[]>([]);
  const [addingNote, setAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [hasGoodFriendsAccount, setHasGoodFriendsAccount] = useState(false);
  const [goodFriendsUserId, setGoodFriendsUserId] = useState<string | null>(null);
  const [friendRequestStatus, setFriendRequestStatus] = useState<'none' | 'pending' | 'accepted' | 'sending'>('none');

  useEffect(() => {
    const load = async () => {
      try {
        await CacheService.invalidateCache('contacts');
        const all = await StorageService.getContacts();
        setAllContacts(all);
        const found = all.find(c => String(c.id) === String(contactId));
        setContact(found || null);
        // Charger les notes multiples depuis AsyncStorage
        const key = `@note_entries_${contactId}`;
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          setNoteEntries(JSON.parse(raw));
        } else if (found?.notes) {
          // Migration depuis l'ancien champ notes unique
          const migrated: NoteEntry[] = [{
            id: `note_${Date.now()}`,
            text: found.notes,
            createdAt: new Date(found.createdAt).toISOString(),
            updatedAt: new Date(found.createdAt).toISOString(),
          }];
          setNoteEntries(migrated);
          await AsyncStorage.setItem(key, JSON.stringify(migrated));
        } else {
          setNoteEntries([]);
        }
        if (!found?.goodfriendsUserId && (found?.email || found?.phone)) {
          checkGoodFriendsAccount(found.email, found.phone);
        }
      } catch (e) {
        console.log('[ContactProfile] load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [contactId, navigation]);

  const checkGoodFriendsAccount = async (email?: string, phone?: string) => {
    try {
      let foundUser = null;
      if (email) {
        const users = await FriendRequestService.searchUsers(email);
        if (users.length > 0) foundUser = users[0];
      }
      if (!foundUser && phone) {
        const users = await FriendRequestService.searchUsers(phone);
        if (users.length > 0) foundUser = users[0];
      }
      if (foundUser) {
        setHasGoodFriendsAccount(true);
        setGoodFriendsUserId(foundUser.id);
        const status = foundUser.requestStatus;
        if (status === 'pending') {
          setFriendRequestStatus('pending');
        } else if (status === 'accepted') {
          setFriendRequestStatus('accepted');
        } else {
          try {
            const sentRequests = await FriendRequestService.getSentRequests();
            const alreadySent = sentRequests.some((r: any) => r.id === foundUser!.id);
            setFriendRequestStatus(alreadySent ? 'pending' : 'none');
          } catch {
            setFriendRequestStatus('none');
          }
        }
      }
    } catch (error) {
      console.log('[ContactProfile] checkGoodFriends error:', error);
    }
  };

  const handleAddFriend = async () => {
    if (!goodFriendsUserId || friendRequestStatus !== 'none') return;
    setFriendRequestStatus('sending');
    try {
      await FriendRequestService.sendFriendRequest(goodFriendsUserId);
      setFriendRequestStatus('pending');
      Alert.alert('Succès', "Demande d'ami envoyée !");
    } catch (error: any) {
      const apiMessage: string = error?.response?.data?.message || error?.message || '';
      if (apiMessage === 'Une demande est déjà en attente') {
        setFriendRequestStatus('pending');
      } else if (apiMessage === 'Vous êtes déjà amis') {
        setFriendRequestStatus('accepted');
      } else {
        setFriendRequestStatus('none');
        Alert.alert('Erreur', apiMessage || "Impossible d'envoyer la demande");
      }
    }
  };

  // ── Gestion des notes multiples ──────────────────────────────────────────
  const saveNoteEntriesToStorage = async (entries: NoteEntry[]) => {
    await AsyncStorage.setItem(`@note_entries_${contactId}`, JSON.stringify(entries));
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;
    const entry: NoteEntry = {
      id: `note_${Date.now()}`,
      text: newNoteText.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [entry, ...noteEntries];
    setNoteEntries(updated);
    await saveNoteEntriesToStorage(updated);
    setNewNoteText('');
    setAddingNote(false);
  };

  const handleSaveEditNote = async () => {
    if (!editingNoteId || !editingNoteText.trim()) return;
    const updated = noteEntries.map(n =>
      n.id === editingNoteId
        ? {...n, text: editingNoteText.trim(), updatedAt: new Date().toISOString()}
        : n
    );
    setNoteEntries(updated);
    await saveNoteEntriesToStorage(updated);
    setEditingNoteId(null);
    setEditingNoteText('');
  };

  const handleDeleteNote = (id: string) => {
    Alert.alert('Supprimer la note', 'Cette note sera supprimée définitivement.', [
      {text: 'Annuler', style: 'cancel'},
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const updated = noteEntries.filter(n => n.id !== id);
          setNoteEntries(updated);
          await saveNoteEntriesToStorage(updated);
        },
      },
    ]);
  };

  const age = useMemo(() => (contact ? getAge(contact.dateOfBirth) : null), [contact]);
  const daysUntilBirthday = useMemo(
    () => (contact ? getDaysUntilBirthday(contact.dateOfBirth) : null),
    [contact],
  );
  const birthdayText = useMemo(() => {
    if (daysUntilBirthday === null) return null;
    if (daysUntilBirthday === 0) return "Aujourd'hui ! 🎂";
    if (daysUntilBirthday === 1) return 'Demain 🎂';
    return `Dans ${daysUntilBirthday} jours (${formatBirthdayFull(contact?.dateOfBirth)})`;
  }, [daysUntilBirthday, contact]);

  // Trouver les contacts liés par relations
  const relatedContacts = useMemo(() => {
    if (!contact) return [];
    return (contact.relationships || []).map(rel => {
      const linked = allContacts.find(c => String(c.id) === String(rel.contactId));
      return {rel, linked};
    });
  }, [contact, allContacts]);

  const summary = useMemo((): string => {
    if (!contact) return '';
    try {
      let s = '';
      const ageVal = contact.age || (contact.dateOfBirth ? (() => {
        const today = new Date();
        const dob = new Date(contact.dateOfBirth as unknown as string);
        let y = today.getFullYear() - dob.getFullYear();
        const mo = today.getMonth() - dob.getMonth();
        if (mo < 0 || (mo === 0 && today.getDate() < dob.getDate())) y--;
        return y >= 0 ? y : null;
      })() : null);
      if (ageVal) s += `${ageVal} ans`;

      const childrenList = Array.isArray(contact.children) ? contact.children : [];
      if (childrenList.length > 0) {
        const childLabel = `${childrenList.length} enfant${childrenList.length > 1 ? 's' : ''}`;
        s += s ? `, ${childLabel}` : childLabel.charAt(0).toUpperCase() + childLabel.slice(1);
        const childNames = childrenList.map(c => {
          const a = calcChildAge(c.dateOfBirth ? new Date(c.dateOfBirth) : undefined);
          return a ? `${c.firstName} (${a})` : c.firstName;
        }).join(', ');
        s += ` : ${childNames}`;
      }

      const relationships = Array.isArray(contact.relationships) ? contact.relationships : [];
      const childContacts = relationships
        .filter(r => r.relationType === RelationType.CHILD)
        .map(r => allContacts.find(c => String(c.id) === String(r.contactId)))
        .filter((c): c is Contact => c !== undefined);
      if (childContacts.length > 0) {
        if (childrenList.length === 0) {
          const cl = `${childContacts.length} enfant${childContacts.length > 1 ? 's' : ''}`;
          s += s ? `, ${cl}` : cl.charAt(0).toUpperCase() + cl.slice(1);
        } else {
          s += ` (et ${childContacts.length} autre${childContacts.length > 1 ? 's' : ''})`;
        }
        s += ` : ${childContacts.map(c => {
          const a = c.age ? `${c.age} ans` : calcChildAge(c.dateOfBirth ? new Date(c.dateOfBirth as unknown as string) : undefined);
          return a ? `${c.firstName} (${a})` : c.firstName;
        }).join(', ')}`;
      }

      const spouseRel = relationships.find(r => r.relationType === RelationType.SPOUSE);
      if (spouseRel) {
        const spouse = allContacts.find(c => String(c.id) === String(spouseRel.contactId));
        if (spouse) {
          const spouseText = `Conjoint·e : ${spouse.firstName}`;
          s += s ? `  ·  ${spouseText}` : spouseText;
        }
      }

      if (contact.allergies) {
        s += s ? `  ·  Allergies : ${contact.allergies}` : `Allergies : ${contact.allergies}`;
      }

      const travels = Array.isArray(contact.travels) ? contact.travels : [];
      if (travels.length > 0) {
        s += s ? `  ·  Voyages : ${travels.join(', ')}` : `Voyages : ${travels.join(', ')}`;
      }

      return s;
    } catch {
      return '';
    }
  }, [contact, allContacts]);

  if (loading) {
    return (
      <View style={[s.root, {alignItems: 'center', justifyContent: 'center'}]}>
        <Text style={{color: '#65655c'}}>Chargement…</Text>
      </View>
    );
  }

  if (!contact) {
    return (
      <View style={[s.root, {alignItems: 'center', justifyContent: 'center'}]}>
        <Text style={{color: '#65655c'}}>Contact introuvable</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{marginTop: 16}}>
          <Text style={{color: theme.primary}}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Hero photo header ── */}
      <View style={s.heroContainer}>
        {contact.photo ? (
          <Image source={{uri: contact.photo}} style={s.heroImage} resizeMode="cover" />
        ) : (
          <View style={[s.heroPlaceholder, {backgroundColor: theme.primary + '20'}]}>
            <LargeAvatar contact={contact} size={110} primaryColor={theme.primary} />
          </View>
        )}

        {/* Gradient overlay bas */}
        <View style={s.heroGradient} />

        {/* Bouton retour */}
        <TouchableOpacity
          style={s.heroBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{top: 8, right: 8, bottom: 8, left: 8}}>
          <MaterialIcons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        {/* Bouton édition */}
        <TouchableOpacity
          style={[s.heroEditBtn, {backgroundColor: theme.primary}]}
          onPress={() => navigation.navigate('ContactDetail', {contactId: contact.id})}
          hitSlop={{top: 8, right: 8, bottom: 8, left: 8}}>
          <MaterialIcons name="edit" size={18} color="#fff" />
        </TouchableOpacity>

        {/* Nom + relation */}
        <View style={s.heroNameOverlay}>
          <Text style={s.heroName}>
            {contact.firstName} {contact.lastName}
          </Text>
          {summary !== '' && (
            <Text style={s.heroAge} numberOfLines={2}>{summary}</Text>
          )}
          {contact.goodfriendsUserId && (
            <View style={s.heroGoodFriendsBadge}>
              <MaterialIcons name="star" size={11} color="#fff" />
              <Text style={s.heroGoodFriendsBadgeText}>Sur GoodFriends</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Actions rapides ── */}
        <View style={s.actionsRow}>
          {contact.phone && (
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => Linking.openURL(`tel:${contact.phone}`)}>
              <View style={[s.actionIconWrapper, {backgroundColor: theme.primary + '15'}]}>
                <MaterialIcons name="call" size={22} color={theme.primary} />
              </View>
              <Text style={s.actionLabel}>Appel</Text>
            </TouchableOpacity>
          )}
          {contact.goodfriendsUserId && (
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() =>
                navigation.navigate('Chat', {
                  otherUserId: contact.goodfriendsUserId,
                  otherUserFirstName: contact.firstName,
                  otherUserLastName: contact.lastName,
                  otherUserEmail: contact.email,
                })
              }>
              <View style={[s.actionIconWrapper, {backgroundColor: theme.secondary + '15'}]}>
                <MaterialIcons name="chat-bubble-outline" size={22} color={theme.secondary} />
              </View>
              <Text style={s.actionLabel}>Message</Text>
            </TouchableOpacity>
          )}
          {contact.email && (
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => Linking.openURL(`mailto:${contact.email}`)}>
              <View style={[s.actionIconWrapper, {backgroundColor: '#815f1920'}]}>
                <MaterialIcons name="mail-outline" size={22} color="#815f19" />
              </View>
              <Text style={s.actionLabel}>Email</Text>
            </TouchableOpacity>
          )}
          {birthdayText && (
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => navigation.navigate('Birthdays')}>
              <View style={[s.actionIconWrapper, {backgroundColor: '#c0392b15'}]}>
                <MaterialIcons name="cake" size={22} color="#c0392b" />
              </View>
              <Text style={s.actionLabel}>Anniv.</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Prochain anniversaire ── */}
        {birthdayText && (
          <View style={s.birthdayBanner}>
            <MaterialIcons name="cake" size={18} color="#c0392b" />
            <Text style={s.birthdayBannerText}>{birthdayText}</Text>
          </View>
        )}

        {/* ── Compte GoodFriends ── */}
        {!contact.goodfriendsUserId && hasGoodFriendsAccount && (
          <View style={[s.card, {borderWidth: 1.5, borderColor: theme.primary + '40'}]}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10}}>
              <MaterialIcons name="star" size={20} color={theme.primary} />
              <Text style={[s.cardTitle, {color: theme.primary, marginBottom: 0}]}>
                Ce contact est sur GoodFriends !
              </Text>
            </View>
            {friendRequestStatus === 'accepted' ? (
              <Text style={s.goodfriendsText}>✅ Vous êtes déjà amis sur GoodFriends.</Text>
            ) : friendRequestStatus === 'pending' ? (
              <Text style={s.goodfriendsText}>⏳ Demande d'ami en attente de réponse.</Text>
            ) : (
              <>
                <Text style={s.goodfriendsText}>
                  Vous pouvez l'ajouter en ami pour partager vos infos et vous envoyer des messages !
                </Text>
                <TouchableOpacity
                  style={[
                    s.addFriendBtn,
                    {backgroundColor: theme.primary},
                    friendRequestStatus === 'sending' && {opacity: 0.6},
                  ]}
                  onPress={handleAddFriend}
                  disabled={friendRequestStatus === 'sending'}>
                  <MaterialIcons name="person-add" size={16} color="#fff" />
                  <Text style={s.addFriendBtnText}>
                    {friendRequestStatus === 'sending' ? 'Envoi…' : "Envoyer une demande d'ami"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── À propos ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>À propos</Text>
          {age !== null && (
            <View style={s.infoRow}>
              <MaterialIcons name="cake" size={16} color="#818177" />
              <Text style={s.infoText}>
                {age} ans
                {getZodiacSign(contact.dateOfBirth) ? `  ${getZodiacSign(contact.dateOfBirth)}` : ''}
              </Text>
            </View>
          )}
          {contact.gender && (
            <View style={s.infoRow}>
              <MaterialIcons name="person-outline" size={16} color="#818177" />
              <Text style={s.infoText}>
                {contact.gender === 'male' ? 'Homme' : contact.gender === 'female' ? 'Femme' : 'Autre'}
              </Text>
            </View>
          )}
          {(contact.professionsStudies?.length ?? 0) > 0 && (
            contact.professionsStudies.map((p, i) => (
              <View key={i} style={s.infoRow}>
                <MaterialIcons name="work-outline" size={16} color="#818177" />
                <Text style={s.infoText}>
                  {p.title}{p.year ? ` (${p.year})` : ''}
                </Text>
              </View>
            ))
          )}
          {contact.email && (
            <View style={s.infoRow}>
              <MaterialIcons name="mail-outline" size={16} color="#818177" />
              <Text style={[s.infoText, {color: theme.secondary}]}>{contact.email}</Text>
            </View>
          )}
          {contact.phone && (
            <View style={s.infoRow}>
              <MaterialIcons name="call" size={16} color="#818177" />
              <Text style={[s.infoText, {color: theme.secondary}]}>{contact.phone}</Text>
            </View>
          )}
        </View>

        {/* ── Voyages / Centres d'intérêt ── */}
        {((contact.travels?.length ?? 0) > 0 || contact.allergies) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Centres d'intérêt & infos</Text>
            {(contact.travels?.length ?? 0) > 0 && (
              <>
                <View style={s.infoRow}>
                  <MaterialIcons name="flight-takeoff" size={15} color="#818177" />
                  <Text style={s.infoLabel}>Voyages</Text>
                </View>
                <View style={s.chipRow}>
                  {contact.travels!.map((t, i) => (
                    <Chip key={i} label={t} color={theme.background} />
                  ))}
                </View>
              </>
            )}
            {contact.allergies && (
              <View style={s.infoRow}>
                <MaterialIcons name="warning-amber" size={15} color="#c0392b" />
                <Text style={[s.infoText, {flex: 1}]}>
                  <Text style={{fontWeight: '600', color: '#c0392b'}}>Allergies : </Text>
                  {contact.allergies}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Famille & Relations ── */}
        {(relatedContacts.length > 0 || (contact.children?.length ?? 0) > 0 || (contact.familyMembers?.length ?? 0) > 0) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Famille & Relations</Text>
            {contact.children?.map((child, i) => (
              <View key={i} style={s.familyRow}>
                <View style={s.familyAvatar}>
                  <Text style={{fontSize: 16, color: theme.primary}}>👶</Text>
                </View>
                <View>
                  <Text style={s.familyName}>{child.firstName}</Text>
                  <Text style={s.familyRole}>Enfant</Text>
                </View>
              </View>
            ))}
            {contact.familyMembers?.map((fm: FamilyMemberInfo, i: number) => {
              const fmAge = getAge(fm.dateOfBirth);
              return (
                <View key={`fm-${i}`} style={s.familyRow}>
                  <View style={s.familyAvatarImg}>
                    <View style={[{width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + '20', alignItems: 'center', justifyContent: 'center'}]}>
                      <Text style={{fontSize: 14, fontWeight: '700', color: theme.primary}}>
                        {fm.firstName?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={s.familyName}>
                      {fm.firstName}{fm.lastName ? ` ${fm.lastName}` : ''}{fmAge ? ` · ${fmAge} ans` : ''}
                    </Text>
                    <Text style={s.familyRole}>
                      {relLabel[fm.relationType] || fm.relationType}
                    </Text>
                    {fm.notes ? <Text style={{fontSize: 12, color: '#999', marginTop: 2}}>{fm.notes}</Text> : null}
                  </View>
                </View>
              );
            })}
            {relatedContacts.map(({rel, linked}, i) => (
              <TouchableOpacity
                key={i}
                style={s.familyRow}
                onPress={() => linked && navigation.navigate('ContactProfile', {contactId: linked.id})}
                disabled={!linked}>
                <View style={s.familyAvatarImg}>
                  {linked?.photo ? (
                    <Image source={{uri: linked.photo}} style={{width: 40, height: 40, borderRadius: 20}} />
                  ) : (
                    <View style={[{width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + '20', alignItems: 'center', justifyContent: 'center'}]}>
                      <Text style={{fontSize: 14, fontWeight: '700', color: theme.primary}}>
                        {linked?.firstName?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{flex: 1}}>
                  <Text style={s.familyName}>
                    {linked ? `${linked.firstName} ${linked.lastName}` : 'Contact inconnu'}
                  </Text>
                  <Text style={s.familyRole}>
                    {rel.customRelationLabel || relLabel[rel.relationType] || rel.relationType}
                  </Text>
                </View>
                {linked && <MaterialIcons name="chevron-right" size={18} color="#bbbaaf" />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Notes & Souvenirs ── */}
        <View style={s.card}>
          <View style={s.cardHeaderRow}>
            <Text style={[s.cardTitle, {marginBottom: 0}]}>Notes & Souvenirs</Text>
            <TouchableOpacity
              style={s.editNoteBtn}
              onPress={() => { setAddingNote(true); setNewNoteText(''); }}
              hitSlop={{top: 8, right: 8, bottom: 8, left: 8}}>
              <MaterialIcons name="add" size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>

          {/* Formulaire nouvelle note */}
          {addingNote && (
            <View style={s.noteForm}>
              <TextInput
                style={s.notesInput}
                value={newNoteText}
                onChangeText={setNewNoteText}
                multiline
                placeholder="Écrivez une note ou un souvenir…"
                placeholderTextColor="#aaa"
                textAlignVertical="top"
                autoFocus
              />
              <View style={s.notesActions}>
                <TouchableOpacity
                  style={[s.saveNotesBtn, {backgroundColor: '#e8e0d4'}]}
                  onPress={() => setAddingNote(false)}>
                  <Text style={[s.saveNotesBtnText, {color: '#65655c'}]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveNotesBtn, {backgroundColor: theme.primary}]}
                  onPress={handleAddNote}>
                  <MaterialIcons name="check" size={16} color="#fff" />
                  <Text style={s.saveNotesBtnText}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Liste des notes */}
          {noteEntries.length === 0 && !addingNote && (
            <TouchableOpacity onPress={() => { setAddingNote(true); setNewNoteText(''); }} activeOpacity={0.7}>
              <Text style={s.notePlaceholder}>Appuyez sur + pour ajouter une note ou un souvenir…</Text>
            </TouchableOpacity>
          )}
          {noteEntries.map((entry, idx) => (
            <View
              key={entry.id}
              style={[s.noteEntry, idx < noteEntries.length - 1 && {borderBottomWidth: 1, borderBottomColor: '#f0ede4'}]}>
              {editingNoteId === entry.id ? (
                <>
                  <TextInput
                    style={s.notesInput}
                    value={editingNoteText}
                    onChangeText={setEditingNoteText}
                    multiline
                    textAlignVertical="top"
                    autoFocus
                  />
                  <View style={s.notesActions}>
                    <TouchableOpacity
                      style={[s.saveNotesBtn, {backgroundColor: '#e8e0d4'}]}
                      onPress={() => { setEditingNoteId(null); setEditingNoteText(''); }}>
                      <Text style={[s.saveNotesBtnText, {color: '#65655c'}]}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.saveNotesBtn, {backgroundColor: theme.primary}]}
                      onPress={handleSaveEditNote}>
                      <MaterialIcons name="check" size={16} color="#fff" />
                      <Text style={s.saveNotesBtnText}>Enregistrer</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.noteText}>{entry.text}</Text>
                  <Text style={s.noteDateText}>
                    {new Date(entry.updatedAt).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'})}
                  </Text>
                  <View style={s.noteItemActions}>
                    <TouchableOpacity
                      onPress={() => { setEditingNoteId(entry.id); setEditingNoteText(entry.text); }}
                      hitSlop={{top: 6, right: 6, bottom: 6, left: 6}}
                      style={s.noteActionBtn}>
                      <MaterialIcons name="edit" size={15} color={theme.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteNote(entry.id)}
                      hitSlop={{top: 6, right: 6, bottom: 6, left: 6}}
                      style={s.noteActionBtn}>
                      <MaterialIcons name="delete-outline" size={15} color="#cc4444" />
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          ))}
        </View>

        <View style={{height: 40}} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const createStyles = (theme: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#fcf9f0',
    },

    // Hero
    heroContainer: {
      height: 280,
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: theme.primary + '20',
    },
    heroImage: {
      width: '100%',
      height: '100%',
    },
    heroPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroGradient: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 140,
      // Simulated gradient via multiple views
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    heroBackBtn: {
      position: 'absolute',
      top: Platform.OS === 'android' ? 44 : 52,
      left: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroEditBtn: {
      position: 'absolute',
      top: Platform.OS === 'android' ? 44 : 52,
      right: 16,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadow.sm,
    },
    heroNameOverlay: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      right: 20,
    },
    heroName: {
      fontSize: 26,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: -0.3,
    },
    heroAge: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.85)',
      marginTop: 2,
    },

    // Scroll
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing.xxxl,
    },

    // Actions rapides
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: Spacing.xl,
      marginBottom: Spacing.base,
      gap: Spacing.xl,
    },
    actionBtn: {
      alignItems: 'center',
      gap: 6,
    },
    actionIconWrapper: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionLabel: {
      fontSize: 12,
      color: '#65655c',
      fontWeight: '500',
    },

    // Birthday banner
    birthdayBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#c0392b12',
      marginHorizontal: Spacing.xl,
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      marginBottom: Spacing.base,
      gap: Spacing.sm,
    },
    birthdayBannerText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#c0392b',
    },

    // Cards
    card: {
      backgroundColor: '#ffffff',
      marginHorizontal: Spacing.xl,
      borderRadius: Radius.xl,
      padding: Spacing.base,
      marginBottom: Spacing.md,
      ...Shadow.sm,
    },
    cardTitle: {
      ...Typography.titleSm,
      color: '#383830',
      marginBottom: Spacing.md,
    },

    // Info rows
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    infoLabel: {
      ...Typography.bodyMd,
      color: '#65655c',
      marginBottom: 4,
    },
    infoText: {
      ...Typography.body,
      color: '#383830',
      flex: 1,
      lineHeight: 20,
    },

    // Chips
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: Spacing.xs,
    },

    // Family
    familyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      gap: Spacing.md,
    },
    familyAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#f0eee4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    familyAvatarImg: {
      // container for linked contact avatar
    },
    familyName: {
      ...Typography.titleSm,
      color: '#383830',
    },
    familyRole: {
      ...Typography.bodyMd,
      color: '#65655c',
    },

    // Notes
    noteEntry: {
      paddingVertical: Spacing.sm,
      position: 'relative',
    },
    noteText: {
      ...Typography.body,
      color: '#383830',
      lineHeight: 22,
      paddingRight: 56,
    },
    noteDateText: {
      fontSize: 11,
      color: '#aaa',
      marginTop: 4,
    },
    noteItemActions: {
      position: 'absolute',
      top: Spacing.sm,
      right: 0,
      flexDirection: 'row',
      gap: 8,
    },
    noteActionBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#f0ede4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    notePlaceholder: {
      color: '#aaa',
      fontStyle: 'italic',
      ...Typography.body,
    },
    noteForm: {
      marginBottom: Spacing.sm,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.md,
    },
    editNoteBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: '#f0eee4',
      alignItems: 'center',
      justifyContent: 'center',
    },
    notesInput: {
      ...Typography.body,
      color: '#383830',
      lineHeight: 22,
      borderWidth: 1.5,
      borderColor: '#e8e0d4',
      borderRadius: Radius.lg,
      padding: Spacing.md,
      minHeight: 120,
      backgroundColor: '#faf8f3',
    },
    notesActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: Spacing.sm,
    },
    saveNotesBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.full,
    },
    saveNotesBtnText: {
      ...Typography.bodyMd,
      color: '#fff',
      fontWeight: '600',
    },

    // Hero GoodFriends badge
    heroGoodFriendsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 6,
      alignSelf: 'flex-start',
    },
    heroGoodFriendsBadgeText: {
      fontSize: 12,
      color: '#fff',
      fontWeight: '600',
    },

    // GoodFriends account card
    goodfriendsText: {
      ...Typography.body,
      color: '#65655c',
      lineHeight: 20,
      marginBottom: 12,
    },
    addFriendBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.full,
      alignSelf: 'flex-start',
    },
    addFriendBtnText: {
      ...Typography.bodyMd,
      color: '#fff',
      fontWeight: '600',
    },
  });

export default ContactProfileScreen;
