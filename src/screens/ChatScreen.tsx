import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  TouchableOpacity,
  Modal,
  Dimensions,
  Vibration,
  Animated,
  PanResponder,
  TextInput as RNTextInput,
  Keyboard,
  Share,
  Linking,
  Text as RNText,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Appbar,
  IconButton,
  Card,
  Text,
  ActivityIndicator,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {launchImageLibrary} from 'react-native-image-picker';
import {useTheme} from '../context/ThemeContext';
import MessageService, { Message, MessageReaction } from '../services/MessageService';
import AuthService from '../services/AuthService';
import AppState from '../services/AppState';

const REACTIONS = ['❤️', '👍', '👎', '😲', '😡'];

const SwipeableMessage: React.FC<{
  onSwipeRight: () => void;
  children: React.ReactNode;
}> = ({ onSwipeRight, children }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const hasTriggered = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gs) =>
        gs.dx > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        hasTriggered.current = false;
      },
      onPanResponderMove: (_evt, gs) => {
        if (gs.dx > 0) {
          translateX.setValue(Math.min(gs.dx, 80));
          if (!hasTriggered.current && gs.dx > 60) {
            hasTriggered.current = true;
            Vibration.vibrate(40);
            onSwipeRight();
          }
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(translateX, {toValue: 0, useNativeDriver: true}).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {toValue: 0, useNativeDriver: true}).start();
      },
    })
  ).current;

  const iconOpacity = translateX.interpolate({
    inputRange: [0, 30, 60],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={{position: 'relative'}}>
      <Animated.View
        style={{
          position: 'absolute',
          left: -28,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
          opacity: iconOpacity,
        }}>
        <Text style={{fontSize: 18}}>↩️</Text>
      </Animated.View>
      <Animated.View
        style={{transform: [{translateX}]}}
        {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
};

type ChatScreenRouteProp = RouteProp<{
  params: {
    otherUserId: string;
    otherUserFirstName?: string;
    otherUserLastName?: string;
    otherUserEmail?: string;
  };
}, 'params'>;

const ChatScreen: React.FC = () => {
  const {theme} = useTheme();
  const navigation = useNavigation();
  const route = useRoute<ChatScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { otherUserId, otherUserFirstName, otherUserLastName, otherUserEmail } = route.params;

  const formatUserName = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    } else if (firstName) {
      return firstName;
    } else if (lastName) {
      return lastName;
    }
    return email || 'Chat';
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [reactionPickerMsg, setReactionPickerMsg] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [networkError, setNetworkError] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const prevMessagesCountRef = useRef<number>(0);
  const currentUserIdRef = useRef<string>('');
  const lastMessageIdRef = useRef<string>('');
  const suppressAutoScrollRef = useRef(false);

  useEffect(() => {
    loadCurrentUser();
    loadMessages();
    markMessagesAsRead();

    // Indiquer que cette conversation est ouverte
    AppState.setCurrentOpenChat(otherUserId);

    // Keyboard height tracking (Android only)
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      if (Platform.OS === 'android') setKeyboardHeight(e.endCoordinates.height + insets.bottom);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      if (Platform.OS === 'android') setKeyboardHeight(0);
    });

    // Polling pour vérifier les nouveaux messages toutes les 3 secondes
    pollingIntervalRef.current = setInterval(() => {
      loadMessages(true);
    }, 3000) as unknown as number;

    return () => {
      // Indiquer qu'aucune conversation n'est ouverte
      AppState.setCurrentOpenChat(null);

      showSub.remove();
      hideSub.remove();

      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current as unknown as NodeJS.Timeout);
      }
    };
  }, [otherUserId]);

  const loadCurrentUser = async () => {
    try {
      const user = await AuthService.getCurrentUser();
      if (user) {
        setCurrentUserId(user.id);
        currentUserIdRef.current = user.id;
      }
    } catch (error) {
      console.error('Erreur chargement utilisateur:', error);
    }
  };

  const loadMessages = async (silent: boolean = false) => {
    const cacheKey = `@messages_${otherUserId}`;

    if (!silent) {
      // Load from cache first, skip spinner if data available
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed: Message[] = JSON.parse(cached);
          setMessages(parsed);
          setHasMore(parsed.length >= 100);
          lastMessageIdRef.current = parsed[parsed.length - 1]?.id ?? '';
          setLoading(false);
        } else {
          setLoading(true);
        }
      } catch (_e) {
        setLoading(true);
      }
    }

    try {
      const data = await MessageService.getConversation(otherUserId);
      setNetworkError(false);

      if (silent) {
        // Polling : n'ajouter que les vraiment nouveaux messages
        setMessages(prev => {
          const lastId = lastMessageIdRef.current;
          if (!lastId) {
            lastMessageIdRef.current = data[data.length - 1]?.id ?? '';
            AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
            return data;
          }
          const anchorIdx = data.findIndex(m => m.id === lastId);
          const newOnes = anchorIdx >= 0 ? data.slice(anchorIdx + 1) : [];
          if (!newOnes.length) return prev;
          if (currentUserIdRef.current) {
            const hasIncoming = newOnes.some(m => m.senderId !== currentUserIdRef.current);
            if (hasIncoming) Vibration.vibrate([0, 80, 60, 80]);
          }
          lastMessageIdRef.current = newOnes[newOnes.length - 1].id;
          const updated = [...prev, ...newOnes];
          AsyncStorage.setItem(cacheKey, JSON.stringify(updated.slice(-100))).catch(() => {});
          return updated;
        });
      } else {
        setMessages(data);
        setHasMore(data.length >= 100);
        lastMessageIdRef.current = data[data.length - 1]?.id ?? '';
        prevMessagesCountRef.current = data.length;
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 100);
        AsyncStorage.setItem(cacheKey, JSON.stringify(data)).catch(() => {});
      }
    } catch (error) {
      console.error('Erreur chargement messages:', error);
      setNetworkError(true);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadOlderMessages = async () => {
    if (loadingMore || !hasMore || !messages.length) return;
    setLoadingMore(true);
    suppressAutoScrollRef.current = true;
    try {
      const before = messages[0].createdAt;
      const older = await MessageService.getConversation(otherUserId, before);
      setMessages(prev => [...older, ...prev]);
      setHasMore(older.length >= 100);
    } catch (error) {
      console.error('Erreur chargement messages anciens:', error);
    } finally {
      setLoadingMore(false);
      setTimeout(() => { suppressAutoScrollRef.current = false; }, 300);
    }
  };

  const markMessagesAsRead = async () => {
    try {
      await MessageService.markAsRead(otherUserId);
    } catch (error) {
      console.error('Erreur marquage messages lus:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) {
      return;
    }

    try {
      setSending(true);
      const sentMessage = await MessageService.sendMessage(otherUserId, newMessage.trim(), replyingTo?.id);
      setMessages(prev => {
        const updated = [...prev, sentMessage];
        lastMessageIdRef.current = sentMessage.id;
        return updated;
      });
      setNewMessage('');
      setReplyingTo(null);
      
      // Scroller vers le bas
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error: any) {
      console.error('Erreur envoi message:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Impossible d\'envoyer le message';
      
      if (errorMessage.includes('supprimé') || errorMessage.includes('ami')) {
        Alert.alert(
          'Contact supprimé', 
          'Vous ne pouvez plus envoyer de messages à ce contact. La relation d\'amitié a été supprimée.',
          [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]
        );
      } else {
        Alert.alert('Erreur', errorMessage);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSaveImage = async () => {
    if (!lightboxUri) return;
    try {
      if (Platform.OS === 'ios') {
        await Share.share({ url: lightboxUri, message: '' });
      } else {
        await Linking.openURL(lightboxUri);
      }
    } catch (_e) {
      Alert.alert('Erreur', "Impossible d'enregistrer l'image");
    }
  };

  const handlePickPhoto = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.5,       // compression 50 %
        maxWidth: 1280,
        maxHeight: 1280,
        includeBase64: true,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      if (!asset.base64 || !asset.type) {
        Alert.alert('Erreur', 'Impossible de lire l\'image sélectionnée');
        return;
      }

      setSending(true);
      try {
        const sentMessage = await MessageService.sendPhoto(
          otherUserId,
          asset.base64,
          asset.type,
          newMessage.trim() || undefined,
          replyingTo?.id,
        );
        setMessages(prev => {
          const updated = [...prev, sentMessage];
          lastMessageIdRef.current = sentMessage.id;
          return updated;
        });
        setNewMessage('');
        setReplyingTo(null);
        setTimeout(() => flatListRef.current?.scrollToEnd({animated: true}), 100);
      } catch (error: any) {
        const errorMessage = error?.response?.data?.message || error?.message || 'Impossible d\'envoyer la photo';
        Alert.alert('Erreur', errorMessage);
      } finally {
        setSending(false);
      }
    } catch (error) {
      console.error('Erreur sélection photo:', error);
    }
  };

  const aggregateReactions = (reactions: MessageReaction[]) => {
    const map = new Map<string, {count: number; myReaction: boolean}>();
    reactions.forEach(r => {
      const existing = map.get(r.emoji);
      if (existing) {
        existing.count++;
        if (r.userId === currentUserId) existing.myReaction = true;
      } else {
        map.set(r.emoji, {count: 1, myReaction: r.userId === currentUserId});
      }
    });
    return Array.from(map.entries()).map(([emoji, {count, myReaction}]) => ({emoji, count, myReaction}));
  };

  const handleReact = async (messageId: string, emoji: string) => {
    setReactionPickerMsg(null);
    try {
      await MessageService.reactToMessage(messageId, emoji);
      loadMessages(true);
    } catch (error) {
      console.error('Erreur lors de la réaction:', error);
    }
  };

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Hier ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
      return date.toLocaleDateString('fr-FR', { weekday: 'short' }) + ' ' + 
             date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
             date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
  };

  const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/gi;

  const renderMessageText = (text: string, style: any) => {
    const parts: {text: string; isUrl: boolean}[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const regex = new RegExp(URL_REGEX.source, 'gi');
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({text: text.slice(lastIndex, match.index), isUrl: false});
      }
      parts.push({text: match[0], isUrl: true});
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({text: text.slice(lastIndex), isUrl: false});
    }
    if (parts.length === 0) return <RNText style={style}>{text}</RNText>;
    return (
      <RNText style={style}>
        {parts.map((part, i) =>
          part.isUrl ? (
            <RNText
              key={i}
              style={[style, {color: '#1a73e8', textDecorationLine: 'underline'}]}
              onPress={() => Linking.openURL(part.text.startsWith('http') ? part.text : `https://${part.text}`)}>
              {part.text}
            </RNText>
          ) : (
            <RNText key={i}>{part.text}</RNText>
          ),
        )}
      </RNText>
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMyMessage = item.senderId === currentUserId;
    const aggregatedReactions = aggregateReactions(item.reactions ?? []);

    return (
      <View
        style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessageContainer : styles.otherMessageContainer,
          item.replyToId ? styles.messageContainerFullWidth : null,
        ]}
      >
        <SwipeableMessage onSwipeRight={() => setReplyingTo(item)}>
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => setReactionPickerMsg(item)}
            delayLongPress={350}
          >
            <Card
              style={[
                styles.messageCard,
                isMyMessage ? styles.myMessageCard : styles.otherMessageCard,
                item.photoUrl ? styles.photoMessageCard : null,
                item.replyToId ? styles.messageCardFullWidth : null,
              ]}
            >
              <Card.Content style={item.photoUrl ? styles.photoCardContent : undefined}>
                {item.replyToId && (
                  <TouchableOpacity style={styles.replyQuoteBubble} onPress={() => scrollToMessage(item.replyToId!)} activeOpacity={0.7}>
                    <View style={[styles.replyQuoteBar, {backgroundColor: theme.primary}]} />
                    <View style={styles.replyQuoteContent}>
                      <Text style={[styles.replyQuoteAuthor, {color: theme.primary}]}>
                        {item.replyToSenderId === currentUserId
                          ? 'Vous'
                          : formatUserName(otherUserFirstName, otherUserLastName, otherUserEmail)}
                      </Text>
                      <Text style={styles.replyQuoteText} numberOfLines={2}>
                        {item.replyToMessage ?? '📷 Photo'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {item.photoUrl && (
                  <TouchableOpacity onPress={() => setLightboxUri(item.photoUrl!)}>
                    <Image
                      source={{uri: item.photoUrl}}
                      style={styles.messagePhoto}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}
                {item.message ? (
                  renderMessageText(item.message, [styles.messageText, item.photoUrl ? styles.captionText : null])
                ) : null}
                <View style={styles.messageTimeRow}>
                  <Text style={styles.messageTime}>{formatTime(item.createdAt)}</Text>
                  {isMyMessage && (
                    <Text style={[styles.messageTime, {color: item.isRead ? '#4FC3F7' : '#aaa', marginLeft: 3}]}>
                      {item.isRead ? '✓✓' : '✓'}
                    </Text>
                  )}
                </View>
              </Card.Content>
            </Card>
          </TouchableOpacity>
        </SwipeableMessage>
        {aggregatedReactions.length > 0 && (
          <View style={[styles.reactionsRow, isMyMessage ? styles.reactionsRight : styles.reactionsLeft]}>
            {aggregatedReactions.map(r => (
              <TouchableOpacity
                key={r.emoji}
                style={[styles.reactionBadge, r.myReaction ? styles.myReactionBadge : null]}
                onPress={() => handleReact(item.id, r.emoji)}
              >
                <Text style={styles.reactionText}>{r.emoji}{r.count > 1 ? ` ${r.count}` : ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{backgroundColor: theme.primary}}>
          <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
          <Appbar.Content title={formatUserName(otherUserFirstName, otherUserLastName, otherUserEmail)} titleStyle={{color: '#fff'}} />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, Platform.OS === 'android' ? {paddingBottom: keyboardHeight} : null]}>
      <Appbar.Header style={{backgroundColor: theme.primary}}>
        <Appbar.BackAction onPress={() => navigation.goBack()} color="#fff" />
        <Appbar.Content title={formatUserName(otherUserFirstName, otherUserLastName, otherUserEmail)} titleStyle={{color: '#fff'}} />
      </Appbar.Header>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onContentSizeChange={() => {
          if (!suppressAutoScrollRef.current) {
            flatListRef.current?.scrollToEnd({ animated: false });
          }
        }}
        onScrollToIndexFailed={(info) => {
          flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
        }}
        ListHeaderComponent={
          hasMore ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={loadOlderMessages}
              disabled={loadingMore}
              activeOpacity={0.7}
            >
              {loadingMore
                ? <ActivityIndicator size="small" color={theme.primary} />
                : <Text style={[styles.loadMoreText, {color: theme.primary}]}>↑ Charger les messages antérieurs</Text>
              }
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucun message</Text>
            <Text style={styles.emptySubtext}>Commencez la conversation !</Text>
          </View>
        }
      />

      {replyingTo && (
        <View style={[styles.replyPreviewBar, {borderLeftColor: theme.primary, backgroundColor: theme.background}]}>
          <View style={styles.replyPreviewContent}>
            <Text style={[styles.replyPreviewLabel, {color: theme.primary}]}>↩️  Réponse à</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {replyingTo.message ?? '📷 Photo'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyPreviewClose}>
            <Text style={styles.replyPreviewCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bandeau erreur réseau (juste au-dessus de la saisie) */}
      {networkError && (
        <View style={styles.networkBanner}>
          <View style={styles.networkBannerCard}>
            <Text style={styles.networkBannerText}>
              Impossible de récupérer les nouveaux messages, vérifiez votre connexion réseau
            </Text>
            <TouchableOpacity onPress={() => setNetworkError(false)} style={styles.networkBannerClose}>
              <Text style={styles.networkBannerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.inputContainer}>
        <IconButton
          icon="image-outline"
          size={26}
          iconColor={theme.primary}
          onPress={handlePickPhoto}
          disabled={sending}
          style={styles.photoButton}
        />
        <RNTextInput
          placeholder="Votre message..."
          placeholderTextColor="#9E9E9E"
          value={newMessage}
          onChangeText={setNewMessage}
          style={styles.input}
          multiline
          maxLength={1000}
          editable={!sending}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <IconButton
          icon="send"
          size={22}
          iconColor={newMessage.trim() && !sending ? '#fff' : '#aaa'}
          onPress={handleSendMessage}
          disabled={!newMessage.trim() || sending}
          style={[styles.sendButton, {backgroundColor: newMessage.trim() && !sending ? theme.primary : '#E0E0E0'}]}
        />
      </View>

      {/* Lightbox plein écran pour les photos */}
      <Modal
        visible={lightboxUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}>
        <View style={styles.lightboxOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setLightboxUri(null)}
          />
          {lightboxUri && (
            <Image
              source={{uri: lightboxUri}}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity style={styles.lightboxCloseBtn} onPress={() => setLightboxUri(null)}>
            <Text style={styles.lightboxBtnText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.lightboxSaveBtn} onPress={handleSaveImage}>
            <Text style={styles.lightboxBtnText}>⬇</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Sélecteur de réaction */}
      <Modal
        visible={reactionPickerMsg !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReactionPickerMsg(null)}>
        <TouchableOpacity
          style={styles.reactionOverlay}
          activeOpacity={1}
          onPress={() => setReactionPickerMsg(null)}>
          <View style={styles.reactionPickerContainer}>
            {REACTIONS.map(emoji => {
              const myReaction = reactionPickerMsg?.reactions?.find(r => r.userId === currentUserId)?.emoji === emoji;
              return (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionPickerBtn, myReaction ? styles.reactionPickerBtnActive : null]}
                  onPress={() => handleReact(reactionPickerMsg!.id, emoji)}
                >
                  <Text style={styles.reactionPickerText}>{emoji}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
      </View>
    </KeyboardAvoidingView>
  );
};

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  inner: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: 10,
    flexGrow: 1,
  },
  messageContainer: {
    marginVertical: 5,
    maxWidth: '80%',
  },
  messageContainerFullWidth: {
    maxWidth: '80%',
    width: '80%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
  },
  messageCard: {
    elevation: 1,
  },
  messageCardFullWidth: {
    alignSelf: 'stretch',
  },
  myMessageCard: {
    backgroundColor: '#DCF8C6',
  },
  otherMessageCard: {
    backgroundColor: '#FFFFFF',
  },
  photoMessageCard: {
    overflow: 'hidden',
  },
  photoCardContent: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  messagePhoto: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    borderRadius: 8,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    marginBottom: 4,
  },
  captionText: {
    fontSize: 13,
    marginTop: 2,
  },
  messageTimeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  messageTime: {
    fontSize: 11,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  photoButton: {
    margin: 0,
    marginBottom: 2,
  },
  input: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
    color: '#222',
    marginHorizontal: 4,
  },
  sendButton: {
    margin: 0,
    marginBottom: 2,
    marginLeft: 2,
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.85,
  },
  lightboxCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxSaveBtn: {
    position: 'absolute',
    bottom: 48,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  reactionsLeft: {
    alignSelf: 'flex-start',
  },
  reactionsRight: {
    alignSelf: 'flex-end',
  },
  reactionBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 4,
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  myReactionBadge: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
  },
  reactionText: {
    fontSize: 14,
  },
  reactionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactionPickerContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 36,
    paddingHorizontal: 12,
    paddingVertical: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  reactionPickerBtn: {
    padding: 8,
    borderRadius: 28,
    marginHorizontal: 2,
  },
  reactionPickerBtnActive: {
    backgroundColor: '#e3f2fd',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  reactionPickerText: {
    fontSize: 32,
  },
  networkBanner: {
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  networkBannerCard: {
    backgroundColor: '#323232',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 10,
  },
  networkBannerText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    marginRight: 10,
  },
  networkBannerClose: {
    padding: 4,
  },
  networkBannerCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  replyPreviewContent: {
    flex: 1,
    marginRight: 8,
  },
  replyPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  replyPreviewText: {
    fontSize: 13,
    color: '#555',
  },
  replyPreviewClose: {
    padding: 4,
  },
  replyPreviewCloseText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '600',
  },
  replyQuoteBubble: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 6,
    marginBottom: 6,
    overflow: 'hidden',
  },
  replyQuoteBar: {
    width: 3,
  },
  replyQuoteContent: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  replyQuoteAuthor: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 1,
  },
  replyQuoteText: {
    fontSize: 12,
    color: '#555',
  },
});

export default ChatScreen;
