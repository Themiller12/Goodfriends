import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Linking,
  Alert,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography, Semantic} from '../theme/designSystem';
import StorageService from '../services/StorageService';
import {Contact, Child} from '../types';

interface BirthdayItem {
  id: string;
  name: string;
  dateOfBirth: Date;
  age: number;
  daysUntilBirthday: number;
  isChild: boolean;
  parentName?: string;
  phone?: string;
  contactId?: string;
}

interface BirthdaysScreenProps {
  navigation: any;
}

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');
const CONFETTI_COLORS = ['#f72585', '#3a86ff', '#06d6a0', '#ffd166', '#ff9f1c', '#7209b7', '#ef476f', '#118ab2'];
const CONFETTI_COUNT = 24;
const CONFETTI_DATA = Array.from({length: CONFETTI_COUNT}, (_, i) => ({
  id: i,
  startX: ((i * 71 + 13) % 90) + 5,
  drift: ((i * 43) % 80) - 40,
  delay: (i * 220) % 2800,
  duration: 3000 + (i * 280) % 2000,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 6 + (i % 8),
  isRect: i % 3 !== 0,
}));

const BirthdaysScreen: React.FC<BirthdaysScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [selectedBirthday, setSelectedBirthday] = useState<BirthdayItem | null>(null);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(0);
  const [customMessage, setCustomMessage] = useState('');

  const confettiAnims = useRef(
    CONFETTI_DATA.map(() => ({
      y: new Animated.Value(-30),
      x: new Animated.Value(0),
      rot: new Animated.Value(0),
    }))
  ).current;

  const defaultMessages = [
    "Joyeux anniversaire ! 🎉🎂 Je te souhaite une merveilleuse journée remplie de bonheur et de moments inoubliables !",
    "Bon anniversaire ! 🎈🎁 Que cette nouvelle année t'apporte joie, santé et réussite dans tous tes projets !",
    "Happy Birthday ! 🥳🎊 Profite bien de ta journée et que tous tes vœux se réalisent !"
  ];

  useEffect(() => {
    loadBirthdays();
    const unsubscribe = navigation.addListener('focus', () => {
      loadBirthdays();
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    CONFETTI_DATA.forEach((piece, i) => {
      const anim = confettiAnims[i];
      const run = () => {
        anim.y.setValue(-30);
        anim.x.setValue(0);
        anim.rot.setValue(0);
        Animated.parallel([
          Animated.timing(anim.y, {toValue: SCREEN_HEIGHT + 30, duration: piece.duration, delay: piece.delay, useNativeDriver: true}),
          Animated.timing(anim.x, {toValue: piece.drift, duration: piece.duration, delay: piece.delay, useNativeDriver: true}),
          Animated.timing(anim.rot, {toValue: 1, duration: piece.duration, delay: piece.delay, useNativeDriver: true}),
        ]).start(({finished}) => { if (finished) run(); });
      };
      run();
    });
  }, []);

  const calculateDaysUntilBirthday = (dateOfBirth: Date): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Réinitialiser à minuit pour comparer uniquement les dates
    
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

  const loadBirthdays = async () => {
    try {
      const contacts = await StorageService.getContacts();
      const birthdayList: BirthdayItem[] = [];

      // Ajouter les contacts avec date de naissance
      contacts.forEach(contact => {
        if (contact.dateOfBirth) {
          const dob = new Date(contact.dateOfBirth);
          birthdayList.push({
            id: contact.id,
            name: `${contact.firstName} ${contact.lastName}`,
            dateOfBirth: dob,
            age: calculateAge(dob),
            daysUntilBirthday: calculateDaysUntilBirthday(dob),
            isChild: false,
            phone: contact.phone,
            contactId: contact.id,
          });
        }

        // Ajouter les enfants avec date de naissance
        if (contact.children && contact.children.length > 0) {
          contact.children.forEach((child: Child) => {
            if (child.dateOfBirth) {
              const dob = new Date(child.dateOfBirth);
              birthdayList.push({
                id: `${contact.id}-${child.firstName}`,
                name: child.firstName,
                dateOfBirth: dob,
                age: calculateAge(dob),
                daysUntilBirthday: calculateDaysUntilBirthday(dob),
                isChild: true,
                parentName: `${contact.firstName} ${contact.lastName}`,
                phone: contact.phone,
                contactId: contact.id,
              });
            }
          });
        }
      });

      // Trier par nombre de jours jusqu'à l'anniversaire
      birthdayList.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);

      setBirthdays(birthdayList);
    } catch (error) {
      console.error('Error loading birthdays:', error);
    }
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

  const openMessageModal = (item: BirthdayItem) => {
    setSelectedBirthday(item);
    setSelectedMessageIndex(0);
    setCustomMessage(defaultMessages[0]);
    setMessageModalVisible(true);
  };

  const handleSendSMS = async () => {
    if (!selectedBirthday || !selectedBirthday.phone) {
      Alert.alert('Erreur', 'Ce contact n\'a pas de numéro de téléphone');
      return;
    }
    
    const phoneNumber = selectedBirthday.phone.replace(/\s/g, '');
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
    if (!selectedBirthday || !selectedBirthday.phone) {
      Alert.alert('Erreur', 'Ce contact n\'a pas de numéro de téléphone');
      return;
    }
    
    const phoneNumber = selectedBirthday.phone.replace(/[^0-9+]/g, '');
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
    const subject = encodeURIComponent(`Joyeux anniversaire ${selectedBirthday?.name} !`);
    const url = `mailto:?subject=${subject}&body=${message}`;
    
    try {
      await Linking.openURL(url);
      setMessageModalVisible(false);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application mail');
    }
  };

  const handleAddToCalendar = async (item: BirthdayItem) => {
    const birthDate = new Date(item.dateOfBirth);
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

    const title = `Anniversaire ${item.name} 🎂`;
    // Format: YYYYMMDD pour un événement toute la journée
    const startDateStr = nextBirthday.toISOString().split('T')[0].replace(/-/g, '');
    const endDateStr = new Date(nextBirthday.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, '');

    // Google Calendar URL (fonctionne sur Android et web)
    // recur=RRULE:FREQ=YEARLY pour répéter chaque année
    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDateStr}/${endDateStr}&details=${encodeURIComponent('🎉 Anniversaire de ' + item.name)}&recur=RRULE:FREQ=YEARLY&location=&trp=false&sprop=name:GoodFriends`;
    
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

  const renderBirthdayItem = ({item}: {item: BirthdayItem}) => {
    const isToday = item.daysUntilBirthday === 0;
    const isSoon = item.daysUntilBirthday <= 7;

    return (
      <View style={[
        styles(theme).birthdayCard,
        isToday && styles(theme).todayCard,
        isSoon && !isToday && styles(theme).soonCard,
      ]}>
        <View style={styles(theme).birthdayIcon}>
          <Text style={styles(theme).iconText}>🎂</Text>
        </View>
        
        <View style={styles(theme).birthdayInfo}>
          <Text style={styles(theme).birthdayName}>{item.name}</Text>
          {item.isChild && item.parentName && (
            <Text style={styles(theme).parentInfo}>
              Enfant de {item.parentName}
            </Text>
          )}
          <View style={styles(theme).dateRow}>
            <Text style={styles(theme).birthdayDate}>
              {formatDate(item.dateOfBirth)}
            </Text>
            <Text style={styles(theme).ageText}>
              {item.age + 1} ans
            </Text>
          </View>
        </View>

        <View style={styles(theme).daysContainer}>
          <Text style={[
            styles(theme).daysText,
            isToday && styles(theme).todayText,
          ]}>
            {getDaysText(item.daysUntilBirthday)}
          </Text>
        </View>
        
        <View style={styles(theme).actionButtons}>
          <TouchableOpacity
            style={styles(theme).calendarButton}
            onPress={() => handleAddToCalendar(item)}>
            <Text style={styles(theme).calendarButtonText}>📅</Text>
          </TouchableOpacity>
          
          {isToday && (
            <TouchableOpacity
              style={styles(theme).sendMessageButton}
              onPress={() => openMessageModal(item)}>
              <Text style={styles(theme).sendMessageButtonText}>✉️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles(theme).container}>
      {/* ── Confetti de fête ── */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {CONFETTI_DATA.map((piece, i) => {
          const anim = confettiAnims[i];
          const rotate = anim.rot.interpolate({inputRange: [0, 1], outputRange: ['0deg', '540deg']});
          return (
            <Animated.View
              key={piece.id}
              style={{
                position: 'absolute',
                left: piece.startX * SCREEN_WIDTH / 100,
                top: 0,
                width: piece.isRect ? piece.size * 2.2 : piece.size,
                height: piece.isRect ? piece.size * 0.55 : piece.size,
                borderRadius: piece.isRect ? 2 : piece.size / 2,
                backgroundColor: piece.color,
                opacity: 0.8,
                transform: [{translateY: anim.y}, {translateX: anim.x}, {rotate}],
              }}
            />
          );
        })}
      </View>

      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <View style={styles(theme).backBtnCircle}>
              <MaterialIcons name="arrow-back" size={22} color="#383830" />
            </View>
          </TouchableOpacity>
          <View>
            <Text style={styles(theme).headerTitle}>Anniversaires 🎂</Text>
            <Text style={styles(theme).headerSubtitle}>
              {birthdays.length} anniversaire{birthdays.length > 1 ? 's' : ''} à venir
            </Text>
          </View>
        </View>
      </View>

      {birthdays.length === 0 ? (
        <View style={styles(theme).emptyContainer}>
          <Text style={styles(theme).emptyIcon}>🎂</Text>
          <Text style={styles(theme).emptyText}>Aucun anniversaire</Text>
          <Text style={styles(theme).emptySubtext}>
            Ajoutez des dates de naissance à vos contacts
          </Text>
        </View>
      ) : (
        <FlatList
          data={birthdays}
          renderItem={renderBirthdayItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles(theme).list}
        />
      )}
      
      {/* Modal pour envoyer un message */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={messageModalVisible}
        onRequestClose={() => setMessageModalVisible(false)}>
        <View style={styles(theme).modalOverlay}>
          <View style={styles(theme).modalContainer}>
            <Text style={styles(theme).modalTitle}>
              Souhaiter un bon anniversaire à {selectedBirthday?.name}
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
              
              <TouchableOpacity
                style={styles(theme).sendOptionButton}
                onPress={handleSendEmail}>
                <Text style={styles(theme).sendOptionIcon}>📧</Text>
                <Text style={styles(theme).sendOptionText}>Email</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity
              style={styles(theme).closeModalButton}
              onPress={() => setMessageModalVisible(false)}>
              <Text style={styles(theme).closeModalButtonText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf9f0',
  },
  header: {
    backgroundColor: 'transparent',
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
    backgroundColor: 'rgba(255,255,255,0.72)',
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
  list: {
    padding: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  birthdayCard: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadow.sm,
  },
  todayCard: {
    backgroundColor: '#FFFDE7',
    borderWidth: 1.5,
    borderColor: '#FFC107',
  },
  soonCard: {
    backgroundColor: '#F0F7FF',
    borderWidth: 1,
    borderColor: Neutral[200],
  },
  birthdayIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  iconText: {
    fontSize: 28,
  },
  birthdayInfo: {
    flex: 1,
  },
  birthdayName: {
    ...Typography.titleSm,
    color: Neutral[800],
    marginBottom: 3,
  },
  parentInfo: {
    ...Typography.bodySm,
    color: Neutral[500],
    marginBottom: 3,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  birthdayDate: {
    ...Typography.bodyMd,
    color: Neutral[600],
    marginRight: Spacing.sm,
  },
  ageText: {
    ...Typography.label,
    color: Neutral[400],
    backgroundColor: Neutral[100],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  daysContainer: {
    alignItems: 'flex-end',
    marginRight: Spacing.sm,
  },
  daysText: {
    ...Typography.label,
    fontWeight: '600',
    color: Neutral[600],
    backgroundColor: Neutral[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  todayText: {
    color: '#E65100',
    backgroundColor: '#FFF3E0',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarButton: {
    backgroundColor: Semantic.success,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  calendarButtonText: {
    fontSize: 18,
  },
  sendMessageButton: {
    backgroundColor: theme.primary,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  sendMessageButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxxl,
    marginTop: Spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 72,
    marginBottom: Spacing.xl,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.50)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Neutral[0],
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    padding: Spacing.xl,
    maxHeight: '85%',
  },
  modalTitle: {
    ...Typography.titleMd,
    color: Neutral[900],
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  modalLabel: {
    ...Typography.label,
    color: Neutral[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
  },
  messageButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  messageOptionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Neutral[200],
    backgroundColor: Neutral[0],
    alignItems: 'center',
  },
  messageOptionButtonActive: {
    borderColor: theme.primary,
    backgroundColor: theme.background,
  },
  messageOptionText: {
    ...Typography.label,
    color: Neutral[600],
  },
  messageOptionTextActive: {
    color: theme.primary,
    fontWeight: '600',
  },
  messageInput: {
    backgroundColor: Neutral[50],
    borderRadius: Radius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Neutral[800],
    borderWidth: 1.5,
    borderColor: Neutral[200],
    minHeight: 90,
    textAlignVertical: 'top',
  },
  sendOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  sendOptionButton: {
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: Radius.md,
    backgroundColor: Neutral[50],
    minWidth: 88,
    borderWidth: 1,
    borderColor: Neutral[200],
  },
  sendOptionIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  sendOptionText: {
    ...Typography.label,
    color: Neutral[700],
    fontWeight: '600',
  },
  closeModalButton: {
    backgroundColor: Neutral[100],
    borderRadius: Radius.md,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeModalButtonText: {
    ...Typography.titleSm,
    color: Neutral[600],
  },
});

export default BirthdaysScreen;
