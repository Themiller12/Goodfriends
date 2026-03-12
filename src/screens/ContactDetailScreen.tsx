import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
  Platform,
  Image,
  Modal,
  Linking,
  BackHandler,
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Picker} from '@react-native-picker/picker';
import {useTheme} from '../context/ThemeContext';
import {Contact, ContactGroup, RelationType, Child, Relationship, ProfessionStudy} from '../types';
import ContactService from '../services/ContactService';
import StorageService from '../services/StorageService';
import FriendRequestService from '../services/FriendRequestService';
import CacheService from '../services/CacheService';

interface ContactDetailScreenProps {
  navigation: any;
  route: any;
}

const ContactDetailScreen: React.FC<ContactDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const {theme} = useTheme();
  const {contactId} = route.params;
  const [contact, setContact] = useState<Contact | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | undefined>(undefined);
  const [allergies, setAllergies] = useState('');
  const [travels, setTravels] = useState<string[]>([]);
  const [newTravel, setNewTravel] = useState('');
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [relationships, setRelationships] = useState<Contact[]>([]);
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [hasGoodFriendsAccount, setHasGoodFriendsAccount] = useState(false);
  const [goodFriendsUserId, setGoodFriendsUserId] = useState<string | null>(null);
  const [friendRequestStatus, setFriendRequestStatus] = useState<'none' | 'pending' | 'accepted' | 'sending'>('none');
  const [children, setChildren] = useState<Child[]>([]);
  const [newChildName, setNewChildName] = useState('');
  const [newChildDateOfBirth, setNewChildDateOfBirth] = useState<Date | undefined>(undefined);
  const [newChildGender, setNewChildGender] = useState<'male' | 'female' | 'other'>('male');
  const [newChildNotes, setNewChildNotes] = useState('');
  const [showAddChildForm, setShowAddChildForm] = useState(false);
  const [showChildDatePicker, setShowChildDatePicker] = useState(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(0);
  const [customMessage, setCustomMessage] = useState('');
  const [showAddRelationForm, setShowAddRelationForm] = useState(false);
  const [selectedRelationContactId, setSelectedRelationContactId] = useState<string>('');
  const [selectedRelationType, setSelectedRelationType] = useState<RelationType>(RelationType.FRIEND);
  const [customRelationLabel, setCustomRelationLabel] = useState('');
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [professionsStudies, setProfessionsStudies] = useState<ProfessionStudy[]>([]);
  const [newProfTitle, setNewProfTitle] = useState('');
  const [newProfYear, setNewProfYear] = useState<number | undefined>(undefined);
  const [newProfNotes, setNewProfNotes] = useState('');
  const [showAddProfForm, setShowAddProfForm] = useState(false);
  const [editingProfId, setEditingProfId] = useState<string | null>(null);
  const [saveSuccessVisible, setSaveSuccessVisible] = useState(false);
  const toastAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (saveSuccessVisible) {
      toastAnim.setValue(-120);
      Animated.sequence([
        Animated.timing(toastAnim, {toValue: 0, duration: 320, useNativeDriver: true}),
        Animated.delay(2000),
        Animated.timing(toastAnim, {toValue: -120, duration: 280, useNativeDriver: true}),
      ]).start(() => {
        setSaveSuccessVisible(false);
      });
    }
  }, [saveSuccessVisible]);

  const defaultMessages = [
    "Joyeux anniversaire ! 🎉🎂 Je te souhaite une merveilleuse journée remplie de bonheur et de moments inoubliables !",
    "Bon anniversaire ! 🎈🎁 Que cette nouvelle année t'apporte joie, santé et réussite dans tous tes projets !",
    "Happy Birthday ! 🥳🎊 Profite bien de ta journée et que tous tes vœux se réalisent !"
  ];

  useEffect(() => {
    loadContact();
    loadGroups();
    
    // Recharger le contact quand l'écran redevient actif
    const unsubscribe = navigation.addListener('focus', () => {
      loadContact();
    });
    
    // Gérer le bouton retour Android
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true; // Empêcher le comportement par défaut
    });
    
    return () => {
      unsubscribe();
      backHandler.remove();
    };
  }, [navigation]);

  const loadContact = async () => {
    const contacts = await StorageService.getContacts();
    const foundContact = contacts.find(c => c.id === contactId);
    
    if (foundContact) {
      // S'assurer que children et professionsStudies sont initialisés
      if (!foundContact.children) {
        foundContact.children = [];
      }
      if (!foundContact.professionsStudies) {
        foundContact.professionsStudies = [];
      }
      setContact(foundContact);
      setFirstName(foundContact.firstName);
      setLastName(foundContact.lastName);
      setEmail(foundContact.email || '');
      setPhone(foundContact.phone || '');
      setDateOfBirth(
        foundContact.dateOfBirth ? new Date(foundContact.dateOfBirth) : undefined,
      );
      setNotes(foundContact.notes || '');
      setGender(foundContact.gender);
      setAllergies(foundContact.allergies || '');
      setTravels(foundContact.travels || []);
      setSelectedGroupId(foundContact.groupIds[0] || '');
      setPhotoUri(foundContact.photo);
      setChildren(foundContact.children || []);
      setProfessionsStudies(foundContact.professionsStudies || []);
      
      // Charger les relations et filtrer les doublons
      const relatedContacts = await ContactService.getContactRelationships(contactId);
      // Filtrer les doublons basés sur l'ID
      const uniqueRelatedContacts = relatedContacts.filter((contact, index, self) =>
        index === self.findIndex(c => c.id === contact.id)
      );
      setRelationships(uniqueRelatedContacts);
      
      // Charger les contacts disponibles maintenant que le contact est chargé
      await loadAvailableContacts(foundContact);
      
      // Vérifier si le contact a un compte GoodFriends
      if (!foundContact.goodfriendsUserId && (foundContact.email || foundContact.phone)) {
        checkGoodFriendsAccount(foundContact.email, foundContact.phone);
      }
    }
  };

  const loadGroups = async () => {
    const loadedGroups = await StorageService.getGroups();
    setGroups(loadedGroups);
  };

  const loadAvailableContacts = async (currentContact?: Contact) => {
    const allContacts = await StorageService.getContacts();
    // Utiliser le contact passé en paramètre ou le state contact
    const contactToUse = currentContact || contact;
    // Filtrer pour exclure le contact actuel et ceux déjà en relation
    const available = allContacts.filter(c => {
      if (c.id === contactId) return false;
      if (contactToUse?.relationships?.some(r => r.contactId === c.id)) return false;
      return true;
    });
    setAvailableContacts(available);
  };

  const handleAddRelation = async () => {
    if (!selectedRelationContactId || !contact) {
      Alert.alert('Erreur', 'Veuillez sélectionner un contact');
      return;
    }

    // Ajouter la relation seulement en mémoire (comme pour les enfants)
    const newRelationship: Relationship = {
      id: `temp_${Date.now()}`,
      contactId: selectedRelationContactId,
      relationType: selectedRelationType,
      customRelationLabel: selectedRelationType === RelationType.OTHER && customRelationLabel.trim()
        ? customRelationLabel.trim()
        : undefined,
    };
    
    const updatedRelationships = [...(contact.relationships || []), newRelationship];
    
    // Mettre à jour le contact en mémoire
    const updatedContact = {
      ...contact,
      relationships: updatedRelationships,
    };
    
    setContact(updatedContact);
    
    // Mettre à jour l'affichage des relations
    const allContacts = await StorageService.getContacts();
    const relatedContact = allContacts.find(c => c.id === selectedRelationContactId);
    if (relatedContact) {
      setRelationships([...relationships, relatedContact]);
    }
    
    // Mettre à jour les contacts disponibles
    await loadAvailableContacts(updatedContact);
    
    // Réinitialiser le formulaire
    setShowAddRelationForm(false);
    setSelectedRelationContactId('');
    setSelectedRelationType(RelationType.FRIEND);
    setCustomRelationLabel('');
  };

  const handleDeleteRelation = (relatedContactId: string) => {
    Alert.alert(
      'Supprimer la relation',
      'Êtes-vous sûr de vouloir supprimer cette relation ?',
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            if (!contact) return;
            
            // Supprimer la relation seulement en mémoire (comme pour l'ajout)
            const updatedRelationships = (contact.relationships || []).filter(
              r => r.contactId !== relatedContactId
            );
            
            // Mettre à jour le contact en mémoire
            const updatedContact = {
              ...contact,
              relationships: updatedRelationships,
            };
            
            setContact(updatedContact);
            
            // Mettre à jour l'affichage des relations
            const updatedDisplayRelationships = relationships.filter(
              r => r.id !== relatedContactId
            );
            setRelationships(updatedDisplayRelationships);
            
            // Mettre à jour les contacts disponibles
            loadAvailableContacts(updatedContact);
          },
        },
      ],
    );
  };

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
          // requestStatus null ou 'rejected' : vérifier aussi les demandes envoyées
          // pour couvrir les cas où la DB renvoie un résultat inattendu
          try {
            const sentRequests = await FriendRequestService.getSentRequests();
            const alreadySent = sentRequests.some(r => r.id === foundUser!.id);
            setFriendRequestStatus(alreadySent ? 'pending' : 'none');
          } catch {
            setFriendRequestStatus('none');
          }
        }
      }
    } catch (error) {
      console.log('Erreur lors de la vérification du compte GoodFriends:', error);
    }
  };

  const handleAddFriend = async () => {
    if (!goodFriendsUserId || friendRequestStatus !== 'none') return;

    setFriendRequestStatus('sending');
    try {
      await FriendRequestService.sendFriendRequest(goodFriendsUserId);
      setFriendRequestStatus('pending');
      Alert.alert('Succès', 'Demande d\'ami envoyée !');
    } catch (error: any) {
      const apiMessage: string = error?.response?.data?.message || error?.message || '';
      if (apiMessage === 'Une demande est déjà en attente') {
        setFriendRequestStatus('pending');
      } else if (apiMessage === 'Vous êtes déjà amis') {
        setFriendRequestStatus('accepted');
      } else {
        setFriendRequestStatus('none');
        Alert.alert('Erreur', apiMessage || 'Impossible d\'envoyer la demande');
      }
    }
  };

  const handleAddChild = () => {
    if (!newChildName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un prénom');
      return;
    }

    if (editingChildId) {
      // Mode édition
      const updatedChildren = children.map(c => 
        c.id === editingChildId 
          ? {
              ...c,
              firstName: newChildName.trim(),
              dateOfBirth: newChildDateOfBirth,
              gender: newChildGender,
              notes: newChildNotes.trim() || undefined,
            }
          : c
      );
      setChildren(updatedChildren);
      saveChildrenToContact(updatedChildren);
    } else {
      // Mode ajout
      const newChild: Child = {
        id: Date.now().toString(),
        firstName: newChildName.trim(),
        dateOfBirth: newChildDateOfBirth,
        gender: newChildGender,
        notes: newChildNotes.trim() || undefined,
      };

      const updatedChildren = [...children, newChild];
      setChildren(updatedChildren);
      saveChildrenToContact(updatedChildren);
    }

    // Réinitialiser le formulaire
    resetChildForm();
  };

  const resetChildForm = () => {
    setNewChildName('');
    setNewChildDateOfBirth(undefined);
    setNewChildGender('male');
    setNewChildNotes('');
    setShowAddChildForm(false);
    setEditingChildId(null);
  };

  const handleEditChild = (child: Child) => {
    setEditingChildId(child.id);
    setNewChildName(child.firstName);
    setNewChildDateOfBirth(child.dateOfBirth ? new Date(child.dateOfBirth) : undefined);
    setNewChildGender(child.gender || 'male');
    setNewChildNotes(child.notes || '');
    setShowAddChildForm(true);
  };

  const handleDeleteChild = (childId: string) => {
    Alert.alert(
      'Supprimer l\'enfant',
      'Êtes-vous sûr de vouloir supprimer cet enfant ?',
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            const updatedChildren = children.filter(c => c.id !== childId);
            setChildren(updatedChildren);
            saveChildrenToContact(updatedChildren);
          },
        },
      ],
    );
  };

  const onChildDateChange = (event: any, selectedDate?: Date) => {
    setShowChildDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setNewChildDateOfBirth(selectedDate);
    }
  };

  const getGenderLabel = (gender?: 'male' | 'female' | 'other'): string => {
    switch (gender) {
      case 'male': return '♂️ Garçon';
      case 'female': return '♀️ Fille';
      case 'other': return 'Autre';
      default: return '';
    }
  };

  const calculateChildAge = (birthDate?: Date): string => {
    if (!birthDate) return '';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    // Si moins d'un an, afficher en mois
    if (age < 1) {
      let months = monthDiff;
      if (today.getDate() < birth.getDate()) {
        months--;
      }
      if (months < 0) {
        months += 12;
      }
      
      if (months === 0) {
        // Calculer en jours pour les très jeunes bébés
        const diffTime = Math.abs(today.getTime() - birth.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
          return ' (aujourd\'hui)';
        } else if (diffDays === 1) {
          return ' (1 jour)';
        } else if (diffDays < 31) {
          return ` (${diffDays} jours)`;
        }
      }
      
      return months === 1 ? ' (1 mois)' : ` (${months} mois)`;
    }
    
    return age >= 0 ? ` (${age} ans)` : '';
  };

  const saveChildrenToContact = async (updatedChildren: Child[]) => {
    if (!contact) return;
    
    try {
      const updatedContact: Contact = {
        ...contact,
        children: updatedChildren,
        updatedAt: new Date(),
      };
      await StorageService.updateContact(updatedContact);
    } catch (error: any) {
      Alert.alert('Erreur', 'Impossible de sauvegarder les enfants');
    }
  };

  const calculateDaysUntilBirthday = (dateOfBirth: Date): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const birthDate = new Date(dateOfBirth);
    
    const nextBirthday = new Date(
      today.getFullYear(),
      birthDate.getMonth(),
      birthDate.getDate(),
      0, 0, 0, 0
    );
    
    if (nextBirthday < today) {
      nextBirthday.setFullYear(today.getFullYear() + 1);
    }
    
    const diffTime = nextBirthday.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  const calculateAge = (dateOfBirth: Date): number => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  const formatDate = (date: Date): string => {
    const months = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    
    return `${date.getDate()} ${months[date.getMonth()]}`;
  };

  const getDaysText = (days: number): string => {
    if (days === 0) return "Aujourd'hui 🎉";
    if (days === 1) return "Demain";
    return `Dans ${days} jour${days > 1 ? 's' : ''}`;
  };

  const openMessageModal = () => {
    setSelectedMessageIndex(0);
    setCustomMessage(defaultMessages[0]);
    setMessageModalVisible(true);
  };

  const handleSendSMS = async () => {
    if (!phone) {
      Alert.alert('Erreur', 'Ce contact n\'a pas de numéro de téléphone');
      return;
    }
    
    const phoneNumber = phone.replace(/\s/g, '');
    const message = encodeURIComponent(customMessage);
    const url = Platform.OS === 'ios' 
      ? `sms:${phoneNumber}&body=${message}`
      : `sms:${phoneNumber}?body=${message}`;
    
    try {
      await Linking.openURL(url);
      setMessageModalVisible(false);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application SMS');
    }
  };

  const handleSendWhatsApp = async () => {
    if (!phone) {
      Alert.alert('Erreur', 'Ce contact n\'a pas de numéro de téléphone');
      return;
    }
    
    const phoneNumber = phone.replace(/[^0-9+]/g, '');
    const message = encodeURIComponent(customMessage);
    const url = `whatsapp://send?phone=${phoneNumber}&text=${message}`;
    
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        setMessageModalVisible(false);
      } else {
        Alert.alert('Erreur', 'WhatsApp n\'est pas installé');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'ouvrir WhatsApp');
    }
  };

  const handleSendEmail = async () => {
    const message = encodeURIComponent(customMessage);
    const subject = encodeURIComponent(`Joyeux anniversaire ${firstName} !`);
    const url = `mailto:${email}?subject=${subject}&body=${message}`;
    
    try {
      await Linking.openURL(url);
      setMessageModalVisible(false);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application mail');
    }
  };

  const handleAddToCalendar = async () => {
    if (!dateOfBirth) return;

    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const nextBirthday = new Date(
      today.getFullYear(),
      birthDate.getMonth(),
      birthDate.getDate(),
      0, 0, 0, 0
    );
    
    if (nextBirthday < today) {
      nextBirthday.setFullYear(today.getFullYear() + 1);
    }

    const title = `Anniversaire ${firstName} 🎂`;
    // Format: YYYYMMDD pour un événement toute la journée
    const startDateStr = nextBirthday.toISOString().split('T')[0].replace(/-/g, '');
    const endDateStr = new Date(nextBirthday.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, '');

    // Google Calendar URL (fonctionne sur Android et web)
    // recur=RRULE:FREQ=YEARLY pour répéter chaque année
    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDateStr}/${endDateStr}&details=${encodeURIComponent('🎉 Anniversaire de ' + firstName)}&recur=RRULE:FREQ=YEARLY&location=&trp=false&sprop=name:GoodFriends`;
    
    try {
      // Ouvrir directement sans vérifier canOpenURL (problème sur Android)
      await Linking.openURL(googleCalUrl);
    } catch (error) {
      console.log('Erreur ouverture calendrier:', error);
      Alert.alert(
        '📅 Créer un événement',
        `Ouvrez votre calendrier et créez un événement :\n\nTitre: ${title}\nDate: ${nextBirthday.toLocaleDateString('fr-FR')}\nType: Événement toute la journée`,
        [{text: 'OK'}]
      );
    }
  };

  // Fonctions de gestion des professions/études
  const handleAddProf = () => {
    if (!newProfTitle.trim()) {
      Alert.alert('Erreur', 'Le titre est obligatoire');
      return;
    }

    const newProf: ProfessionStudy = {
      id: editingProfId || Date.now().toString(),
      title: newProfTitle,
      year: newProfYear,
      notes: newProfNotes,
    };

    if (editingProfId) {
      // Modifier une profession existante
      setProfessionsStudies(professionsStudies.map(p => p.id === editingProfId ? newProf : p));
    } else {
      // Ajouter une nouvelle profession
      setProfessionsStudies([...professionsStudies, newProf]);
    }

    // Réinitialiser le formulaire
    setNewProfTitle('');
    setNewProfYear(undefined);
    setNewProfNotes('');
    setShowAddProfForm(false);
    setEditingProfId(null);
  };

  const handleEditProf = (prof: ProfessionStudy) => {
    setEditingProfId(prof.id);
    setNewProfTitle(prof.title);
    setNewProfYear(prof.year);
    setNewProfNotes(prof.notes || '');
    setShowAddProfForm(true);
  };

  const handleDeleteProf = (profId: string) => {
    Alert.alert(
      'Supprimer',
      'Êtes-vous sûr de vouloir supprimer cette profession/étude ?',
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            setProfessionsStudies(professionsStudies.filter(p => p.id !== profId));
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!firstName || !lastName) {
      Alert.alert('Erreur', 'Le prénom et le nom sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      // Utiliser le state contact actuel qui a été mis à jour par handleDeleteRelation
      const updatedContact: Contact = {
        ...contact!,
        firstName,
        lastName,
        email,
        phone,
        dateOfBirth,
        age: dateOfBirth ? ContactService.calculateAge(dateOfBirth) : undefined,
        notes,
        gender,
        allergies: allergies || undefined,
        travels: travels.length > 0 ? travels : undefined,
        photo: photoUri,
        groupIds: selectedGroupId ? [selectedGroupId] : [],
        children: children,
        professionsStudies: professionsStudies,
        updatedAt: new Date(),
      };

      await StorageService.updateContact(updatedContact);
      
      // Invalider le cache pour forcer une synchronisation avec l'API
      await CacheService.invalidateCache('contacts');
      
      setSaveSuccessVisible(true);
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Supprimer le contact',
      `Êtes-vous sûr de vouloir supprimer ${firstName} ${lastName} ?`,
      [
        {text: 'Annuler', style: 'cancel'},
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteContact(contactId);
            Alert.alert('Succès', 'Contact supprimé', [
              {text: 'OK', onPress: () => navigation.goBack()},
            ]);
          },
        },
      ],
    );
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateOfBirth(selectedDate);
    }
  };

  const handleSelectPhoto = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 800,
        maxHeight: 800,
        includeBase64: true,
      });
      if (result.didCancel || !result.assets || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.base64 && asset.type) {
        setPhotoUri(`data:${asset.type};base64,${asset.base64}`);
      } else if (asset.uri) {
        setPhotoUri(asset.uri);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
  };

  const getRelationLabel = (relationType: RelationType, custom?: string): string => {
    if (custom) return custom;
    switch (relationType) {
      case RelationType.SPOUSE:     return 'Conjoint(e)';
      case RelationType.CHILD:      return 'Enfant';
      case RelationType.FATHER:     return 'Père';
      case RelationType.MOTHER:     return 'Mère';
      case RelationType.PARENT:     return 'Parent';
      case RelationType.SIBLING:    return 'Frère/Sœur';
      case RelationType.COUSIN:     return 'Cousin(e)';
      case RelationType.STEPMOTHER: return 'Belle-mère';
      case RelationType.STEPFATHER: return 'Beau-père';
      case RelationType.FRIEND:     return 'Ami(e)';
      case RelationType.COLLEAGUE:  return 'Collègue';
      default:                      return 'Autre';
    }
  };

  const getZodiacSign = (date: Date): string => {
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

  if (!contact) {
    return (
      <View style={styles(theme).container}>
        <Text>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={{flex: 1}}>
    <ScrollView style={styles(theme).container}>
      {photoUri ? (
        <View style={styles(theme).photoHeader}>
          <Image 
            source={{uri: photoUri}} 
            style={styles(theme).photoHeaderImage}
            resizeMode="cover"
          />
          <View style={styles(theme).photoHeaderOverlay}>
            <Text style={styles(theme).photoHeaderName}>
              {firstName} {lastName}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles(theme).header}>
          <View style={styles(theme).headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
              <Text style={styles(theme).backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles(theme).headerTitle}>Modifier le contact</Text>
          </View>
          <Text style={styles(theme).headerSubtitle}>{firstName} {lastName}</Text>
        </View>
      )}
      <View style={styles(theme).content}>
        <Text style={styles(theme).title}>Informations</Text>

        {/* Prénom */}
        <Text style={styles(theme).label}>Prénom *</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="Prénom"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />

        {/* Nom */}
        <Text style={styles(theme).label}>Nom *</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="Nom"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />

        {/* Date de naissance */}
        <Text style={styles(theme).label}>Date de naissance</Text>
        <TouchableOpacity
          style={styles(theme).dateButton}
          onPress={() => setShowDatePicker(true)}>
          <Text style={styles(theme).dateButtonText}>
            {dateOfBirth
              ? dateOfBirth.toLocaleDateString('fr-FR')
              : 'Sélectionner une date'}
          </Text>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={dateOfBirth || new Date()}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Signe astrologique (calculé automatiquement) */}
        {dateOfBirth && (
          <View style={styles(theme).zodiacRow}>
            <Text style={styles(theme).zodiacLabel}>Signe astrologique</Text>
            <Text style={styles(theme).zodiacValue}>{getZodiacSign(new Date(dateOfBirth))}</Text>
          </View>
        )}

        {/* Sexe */}
        <Text style={styles(theme).label}>Sexe</Text>
        <View style={styles(theme).genderButtons}>
          {(['male', 'female', 'other'] as const).map(g => (
            <TouchableOpacity
              key={g}
              style={[styles(theme).genderButton, gender === g && styles(theme).genderButtonActive]}
              onPress={() => setGender(gender === g ? undefined : g)}>
              <Text style={[styles(theme).genderButtonText, gender === g && styles(theme).genderButtonTextActive]}>
                {g === 'male' ? '♂️ Homme' : g === 'female' ? '♀️ Femme' : 'Autre'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Affichage de l'anniversaire */}
        {dateOfBirth && calculateDaysUntilBirthday(dateOfBirth) <= 30 && (
          <View style={styles(theme).birthdaySection}>
            <View style={styles(theme).birthdayCard}>
              <View style={styles(theme).birthdayIcon}>
                <Text style={styles(theme).iconText}>🎂</Text>
              </View>
              
              <View style={styles(theme).birthdayInfo}>
                <Text style={styles(theme).birthdayLabel}>Anniversaire</Text>
                <Text style={styles(theme).birthdayDate}>
                  {formatDate(dateOfBirth)} ({calculateAge(dateOfBirth)} ans)
                </Text>
                <Text style={styles(theme).daysUntilText}>
                  {getDaysText(calculateDaysUntilBirthday(dateOfBirth))}
                </Text>
              </View>

              <View style={styles(theme).birthdayActions}>
                <TouchableOpacity
                  style={styles(theme).calendarIconButton}
                  onPress={handleAddToCalendar}>
                  <Text style={styles(theme).calendarIconButtonText}>📅</Text>
                </TouchableOpacity>

                {calculateDaysUntilBirthday(dateOfBirth) <= 7 && phone && (
                  <TouchableOpacity
                    style={styles(theme).sendBirthdayMessageButton}
                    onPress={openMessageModal}>
                    <Text style={styles(theme).sendBirthdayMessageButtonText}>✉️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Enfants */}
        <View style={styles(theme).childrenSection}>
          <Text style={styles(theme).sectionTitle}>Enfants</Text>
          {children.map((child) => (
            <View key={child.id} style={styles(theme).childCard}>
              <View style={styles(theme).childCardHeader}>
                <Text style={styles(theme).childNameText}>
                  {child.firstName}
                  {calculateChildAge(child.dateOfBirth)}
                </Text>
                <View style={styles(theme).childActions}>
                  <TouchableOpacity 
                    onPress={() => handleEditChild(child)}
                    style={styles(theme).editChildButton}>
                    <Text style={styles(theme).editChildText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteChild(child.id)}>
                    <Text style={styles(theme).deleteChildText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {child.gender && (
                <Text style={styles(theme).childDetailText}>
                  {getGenderLabel(child.gender)}
                </Text>
              )}
              {child.dateOfBirth && (
                <Text style={styles(theme).childDetailText}>
                  📅 {new Date(child.dateOfBirth).toLocaleDateString('fr-FR')}
                </Text>
              )}
              {child.notes && (
                <Text style={styles(theme).childNotesText}>
                  💬 {child.notes}
                </Text>
              )}
            </View>
          ))}
          {showAddChildForm ? (
            <View style={styles(theme).addChildForm}>
              <Text style={styles(theme).addChildFormTitle}>
                {editingChildId ? 'Modifier l\'enfant' : 'Ajouter un enfant'}
              </Text>
              
              <Text style={styles(theme).childFormLabel}>Prénom *</Text>
              <TextInput
                style={styles(theme).childFormInput}
                placeholder="Prénom de l'enfant"
                value={newChildName}
                onChangeText={setNewChildName}
                autoCapitalize="words"
              />
              
              <Text style={styles(theme).childFormLabel}>Date de naissance</Text>
              <TouchableOpacity
                style={styles(theme).childFormDateButton}
                onPress={() => setShowChildDatePicker(true)}>
                <Text style={styles(theme).childFormDateText}>
                  {newChildDateOfBirth
                    ? newChildDateOfBirth.toLocaleDateString('fr-FR')
                    : 'Sélectionner une date'}
                </Text>
              </TouchableOpacity>
              
              {showChildDatePicker && (
                <DateTimePicker
                  value={newChildDateOfBirth || new Date()}
                  mode="date"
                  display="default"
                  onChange={onChildDateChange}
                  maximumDate={new Date()}
                />
              )}
              
              <Text style={styles(theme).childFormLabel}>Sexe</Text>
              <View style={styles(theme).genderButtons}>
                <TouchableOpacity
                  style={[
                    styles(theme).genderButton,
                    newChildGender === 'male' && styles(theme).genderButtonActive
                  ]}
                  onPress={() => setNewChildGender('male')}>
                  <Text style={[
                    styles(theme).genderButtonText,
                    newChildGender === 'male' && styles(theme).genderButtonTextActive
                  ]}>♂️ Garçon</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles(theme).genderButton,
                    newChildGender === 'female' && styles(theme).genderButtonActive
                  ]}
                  onPress={() => setNewChildGender('female')}>
                  <Text style={[
                    styles(theme).genderButtonText,
                    newChildGender === 'female' && styles(theme).genderButtonTextActive
                  ]}>♀️ Fille</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles(theme).genderButton,
                    newChildGender === 'other' && styles(theme).genderButtonActive
                  ]}
                  onPress={() => setNewChildGender('other')}>
                  <Text style={[
                    styles(theme).genderButtonText,
                    newChildGender === 'other' && styles(theme).genderButtonTextActive
                  ]}>Autre</Text>
                </TouchableOpacity>
              </View>
              
              <Text style={styles(theme).childFormLabel}>Notes</Text>
              <TextInput
                style={styles(theme).childFormNotesInput}
                placeholder="Notes supplémentaires..."
                value={newChildNotes}
                onChangeText={setNewChildNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              
              <View style={styles(theme).childFormButtons}>
                <TouchableOpacity
                  style={styles(theme).childFormSaveButton}
                  onPress={handleAddChild}>
                  <Text style={styles(theme).childFormSaveText}>
                    {editingChildId ? 'Modifier' : 'Ajouter'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles(theme).childFormCancelButton}
                  onPress={resetChildForm}>
                  <Text style={styles(theme).childFormCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles(theme).showAddChildButton}
              onPress={() => setShowAddChildForm(true)}>
              <Text style={styles(theme).showAddChildButtonText}>+ Ajouter un enfant</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Professions / Études */}
        <View style={styles(theme).childrenSection}>
          <Text style={styles(theme).sectionTitle}>Professions / Études</Text>
          {professionsStudies.map(prof => (
            <View key={prof.id} style={styles(theme).childCard}>
              <View style={styles(theme).childCardHeader}>
                <Text style={styles(theme).childNameText}>
                  {prof.title}
                </Text>
                <View style={styles(theme).childActions}>
                  <TouchableOpacity 
                    onPress={() => handleEditProf(prof)}
                    style={styles(theme).editChildButton}>
                    <Text style={styles(theme).editChildText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteProf(prof.id)}>
                    <Text style={styles(theme).deleteChildText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {prof.year && (
                <Text style={styles(theme).childDetailText}>
                  📅 {prof.year}
                </Text>
              )}
              {prof.notes && (
                <Text style={styles(theme).childNotesText}>
                  💬 {prof.notes}
                </Text>
              )}
            </View>
          ))}

          {showAddProfForm ? (
            <View style={styles(theme).addChildForm}>
              <Text style={styles(theme).addChildFormTitle}>
                {editingProfId ? 'Modifier la profession/étude' : 'Ajouter une profession/étude'}
              </Text>
              
              <Text style={styles(theme).childFormLabel}>Titre *</Text>
              <TextInput
                style={styles(theme).childFormInput}
                placeholder="Ex: Ingénieur, Master Informatique..."
                value={newProfTitle}
                onChangeText={setNewProfTitle}
              />
              
              <Text style={styles(theme).childFormLabel}>Année</Text>
              <TextInput
                style={styles(theme).childFormInput}
                placeholder="Ex: 2020"
                value={newProfYear?.toString() || ''}
                onChangeText={(text) => setNewProfYear(text ? parseInt(text) : undefined)}
                keyboardType="numeric"
              />
              
              <Text style={styles(theme).childFormLabel}>Notes</Text>
              <TextInput
                style={styles(theme).childFormNotesInput}
                placeholder="Notes supplémentaires..."
                value={newProfNotes}
                onChangeText={setNewProfNotes}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              
              <View style={styles(theme).childFormButtons}>
                <TouchableOpacity
                  style={styles(theme).childFormSaveButton}
                  onPress={handleAddProf}>
                  <Text style={styles(theme).childFormSaveText}>
                    {editingProfId ? 'Modifier' : 'Ajouter'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles(theme).childFormCancelButton}
                  onPress={() => {
                    setShowAddProfForm(false);
                    setEditingProfId(null);
                    setNewProfTitle('');
                    setNewProfYear(undefined);
                    setNewProfNotes('');
                  }}>
                  <Text style={styles(theme).childFormCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles(theme).showAddChildButton}
              onPress={() => setShowAddProfForm(true)}>
              <Text style={styles(theme).showAddChildButtonText}>+ Ajouter une profession/étude</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Relations */}
        <View style={styles(theme).relationshipsSection}>
          <Text style={styles(theme).sectionTitle}>Relations</Text>
          {relationships.map((relatedContact, index) => {
            const relationship = contact.relationships?.find(
              r => r.contactId === relatedContact.id,
            );
            if (!relationship) return null;
            return (
              <View key={`${relatedContact.id}-${relationship.relationType}-${index}`} style={styles(theme).relationshipCard}>
                <TouchableOpacity
                  style={styles(theme).relationshipInfo}
                  onPress={() => navigation.navigate('ContactDetail', {contactId: relatedContact.id})}>
                  <Text style={styles(theme).relationshipLabel}>
                    {getRelationLabel(relationship.relationType, relationship.customRelationLabel)}
                  </Text>
                  <Text style={styles(theme).relationshipName}>
                    {relatedContact.firstName} {relatedContact.lastName}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => handleDeleteRelation(relatedContact.id)}
                  style={styles(theme).deleteRelationButton}>
                  <Text style={styles(theme).deleteRelationText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          
          {showAddRelationForm ? (
            <View style={styles(theme).addRelationForm}>
              <Text style={styles(theme).addRelationFormTitle}>Ajouter une relation</Text>
              
              <Text style={styles(theme).relationFormLabel}>Contact *</Text>
              <View style={styles(theme).pickerContainer}>
                <Picker
                  selectedValue={selectedRelationContactId}
                  onValueChange={(itemValue) => setSelectedRelationContactId(itemValue)}
                  style={styles(theme).picker}
                  dropdownIconColor="#333">
                  <Picker.Item label="Sélectionner un contact" value="" color="#333" />
                  {availableContacts.map((c) => (
                    <Picker.Item 
                      key={c.id} 
                      label={`${c.firstName} ${c.lastName}`} 
                      value={c.id}
                      color="#333" 
                    />
                  ))}
                </Picker>
              </View>
              
              <Text style={styles(theme).relationFormLabel}>Type de relation *</Text>
              <View style={styles(theme).pickerContainer}>
                <Picker
                  selectedValue={selectedRelationType}
                  onValueChange={(itemValue) => setSelectedRelationType(itemValue as RelationType)}
                  style={styles(theme).picker}
                  dropdownIconColor="#333">
                  <Picker.Item label="Ami(e)" value={RelationType.FRIEND} color="#333" />
                  <Picker.Item label="Conjoint(e)" value={RelationType.SPOUSE} color="#333" />
                  <Picker.Item label="Enfant" value={RelationType.CHILD} color="#333" />
                  <Picker.Item label="Père" value={RelationType.FATHER} color="#333" />
                  <Picker.Item label="Mère" value={RelationType.MOTHER} color="#333" />
                  <Picker.Item label="Frère/Sœur" value={RelationType.SIBLING} color="#333" />
                  <Picker.Item label="Cousin(e)" value={RelationType.COUSIN} color="#333" />
                  <Picker.Item label="Belle-mère" value={RelationType.STEPMOTHER} color="#333" />
                  <Picker.Item label="Beau-père" value={RelationType.STEPFATHER} color="#333" />
                  <Picker.Item label="Collègue" value={RelationType.COLLEAGUE} color="#333" />
                  <Picker.Item label="Autre (précisez ci-dessous)" value={RelationType.OTHER} color="#333" />
                </Picker>
              </View>

              {selectedRelationType === RelationType.OTHER && (
                <>
                  <Text style={styles(theme).relationFormLabel}>Label personnalisé</Text>
                  <TextInput
                    style={styles(theme).input}
                    placeholder="Ex: Parrain, Marraine, Tuteur..."
                    value={customRelationLabel}
                    onChangeText={setCustomRelationLabel}
                  />
                </>
              )}
              
              <View style={styles(theme).relationFormButtons}>
                <TouchableOpacity
                  style={styles(theme).relationFormSaveButton}
                  onPress={handleAddRelation}>
                  <Text style={styles(theme).relationFormSaveText}>Ajouter</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles(theme).relationFormCancelButton}
                  onPress={() => {
                    setShowAddRelationForm(false);
                    setSelectedRelationContactId('');
                    setSelectedRelationType(RelationType.FRIEND);
                    setCustomRelationLabel('');
                  }}>
                  <Text style={styles(theme).relationFormCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles(theme).showAddRelationButton}
              onPress={() => setShowAddRelationForm(true)}>
              <Text style={styles(theme).showAddRelationButtonText}>+ Ajouter une relation</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Email */}
        <Text style={styles(theme).label}>Email</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="email@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {/* Téléphone */}
        <Text style={styles(theme).label}>Téléphone</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="+33 6 12 34 56 78"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        {/* Groupe */}
        <Text style={styles(theme).label}>Groupe</Text>
        <View style={styles(theme).pickerContainer}>
          <Picker
            selectedValue={selectedGroupId}
            onValueChange={(itemValue) => setSelectedGroupId(itemValue)}
            style={styles(theme).picker}
            dropdownIconColor="#666">
            <Picker.Item label="Aucun groupe" value="" color="#666" />
            {groups.map((group) => (
              <Picker.Item key={group.id} label={group.name} value={group.id} color="#333" />
            ))}
          </Picker>
        </View>

        {/* Allergies */}
        <Text style={styles(theme).label}>Allergies</Text>
        <TextInput
          style={styles(theme).input}
          placeholder="Ex: gluten, arachides, pénicilline..."
          value={allergies}
          onChangeText={setAllergies}
        />

        {/* Voyages en commun */}
        <View style={styles(theme).travelsSection}>
          <Text style={styles(theme).sectionTitle}>Voyages en commun</Text>
          {travels.map((t, i) => (
            <View key={i} style={styles(theme).travelItem}>
              <Text style={styles(theme).travelText}>✈️ {t}</Text>
              <TouchableOpacity onPress={() => setTravels(travels.filter((_, j) => j !== i))}>
                <Text style={styles(theme).deleteChildText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles(theme).travelInputRow}>
            <TextInput
              style={[styles(theme).input, {flex: 1, marginBottom: 0, marginRight: 8}]}
              placeholder="Destination..."
              value={newTravel}
              onChangeText={setNewTravel}
            />
            <TouchableOpacity
              style={styles(theme).travelAddButton}
              onPress={() => {
                if (newTravel.trim()) {
                  setTravels([...travels, newTravel.trim()]);
                  setNewTravel('');
                }
              }}>
              <Text style={styles(theme).travelAddButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notes */}
        <Text style={styles(theme).label}>Notes</Text>
        <TextInput
          style={[styles(theme).input, styles(theme).textArea]}
          placeholder="Notes sur cette personne..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        {/* Photos */}
        <Text style={styles(theme).label}>Photo</Text>
        <TouchableOpacity style={styles(theme).photoButton} onPress={handleSelectPhoto}>
          {photoUri ? (
            <Image source={{uri: photoUri}} style={styles(theme).photoPreview} />
          ) : (
            <Text style={styles(theme).photoButtonText}>📷 Ajouter une photo</Text>
          )}
        </TouchableOpacity>

        {/* Compte GoodFriends */}
        {!contact?.goodfriendsUserId && hasGoodFriendsAccount && (
          <View style={styles(theme).goodfriendsCard}>
            <Text style={styles(theme).goodfriendsCardTitle}>
              ✨ Ce contact a un compte GoodFriends !
            </Text>
            {friendRequestStatus === 'accepted' ? (
              <Text style={styles(theme).goodfriendsCardText}>
                ✅ Vous êtes déjà amis sur GoodFriends.
              </Text>
            ) : friendRequestStatus === 'pending' ? (
              <Text style={styles(theme).goodfriendsCardText}>
                ⏳ Demande d'ami déjà envoyée, en attente de réponse.
              </Text>
            ) : (
              <>
                <Text style={styles(theme).goodfriendsCardText}>
                  Vous pouvez l'ajouter en ami pour partager vos informations et vous envoyer des messages !
                </Text>
                <TouchableOpacity
                  style={[
                    styles(theme).addFriendButton,
                    friendRequestStatus === 'sending' && styles(theme).addFriendButtonDisabled,
                  ]}
                  onPress={handleAddFriend}
                  disabled={friendRequestStatus === 'sending'}>
                  <Text style={styles(theme).addFriendButtonText}>
                    {friendRequestStatus === 'sending' ? 'Envoi en cours...' : "Envoyer une demande d'ami"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={styles(theme).buttonContainer}>
          <TouchableOpacity
            style={[styles(theme).button, styles(theme).saveButton, loading && styles(theme).buttonDisabled]}
            onPress={handleSave}
            disabled={loading}>
            <Text style={styles(theme).saveButtonText}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles(theme).button, styles(theme).deleteButton]}
            onPress={handleDelete}>
            <Text style={styles(theme).deleteButtonText}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal pour envoyer un message d'anniversaire */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={messageModalVisible}
        onRequestClose={() => setMessageModalVisible(false)}>
        <View style={styles(theme).modalOverlay}>
          <View style={styles(theme).modalContainer}>
            <Text style={styles(theme).modalTitle}>
              Souhaiter un bon anniversaire à {firstName}
            </Text>
            
            <Text style={styles(theme).modalLabel}>Choisir un message :</Text>
            <View style={styles(theme).messageButtons}>
              {defaultMessages.map((msg, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles(theme).messageOptionButton,
                    selectedMessageIndex === index && styles(theme).messageOptionButtonActive
                  ]}
                  onPress={() => {
                    setSelectedMessageIndex(index);
                    setCustomMessage(msg);
                  }}>
                  <Text style={[
                    styles(theme).messageOptionText,
                    selectedMessageIndex === index && styles(theme).messageOptionTextActive
                  ]}>
                    Message {index + 1}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={styles(theme).modalLabel}>Personnaliser le message :</Text>
            <TextInput
              style={styles(theme).messageInput}
              value={customMessage}
              onChangeText={setCustomMessage}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            
            <Text style={styles(theme).modalLabel}>Envoyer via :</Text>
            <View style={styles(theme).sendOptions}>
              {phone && (
                <>
                  <TouchableOpacity
                    style={styles(theme).sendOptionButton}
                    onPress={handleSendSMS}>
                    <Text style={styles(theme).sendOptionIcon}>💬</Text>
                    <Text style={styles(theme).sendOptionText}>SMS</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles(theme).sendOptionButton}
                    onPress={handleSendWhatsApp}>
                    <Text style={styles(theme).sendOptionIcon}>📱</Text>
                    <Text style={styles(theme).sendOptionText}>WhatsApp</Text>
                  </TouchableOpacity>
                </>
              )}
              
              {email && (
                <TouchableOpacity
                  style={styles(theme).sendOptionButton}
                  onPress={handleSendEmail}>
                  <Text style={styles(theme).sendOptionIcon}>📧</Text>
                  <Text style={styles(theme).sendOptionText}>Email</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <TouchableOpacity
              style={styles(theme).closeModalButton}
              onPress={() => setMessageModalVisible(false)}>
              <Text style={styles(theme).closeModalButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ScrollView>

    {saveSuccessVisible && (
      <Animated.View
        style={[styles(theme).successToastOverlay, {transform: [{translateY: toastAnim}]}]}
        pointerEvents="none">
        <View style={styles(theme).successToastCard}>
          <Text style={styles(theme).successToastText}>✅  Contact mis à jour avec succès</Text>
        </View>
      </Animated.View>
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E3F2FD',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    paddingTop: 15,
  },
  dateButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
    marginBottom: 15,
  },
  picker: {
    height: 50,
    color: '#333',
    backgroundColor: '#fff',
    fontSize: 16,
  },
  relationshipsSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  relationshipCard: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  relationshipInfo: {
    flex: 1,
  },
  relationshipLabel: {
    fontSize: 12,
    color: '#9C27B0',
    fontWeight: '600',
    marginBottom: 4,
  },
  relationshipName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  deleteRelationButton: {
    padding: 8,
  },
  deleteRelationText: {
    fontSize: 20,
    color: '#f44336',
    fontWeight: 'bold',
  },
  addRelationForm: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  addRelationFormTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  relationFormLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
    marginTop: 10,
  },
  relationFormButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
  },
  relationFormSaveButton: {
    flex: 1,
    backgroundColor: '#9C27B0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  relationFormSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  relationFormCancelButton: {
    flex: 1,
    backgroundColor: '#e0e0e0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  relationFormCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  showAddRelationButton: {
    backgroundColor: '#9C27B0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  showAddRelationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  zodiacRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e5f5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  zodiacLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  zodiacValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7b1fa2',
  },
  travelsSection: {
    marginTop: 10,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 15,
  },
  travelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  travelText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  travelInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  travelAddButton: {
    backgroundColor: '#2196F3',
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  travelAddButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 26,
  },
  relationshipItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  relationshipText: {
    fontSize: 16,
    color: '#666',
  },
  manageRelationsLink: {
    marginTop: 10,
    padding: 10,
  },
  manageRelationsText: {
    color: '#9C27B0',
    fontSize: 16,
    fontWeight: '600',
  },
  childrenSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  childCard: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  childCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  childNameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  childActions: {
    flexDirection: 'row',
    gap: 10,
  },
  editChildButton: {
    padding: 5,
  },
  editChildText: {
    fontSize: 18,
  },
  deleteChildText: {
    fontSize: 20,
    color: '#f44336',
    fontWeight: 'bold',
    paddingHorizontal: 5,
  },
  childDetailText: {
    fontSize: 15,
    color: '#666',
    marginTop: 4,
  },
  childNotesText: {
    fontSize: 14,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
  },
  addChildForm: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  addChildFormTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  childFormLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
    marginTop: 10,
  },
  childFormInput: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#333',
  },
  childFormDateButton: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  childFormDateText: {
    fontSize: 16,
    color: '#333',
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 5,
  },
  genderButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  genderButtonActive: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  genderButtonText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  genderButtonTextActive: {
    color: '#2196F3',
  },
  childFormNotesInput: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 80,
    color: '#333',
  },
  childFormButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
  },
  childFormSaveButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  childFormSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  childFormCancelButton: {
    flex: 1,
    backgroundColor: '#999',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  childFormCancelText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  showAddChildButton: {
    marginTop: 10,
    padding: 10,
  },
  showAddChildButtonText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  goodfriendsCard: {
    marginTop: 20,
    padding: 20,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  goodfriendsCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 8,
  },
  goodfriendsCardText: {
    fontSize: 15,
    color: '#424242',
    marginBottom: 15,
    lineHeight: 22,
  },
  addFriendButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addFriendButtonDisabled: {
    backgroundColor: '#90CAF9',
  },
  addFriendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonContainer: {
    gap: 10,
    marginTop: 30,
    marginBottom: 20,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#2196F3',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f44336',
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  photoButton: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  photoHeader: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  photoHeaderImage: {
    width: '100%',
    height: '100%',
  },
  photoHeaderOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 15,
  },
  photoHeaderName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  photoButtonText: {
    fontSize: 16,
    color: '#666',
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  // Styles pour la section anniversaire
  birthdaySection: {
    marginTop: 15,
    marginBottom: 10,
  },
  birthdayCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  birthdayIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 28,
  },
  birthdayInfo: {
    flex: 1,
  },
  birthdayLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  birthdayDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  daysUntilText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
  },
  birthdayActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarIconButton: {
    backgroundColor: '#4CAF50',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  calendarIconButtonText: {
    fontSize: 20,
  },
  sendBirthdayMessageButton: {
    backgroundColor: '#2196F3',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  sendBirthdayMessageButtonText: {
    fontSize: 18,
    color: '#fff',
  },
  // Styles pour le modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
    marginBottom: 8,
  },
  messageButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  messageOptionButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 10,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  messageOptionButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  messageOptionText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
  messageOptionTextActive: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  messageInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sendOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    marginBottom: 15,
  },
  sendOptionButton: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    minWidth: 80,
  },
  sendOptionIcon: {
    fontSize: 32,
    marginBottom: 5,
  },
  sendOptionText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  closeModalButton: {
    backgroundColor: '#f5f5f5',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  closeModalButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  successToastOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
  },
  successToastCard: {
    backgroundColor: '#2e7d32',
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  successToastText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default ContactDetailScreen;
