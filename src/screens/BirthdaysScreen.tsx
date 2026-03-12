import React, {useState, useEffect} from 'react';
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
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
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

const BirthdaysScreen: React.FC<BirthdaysScreenProps> = ({navigation}) => {
  const {theme} = useTheme();
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [selectedBirthday, setSelectedBirthday] = useState<BirthdayItem | null>(null);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(0);
  const [customMessage, setCustomMessage] = useState('');
  
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
      <View style={styles(theme).header}>
        <View style={styles(theme).headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles(theme).backButton}>
            <Text style={styles(theme).backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles(theme).headerTitle}>Anniversaires</Text>
        </View>
        <Text style={styles(theme).headerSubtitle}>
          {birthdays.length} anniversaire{birthdays.length > 1 ? 's' : ''} à venir
        </Text>
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
    fontSize: 14,
    color: '#E3F2FD',
  },
  list: {
    padding: 15,
  },
  birthdayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  todayCard: {
    backgroundColor: '#FFF9C4',
    borderWidth: 2,
    borderColor: '#FFC107',
  },
  soonCard: {
    backgroundColor: '#E3F2FD',
  },
  birthdayIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  iconText: {
    fontSize: 28,
  },
  birthdayInfo: {
    flex: 1,
  },
  birthdayName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  parentInfo: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  birthdayDate: {
    fontSize: 14,
    color: '#666',
    marginRight: 10,
  },
  ageText: {
    fontSize: 13,
    color: '#999',
  },
  daysContainer: {
    alignItems: 'flex-end',
  },
  daysText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  todayText: {
    color: '#F57C00',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarButton: {
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
  calendarButtonText: {
    fontSize: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  sendMessageButton: {
    backgroundColor: theme.primary,
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
  sendMessageButtonText: {
    fontSize: 18,
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
    marginBottom: 10,
  },
  messageButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  messageOptionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  messageOptionButtonActive: {
    borderColor: theme.primary,
    backgroundColor: '#E3F2FD',
  },
  messageOptionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  messageOptionTextActive: {
    color: theme.primary,
  },
  messageInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sendOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    marginBottom: 20,
  },
  sendOptionButton: {
    alignItems: 'center',
    padding: 15,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    minWidth: 90,
  },
  sendOptionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  sendOptionText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  closeModalButton: {
    backgroundColor: '#999',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default BirthdaysScreen;
