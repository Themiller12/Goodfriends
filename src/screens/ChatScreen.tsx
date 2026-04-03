import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Text,
  ActivityIndicator,
} from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {Neutral, Spacing, Radius, Typography} from '../theme/designSystem';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {launchImageLibrary} from 'react-native-image-picker';
import {useTheme} from '../context/ThemeContext';
import MessageService, { Message, MessageReaction } from '../services/MessageService';
import AuthService from '../services/AuthService';
import AppState from '../services/AppState';
import OnlineStatusService from '../services/OnlineStatusService';
import OnlineIndicator from '../components/OnlineIndicator';

const REACTIONS = [
  {key: 'love',    icon: 'favorite',                    color: '#e53935'},
  {key: 'like',    icon: 'thumb-up',                    color: '#1976D2'},
  {key: 'dislike', icon: 'thumb-down',                  color: '#9E9E9E'},
  {key: 'wow',     icon: 'sentiment-very-satisfied',    color: '#FB8C00'},
  {key: 'angry',   icon: 'sentiment-very-dissatisfied', color: '#e53935'},
];

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
        <MaterialIcons name="reply" size={18} color="#555" />
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
  const s = useMemo(() => styles(theme), [theme]);
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
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
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

    // Charger le statut en ligne de l'interlocuteur
    OnlineStatusService.getStatuses([otherUserId]).then(r => setIsOtherUserOnline(r[otherUserId] ?? false));

    // Keyboard height tracking (Android only)
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      if (Platform.OS === 'android') {
        setKeyboardHeight(e.endCoordinates.height + insets.bottom);
        // Faire remonter les messages au-dessus du clavier
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 80);
      }
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
    // Mise à jour optimiste : on ajoute/retire la réaction immédiatement
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = [...(m.reactions ?? [])];
      const existingIdx = reactions.findIndex(r => r.userId === currentUserId && r.emoji === emoji);
      if (existingIdx !== -1) {
        reactions.splice(existingIdx, 1); // toggle off
      } else {
        // retirer toute autre réaction du user sur ce message, puis ajouter
        const filtered = reactions.filter(r => r.userId !== currentUserId);
        filtered.push({ userId: currentUserId, emoji, messageId, createdAt: new Date().toISOString() } as any);
        return { ...m, reactions: filtered };
      }
      return { ...m, reactions };
    }));
    try {
      await MessageService.reactToMessage(messageId, emoji);
      suppressAutoScrollRef.current = true;
      loadMessages(true);
      setTimeout(() => { suppressAutoScrollRef.current = false; }, 500);
    } catch (error) {
      console.error('Erreur lors de la réaction:', error);
      suppressAutoScrollRef.current = true;
      loadMessages(true);
      setTimeout(() => { suppressAutoScrollRef.current = false; }, 500);
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
          s.messageContainer,
          isMyMessage ? s.myMessageContainer : s.otherMessageContainer,
          item.replyToId ? s.messageContainerFullWidth : null,
        ]}
      >
        <SwipeableMessage onSwipeRight={() => setReplyingTo(item)}>
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={() => setReactionPickerMsg(item)}
            delayLongPress={350}
          >
            <View
              style={[
                s.messageCard,
                isMyMessage ? s.myMessageCard : s.otherMessageCard,
                item.photoUrl ? s.photoMessageCard : null,
                item.replyToId ? s.messageCardFullWidth : null,
              ]}
            >
              <View style={item.photoUrl ? s.photoCardContent : {paddingHorizontal: 12, paddingVertical: 8}}>
                {item.replyToId && (
                  <TouchableOpacity style={s.replyQuoteBubble} onPress={() => scrollToMessage(item.replyToId!)} activeOpacity={0.7}>
                    <View style={[s.replyQuoteBar, {backgroundColor: theme.primary}]} />
                    <View style={s.replyQuoteContent}>
                      <Text style={[s.replyQuoteAuthor, {color: theme.primary}]}>
                        {item.replyToSenderId === currentUserId
                          ? 'Vous'
                          : formatUserName(otherUserFirstName, otherUserLastName, otherUserEmail)}
                      </Text>
                      <Text style={s.replyQuoteText} numberOfLines={2}>
                        {item.replyToMessage ?? '[Photo]'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {item.photoUrl && (
                  <TouchableOpacity onPress={() => setLightboxUri(item.photoUrl!)}>
                    <Image
                      source={{uri: item.photoUrl}}
                      style={s.messagePhoto}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                )}
                {item.message ? (
                  renderMessageText(item.message, [s.messageText, item.photoUrl ? s.captionText : null])
                ) : null}
                <View style={s.messageTimeRow}>
                  <Text style={s.messageTime}>{formatTime(item.createdAt)}</Text>
                  {isMyMessage && (
                    <MaterialIcons
                      name={item.isRead ? 'done-all' : 'done'}
                      size={14}
                      color={item.isRead ? '#4FC3F7' : '#aaa'}
                      style={{marginLeft: 3}}
                    />
                  )}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </SwipeableMessage>
        {aggregatedReactions.length > 0 && (
          <View style={[s.reactionsRow, isMyMessage ? s.reactionsRight : s.reactionsLeft]}>
            {aggregatedReactions.map(r => (
              <TouchableOpacity
                key={r.emoji}
                style={[s.reactionBadge, r.myReaction ? s.myReactionBadge : null]}
                onPress={() => handleReact(item.id, r.emoji)}
              >
                {(() => {
                    const def = REACTIONS.find(rx => rx.key === r.emoji);
                    return def ? (
                      <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <MaterialIcons name={def.icon as any} size={14} color={r.myReaction ? def.color : '#555'} />
                        {r.count > 1 && <Text style={[s.reactionText, {marginLeft: 2}]}>{r.count}</Text>}
                      </View>
                    ) : (
                      <Text style={s.reactionText}>{r.emoji}{r.count > 1 ? ` ${r.count}` : ''}</Text>
                    );
                  })()}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton}>
            <MaterialIcons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.headerName}>{formatUserName(otherUserFirstName, otherUserLastName, otherUserEmail)}</Text>
        </View>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[s.inner, Platform.OS === 'android' ? {paddingBottom: keyboardHeight} : null]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backButton}>
          <MaterialIcons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{flex: 1}}>
          <Text style={s.headerName}>{formatUserName(otherUserFirstName, otherUserLastName, otherUserEmail)}</Text>
          {isOtherUserOnline && (
            <RNText style={s.headerOnline}>● En ligne</RNText>
          )}
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.messagesList}
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
              style={s.loadMoreBtn}
              onPress={loadOlderMessages}
              disabled={loadingMore}
              activeOpacity={0.7}
            >
              {loadingMore
                ? <ActivityIndicator size="small" color={theme.primary} />
                : <Text style={[s.loadMoreText, {color: theme.primary}]}>Charger les messages antérieurs</Text>
              }
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>Aucun message</Text>
            <Text style={s.emptySubtext}>Commencez la conversation !</Text>
          </View>
        }
      />

      {replyingTo && (
        <View style={[s.replyPreviewBar, {borderLeftColor: theme.primary, backgroundColor: theme.background}]}>
          <View style={s.replyPreviewContent}>
            <Text style={[s.replyPreviewLabel, {color: theme.primary}]}>Réponse à </Text>
            <Text style={s.replyPreviewText} numberOfLines={1}>
              {replyingTo.message ?? '[Photo]'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={s.replyPreviewClose}>
            <MaterialIcons name="close" size={18} color="#888" />
          </TouchableOpacity>
        </View>
      )}

      {/* Bandeau erreur réseau (juste au-dessus de la saisie) */}
      {networkError && (
        <View style={s.networkBanner}>
          <View style={s.networkBannerCard}>
            <Text style={s.networkBannerText}>
              Impossible de récupérer les nouveaux messages, vérifiez votre connexion réseau
            </Text>
            <TouchableOpacity onPress={() => setNetworkError(false)} style={s.networkBannerClose}>
              <MaterialIcons name="close" size={18} color="#888" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={[s.inputContainer, { paddingBottom: keyboardHeight > 0 ? Spacing.sm : Spacing.sm + insets.bottom }]}>
        <TouchableOpacity
          onPress={handlePickPhoto}
          disabled={sending}
          style={s.photoButton}>
          <MaterialIcons name="image" size={26} color={sending ? Neutral[300] : theme.primary} />
        </TouchableOpacity>
        <RNTextInput
          placeholder="Votre message..."
          placeholderTextColor="#9E9E9E"
          value={newMessage}
          onChangeText={setNewMessage}
          style={s.input}
          multiline
          maxLength={1000}
          editable={!sending}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={handleSendMessage}
          disabled={!newMessage.trim() || sending}
          style={[s.sendButton, {backgroundColor: newMessage.trim() && !sending ? theme.primary : Neutral[200]}]}>
          <MaterialIcons name="send" size={20} color={newMessage.trim() && !sending ? '#FFF' : Neutral[400]} />
        </TouchableOpacity>
      </View>

      {/* Lightbox plein écran pour les photos */}
      <Modal
        visible={lightboxUri !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}>
        <View style={s.lightboxOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setLightboxUri(null)}
          />
          {lightboxUri && (
            <Image
              source={{uri: lightboxUri}}
              style={s.lightboxImage}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity style={s.lightboxCloseBtn} onPress={() => setLightboxUri(null)}>
            <MaterialIcons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={s.lightboxSaveBtn} onPress={handleSaveImage}>
            <MaterialIcons name="file-download" size={26} color="#FFF" />
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
          style={s.reactionOverlay}
          activeOpacity={1}
          onPress={() => setReactionPickerMsg(null)}>
          <View style={s.reactionPickerContainer}>
            {REACTIONS.map(reaction => {
              const myReaction = reactionPickerMsg?.reactions?.find(r => r.userId === currentUserId)?.emoji === reaction.key;
              return (
                <TouchableOpacity
                  key={reaction.key}
                  style={[s.reactionPickerBtn, myReaction ? s.reactionPickerBtnActive : null]}
                  onPress={() => handleReact(reactionPickerMsg!.id, reaction.key)}
                >
                  <MaterialIcons name={reaction.icon as any} size={24} color={myReaction ? reaction.color : '#555'} />
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

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Neutral[50],
  },
  inner: {
    flex: 1,
  },
  header: {
    backgroundColor: theme.primary,
    paddingTop: 48,
    paddingBottom: 14,
    paddingHorizontal: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  headerName: {
    ...Typography.titleSm,
    color: '#FFF',
  },
  headerOnline: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
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
    borderRadius: Radius.lg,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  messageCardFullWidth: {
    alignSelf: 'stretch',
  },
  myMessageCard: {
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.primary + '44',
  },
  otherMessageCard: {
    backgroundColor: Neutral[0],
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
    borderRadius: Radius.sm,
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
    color: Neutral[500],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    backgroundColor: Neutral[0],
    borderTopWidth: 1,
    borderTopColor: Neutral[100],
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  photoButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 21,
    marginBottom: 2,
  },
  input: {
    flex: 1,
    backgroundColor: Neutral[100],
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
    color: Neutral[800],
    marginHorizontal: 4,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
    marginLeft: 2,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    marginVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Neutral[0],
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
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
    ...Typography.titleMd,
    color: Neutral[600],
    marginBottom: Spacing.sm,
  },
  emptySubtext: {
    ...Typography.body,
    color: Neutral[500],
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
    color: '#FFF',
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
    backgroundColor: Neutral[100],
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 4,
    marginTop: 2,
    borderWidth: 1,
    borderColor: Neutral[200],
  },
  myReactionBadge: {
    backgroundColor: theme.background,
    borderColor: theme.primary,
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
    backgroundColor: Neutral[0],
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
    backgroundColor: theme.background,
    borderWidth: 2,
    borderColor: theme.primary,
  },
  reactionPickerText: {
    fontSize: 32,
  },
  networkBanner: {
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
  networkBannerCard: {
    backgroundColor: Neutral[800],
    borderRadius: Radius.md,
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
    color: Neutral[0],
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    marginRight: 10,
  },
  networkBannerClose: {
    padding: 4,
  },
  networkBannerCloseText: {
    color: Neutral[0],
    fontSize: 16,
    fontWeight: 'bold',
  },
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Neutral[100],
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
    color: Neutral[600],
  },
  replyPreviewClose: {
    padding: 4,
  },
  replyPreviewCloseText: {
    fontSize: 16,
    color: Neutral[500],
    fontWeight: '600',
  },
  replyQuoteBubble: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: Radius.sm,
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
    color: Neutral[600],
  },
});

export default ChatScreen;
