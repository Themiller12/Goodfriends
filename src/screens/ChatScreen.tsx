import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Platform,
  Alert,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Vibration,
  Animated,
  PanResponder,
  TextInput as RNTextInput,
  Share,
  Linking,
  Text as RNText,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, ActivityIndicator } from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Modal from '../components/AppModal';
import ZoomableView from '../components/ZoomableView';
import { Neutral } from '../theme/designSystem';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, KeyboardEvents } from 'react-native-keyboard-controller';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { pick, types as pickerTypes, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { useTheme } from '../context/ThemeContext';
import MessageService, { Message, MessageReaction, MAX_ATTACHMENT_BYTES, ALLOWED_FILE_EXTENSIONS } from '../services/MessageService';
import AudioService from '../services/AudioService';
import AuthService from '../services/AuthService';
import AppState from '../services/AppState';
import NotificationService from '../services/NotificationService';
import OutboxService from '../services/OutboxService';
import MessagesLoading from '../components/MessagesLoading';
import { LinkedText, LinkPreviewCard } from '../components/LinkedText';
import { ensureCameraPermission, alertPickerError } from '../utils/cameraPermission';
import StorageService from '../services/StorageService';
import OnlineStatusService from '../services/OnlineStatusService';
import ApiClient from '../services/ApiClient';
import API_CONFIG from '../config/api';
import AuthImage from '../components/AuthImage';

const REACTIONS = [
  { key: 'love',    emoji: '❤️' },
  { key: 'like',    emoji: '👍' },
  { key: 'wow',     emoji: '😮' },
  { key: 'haha',    emoji: '😂' },
  { key: 'dislike', emoji: '👎' },
  { key: 'angry',   emoji: '😡' },
];
const REACTION_EMOJI: Record<string, string> = Object.fromEntries(REACTIONS.map(r => [r.key, r.emoji]));

const CACHE_SIZE = 50;

const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

// Swipeable message wrapper
const SwipeableMessage: React.FC<{
  onSwipeRight: () => void;
  children: React.ReactNode;
}> = ({ onSwipeRight, children }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const hasTriggered = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) =>
        gs.dx > 5 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => { hasTriggered.current = false; },
      onPanResponderMove: (_e, gs) => {
        if (gs.dx > 0) {
          translateX.setValue(Math.min(gs.dx, 80));
          if (!hasTriggered.current && gs.dx > 40) {
            hasTriggered.current = true;
            Vibration.vibrate(40);
            onSwipeRight();
          }
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const iconOpacity = translateX.interpolate({
    inputRange: [0, 30, 60],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={{ position: 'relative' }}>
      <Animated.View style={{ position: 'absolute', left: -28, top: 0, bottom: 0, justifyContent: 'center', opacity: iconOpacity }}>
        <MaterialIcons name="reply" size={18} color="#555" />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
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
  const { theme } = useTheme();
  const s = useMemo(() => styles(theme), [theme]);
  const navigation = useNavigation<any>();
  const route = useRoute<ChatScreenRouteProp>();
  const insets = useSafeAreaInsets();
  const { otherUserId, otherUserFirstName, otherUserLastName, otherUserEmail } = route.params;

  const formatUserName = (fn?: string, ln?: string, email?: string) => {
    if (fn && ln) return `${fn} ${ln}`;
    if (fn) return fn;
    if (ln) return ln;
    return email || 'Chat';
  };

  const [messages, setMessages] = useState<Message[]>([]);
  // Messages en attente d'envoi (hors ligne), affichés après les messages du serveur
  const [queued, setQueued] = useState<Message[]>([]);
  const allMessages = useMemo(() => [...messages, ...queued], [messages, queued]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  // Vrai dès que le serveur a répondu : seul moment où "Aucun message" est exact
  const [serverLoaded, setServerLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [reactionPickerMsg, setReactionPickerMsg] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
  const [reactionPickerPos, setReactionPickerPos] = useState(300);
  const [listReady, setListReady] = useState(false);
  const [isMutual, setIsMutual] = useState(true);
  const [localContactId, setLocalContactId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [playbackDur, setPlaybackDur] = useState(0);

  const recordingRef = useRef(false);
  const sendRecordingRef = useRef<() => void>(() => {});
  const flatListRef = useRef<FlatList>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onlinePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentUserIdRef = useRef('');
  const lastMessageIdRef = useRef('');
  const suppressScrollRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const scrollReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFriendCheckRef = useRef(0);
  // Double-tap detection: { id, time }
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);

  // Defer scrollToEnd until keyboard animation completes to avoid jank
  const kbAnimatingRef = useRef(false);
  const pendingScrollRef = useRef(false);
  const safeScrollToEnd = useCallback((animated = true) => {
    if (kbAnimatingRef.current) {
      pendingScrollRef.current = true;
    } else {
      flatListRef.current?.scrollToEnd({ animated });
    }
  }, []);

  const cacheKey = `@messages_${otherUserId}`;

  useEffect(() => {
    setListReady(false);
    setServerLoaded(false);
    setLocalContactId(null);
    StorageService.getContacts().then(contacts => {
      const found = contacts.find(c => c.goodfriendsUserId === otherUserId);
      if (found) setLocalContactId(found.id);
    }).catch(() => {});
    loadCurrentUser();
    loadMessages();
    markRead();
    AppState.setCurrentOpenChat(otherUserId);
    OnlineStatusService.getStatuses([otherUserId]).then(r => setIsOtherUserOnline(r[otherUserId] ?? false));

    pollingRef.current = setInterval(() => loadMessages(true), 3000);
    onlinePollingRef.current = setInterval(() => {
      OnlineStatusService.getStatuses([otherUserId]).then(r =>
        setIsOtherUserOnline(r[otherUserId] ?? false)
      );
    }, 30000);

    return () => {
      AppState.setCurrentOpenChat(null);
      markRead();
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (onlinePollingRef.current) clearInterval(onlinePollingRef.current);
      if (scrollReadyTimerRef.current) clearTimeout(scrollReadyTimerRef.current);
    };
  }, [otherUserId]);

  useEffect(() => {
    const willShow = KeyboardEvents.addListener('keyboardWillShow', () => { kbAnimatingRef.current = true; });
    const didShow  = KeyboardEvents.addListener('keyboardDidShow',  () => {
      kbAnimatingRef.current = false;
      pendingScrollRef.current = false;
      // Toujours scroller en bas quand le clavier est ouvert
      flatListRef.current?.scrollToEnd({ animated: false });
    });
    const willHide = KeyboardEvents.addListener('keyboardWillHide', () => { kbAnimatingRef.current = true; });
    const didHide  = KeyboardEvents.addListener('keyboardDidHide',  () => { kbAnimatingRef.current = false; });
    return () => { willShow.remove(); didShow.remove(); willHide.remove(); didHide.remove(); };
  }, []);

  // Lecture des messages vocaux et enregistrement
  useEffect(() => {
    const subs = [
      AudioService.onProgress(p => {
        setPlaybackPos(p.positionMs);
        setPlaybackDur(p.durationMs);
      }),
      AudioService.onEnd(() => {
        setPlayingId(null);
        setPlaybackPaused(false);
        setPlaybackPos(0);
      }),
      AudioService.onError(() => {
        setPlayingId(null);
        setPlaybackPaused(false);
        setPlaybackPos(0);
      }),
      AudioService.onRecordingLimit(() => sendRecordingRef.current()),
    ];
    return () => {
      subs.forEach(sub => sub.remove());
      AudioService.stop();
      if (recordingRef.current) {
        recordingRef.current = false;
        AudioService.cancelRecording().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setRecordSeconds(sec => sec + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // Scroll to end as soon as the list becomes visible (listReady: false → true)
  // Calling scrollToEnd while opacity=0 is a no-op on Android, so we do it here.
  useEffect(() => {
    if (listReady) {
      flatListRef.current?.scrollToEnd({ animated: false });
    }
  }, [listReady]);

  const loadCurrentUser = async () => {
    try {
      const user = await AuthService.getCurrentUser();
      if (user) {
        setCurrentUserId(user.id);
        currentUserIdRef.current = user.id;
      }
    } catch {}
  };

  const loadMessages = async (silent = false) => {
    let cacheShown = false;
    console.log(`[SCROLL] loadMessages silent=${silent}`);

    // Vérifier le statut d'amitié : toujours à la première charge, puis toutes les 30s
    const now = Date.now();
    if (!silent || now - lastFriendCheckRef.current > 30000) {
      lastFriendCheckRef.current = now;
      MessageService.checkFriendship(otherUserId).then(mutual => setIsMutual(mutual));
    }

    if (!silent) {
      // Phase 1 : afficher le cache immédiatement s'il existe
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed: Message[] = JSON.parse(cached);
          console.log(`[SCROLL] cache hit: ${parsed.length} msgs, lastId=${parsed[parsed.length-1]?.id}`);
          setMessages(parsed);
          setHasMore(parsed.length >= CACHE_SIZE);
          lastMessageIdRef.current = parsed[parsed.length - 1]?.id ?? '';
          setLoading(false);
          cacheShown = true;
          // onContentSizeChange se chargera du scroll + reveal une fois le layout complet
        } else {
          console.log('[SCROLL] no cache, showing spinner');
          setLoading(true);
        }
      } catch {
        setLoading(true);
      }
    }

    // Phase 2 : rafraîchir depuis l'API en arrière-plan
    try {
      const data = await MessageService.getConversation(otherUserId);
      setNetworkError(false);
      setServerLoaded(true);
      setHasMore(data.length >= 100);

      // Messages reçus pendant que la conversation est ouverte : les marquer comme lus
      if (data.some(m => m.receiverId === currentUserIdRef.current && !m.isRead)) {
        markRead();
      }

      if (silent || cacheShown) {
        // Ajouter uniquement les nouveaux messages par rapport au cache/état actuel
        setMessages(prev => {
          const lastId = lastMessageIdRef.current;
          if (!lastId) {
            console.log(`[SCROLL] API: no lastId, replacing all (${data.length} msgs)`);
            lastMessageIdRef.current = data[data.length - 1]?.id ?? '';
            saveCache(data);
            return data.slice(-CACHE_SIZE);
          }

          // Map rapide pour les mises à jour de réactions sur messages existants
          const dataMap = new Map(data.map(d => [d.id, d]));

          const anchorIdx = data.findIndex(m => m.id === lastId);
          const newOnes = anchorIdx >= 0 ? data.slice(anchorIdx + 1) : [];
          console.log(`[SCROLL] API: anchorIdx=${anchorIdx}, newOnes=${newOnes.length}, listReady=${listReady}`);

          // Supprimer les messages optimistes remplacés par leur vrai équivalent serveur
          // (évite les doublons quand le poll arrive avant le callback de sendMessage)
          const myNewOnes = newOnes.filter(n => n.senderId === currentUserIdRef.current);
          const withoutDupes = prev.filter(m => {
            if (!pendingIds.current.has(m.id)) return true;
            return !myNewOnes.some(
              n => n.message === m.message && (n.photoUrl ?? null) === (m.photoUrl ?? null),
            );
          });

          // Mettre à jour les réactions et isRead sur les messages existants depuis les données fraîches
          const withUpdatedReactions = withoutDupes.map(m => {
            const fresh = dataMap.get(m.id);
            if (!fresh) return m;
            const reactionsChanged = JSON.stringify(fresh.reactions) !== JSON.stringify(m.reactions);
            const readChanged = fresh.isRead !== m.isRead;
            if (reactionsChanged || readChanged) {
              return { ...m, reactions: fresh.reactions, isRead: fresh.isRead };
            }
            return m;
          });

          if (!newOnes.length) {
            // Pas de nouveaux messages, retourner seulement si les réactions ont changé
            const changed = withUpdatedReactions.some((m, i) => m !== withoutDupes[i]);
            return changed ? withUpdatedReactions : prev;
          }

          const hasIncoming = newOnes.some(m => m.senderId !== currentUserIdRef.current);
          if (hasIncoming && silent) Vibration.vibrate([0, 80, 60, 80]);
          lastMessageIdRef.current = newOnes[newOnes.length - 1].id;
          const updated = [...withUpdatedReactions, ...newOnes];
          saveCache(updated.slice(-CACHE_SIZE));
          if (!suppressScrollRef.current) {
            setTimeout(() => safeScrollToEnd(true), 80);
          }
          return updated;
        });
      } else {
        // Pas de cache — première ouverture : afficher les données API avec scroll initial
        const toCache = data.slice(-CACHE_SIZE);
        setMessages(toCache);
        lastMessageIdRef.current = toCache[toCache.length - 1]?.id ?? '';
        saveCache(toCache);
        // onContentSizeChange se chargera du scroll + reveal une fois le layout complet
      }
    } catch {
      setNetworkError(true);
      // Si l'API échoue mais qu'on a le cache, on reste visible
      if (!cacheShown) setListReady(true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const saveCache = (msgs: Message[]) => {
    // Les messages provisoires (en cours d'envoi ou en attente) ne font pas partie du cache serveur
    const stable = msgs.filter(m => !m.id.startsWith('tmp-'));
    AsyncStorage.setItem(cacheKey, JSON.stringify(stable.slice(-CACHE_SIZE))).catch(() => {});
  };

  const loadOlderMessages = async () => {
    if (loadingMore || !hasMore || !messages.length) return;
    setLoadingMore(true);
    suppressScrollRef.current = true;
    try {
      const older = await MessageService.getConversation(otherUserId, messages[0].createdAt);
      setMessages(prev => [...older, ...prev]);
      setHasMore(older.length >= 100);
    } catch {}
    finally {
      setLoadingMore(false);
      setTimeout(() => { suppressScrollRef.current = false; }, 300);
    }
  };

  const markReadInFlightRef = useRef(false);
  const markRead = async () => {
    if (markReadInFlightRef.current) return;
    markReadInFlightRef.current = true;
    try { await MessageService.markAsRead(otherUserId); } catch {}
    finally { markReadInFlightRef.current = false; }

    // Retirer la notification de cette conversation (tag FCM : msg_<id plus petit>_<id plus grand>)
    try {
      const me = currentUserIdRef.current || (await AuthService.getCurrentUser())?.id;
      await NotificationService.clearMessageNotifications(
        otherUserId,
        me ? [me, otherUserId].sort().join('_') : undefined,
      );
    } catch {}
  };

  const pendingIds = useRef<Set<string>>(new Set());

  const refreshQueued = useCallback(() => {
    setQueued(OutboxService.getPending('dm', otherUserId).map(j => OutboxService.toDirectMessage(j)));
  }, [otherUserId]);

  // Résultat d'un envoi : envoyé (remplace le message provisoire) ou mis en attente (hors ligne)
  const applySendResult = (tmpId: string, result: { status: 'sent'; message: any } | { status: 'queued' }) => {
    pendingIds.current.delete(tmpId);
    if (result.status === 'queued') {
      setMessages(prev => prev.filter(m => m.id !== tmpId));
      refreshQueued();
      return;
    }
    const sent = result.message as Message;
    setMessages(prev => {
      const updated = prev.map(m => m.id === tmpId ? sent : m);
      lastMessageIdRef.current = sent.id;
      saveCache(updated.slice(-CACHE_SIZE));
      return updated;
    });
  };

  const handlePendingPress = (item: Message) => {
    Alert.alert('Message en attente', "Ce message n'a pas encore été envoyé (pas de connexion).", [
      { text: 'Réessayer maintenant', onPress: () => OutboxService.flush() },
      { text: 'Supprimer', style: 'destructive', onPress: () => OutboxService.remove(item.id) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  useEffect(() => {
    OutboxService.ensureLoaded().then(refreshQueued);
    const unsubscribe = OutboxService.subscribe(event => {
      if (event.type === 'changed') {
        refreshQueued();
        return;
      }
      if (event.job.scope !== 'dm' || event.job.targetId !== otherUserId) return;
      if (event.type === 'sent') {
        const sent = event.message as Message;
        setMessages(prev => {
          if (prev.some(m => m.id === sent.id)) return prev;
          const updated = [...prev, sent];
          lastMessageIdRef.current = sent.id;
          saveCache(updated.slice(-CACHE_SIZE));
          return updated;
        });
        refreshQueued();
        setTimeout(() => safeScrollToEnd(true), 50);
      } else {
        refreshQueued();
        Alert.alert('Message non envoyé', event.error);
      }
    });
    OutboxService.flush();
    return unsubscribe;
  }, [otherUserId]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    const text = newMessage.trim();
    const reply = replyingTo;
    const tmpId = `tmp-${Date.now()}`;
    setNewMessage('');
    setReplyingTo(null);

    // Affichage immédiat
    const optimistic: Message = {
      id: tmpId,
      senderId: currentUserId,
      receiverId: otherUserId,
      message: text,
      isRead: false,
      createdAt: new Date().toISOString(),
      reactions: [],
      replyToId: reply?.id ?? null,
      replyToMessage: reply?.message ?? null,
      replyToSenderId: reply?.senderId ?? null,
    };
    pendingIds.current.add(tmpId);
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => safeScrollToEnd(true), 50);

    // Envoi en arrière-plan (mis en attente si la connexion est perdue)
    OutboxService.send({
      id: tmpId, scope: 'dm', kind: 'text', targetId: otherUserId,
      payload: { text, reply: reply ? { id: reply.id, text: reply.message, senderId: reply.senderId } : undefined },
    }).then(result => {
      applySendResult(tmpId, result);
    }).catch((e: any) => {
      pendingIds.current.delete(tmpId);
      setMessages(prev => prev.filter(m => m.id !== tmpId));
      setNewMessage(text);
      setReplyingTo(reply);
      const msg = e?.response?.data?.message || e?.message || "Impossible d'envoyer le message";
      if (msg.includes('supprimé') || msg.includes('ami')) {
        Alert.alert('Contact supprimé', 'La relation a été supprimée.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Erreur', msg);
      }
    });
  };

  const handlePickPhoto = async (source: 'library' | 'camera' = 'library') => {
    try {
      const options = {
        mediaType: 'photo' as const, quality: 0.5 as const, maxWidth: 1280, maxHeight: 1280, includeBase64: true,
      };
      if (source === 'camera' && !(await ensureCameraPermission())) return;
      const result = source === 'camera'
        ? await launchCamera({ ...options, cameraType: 'back', saveToPhotos: false })
        : await launchImageLibrary(options);
      if (result.didCancel) return;
      if (alertPickerError(result)) return;
      if (!result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64 || !asset.type) { Alert.alert('Erreur', "Impossible de lire l'image"); return; }

      const reply = replyingTo;
      const caption = newMessage.trim() || undefined;
      const tmpId = `tmp-${Date.now()}`;
      setReplyingTo(null);
      setNewMessage('');

      // Affichage immédiat avec base64 local
      const optimistic: Message = {
        id: tmpId,
        senderId: currentUserId,
        receiverId: otherUserId,
        message: caption ?? null,
        photoUrl: `data:${asset.type};base64,${asset.base64}`,
        isRead: false,
        createdAt: new Date().toISOString(),
        reactions: [],
        replyToId: reply?.id ?? null,
        replyToMessage: reply?.message ?? null,
        replyToSenderId: reply?.senderId ?? null,
      };
      pendingIds.current.add(tmpId);
      setMessages(prev => [...prev, optimistic]);
      setTimeout(() => safeScrollToEnd(true), 50);

      // Envoi en arrière-plan (mis en attente si la connexion est perdue)
      OutboxService.send({
        id: tmpId, scope: 'dm', kind: 'photo', targetId: otherUserId,
        payload: {
          base64: asset.base64, mime: asset.type, text: caption,
          reply: reply ? { id: reply.id, text: reply.message, senderId: reply.senderId } : undefined,
        },
      }).then(result => {
        applySendResult(tmpId, result);
      }).catch((e: any) => {
        pendingIds.current.delete(tmpId);
        setMessages(prev => prev.filter(m => m.id !== tmpId));
        Alert.alert('Erreur', e?.response?.data?.message || "Impossible d'envoyer la photo");
      });
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible d'envoyer la photo");
    }
  };

  const sendAttachmentMessage = async (
    kind: 'voice' | 'file',
    dataBase64: string,
    opts: { fileName?: string; durationMs?: number; size?: number },
  ) => {
    const reply = replyingTo;
    const tmpId = `tmp-${Date.now()}`;
    setReplyingTo(null);

    const optimistic: Message = {
      id: tmpId,
      senderId: currentUserId,
      receiverId: otherUserId,
      message: kind === 'voice' ? '🎤 Message vocal' : `📎 ${opts.fileName ?? ''}`,
      attachmentType: kind,
      attachmentName: opts.fileName ?? null,
      attachmentSize: opts.size ?? null,
      attachmentDurationMs: opts.durationMs ?? null,
      isRead: false,
      createdAt: new Date().toISOString(),
      reactions: [],
      replyToId: reply?.id ?? null,
      replyToMessage: reply?.message ?? null,
      replyToSenderId: reply?.senderId ?? null,
    };
    pendingIds.current.add(tmpId);
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => safeScrollToEnd(true), 50);

    try {
      const result = await OutboxService.send({
        id: tmpId, scope: 'dm', kind: 'attachment', targetId: otherUserId,
        payload: {
          attachKind: kind, base64: dataBase64, fileName: opts.fileName,
          durationMs: opts.durationMs, size: opts.size,
          reply: reply ? { id: reply.id, text: reply.message, senderId: reply.senderId } : undefined,
        },
      });
      applySendResult(tmpId, result);
    } catch (e: any) {
      pendingIds.current.delete(tmpId);
      setMessages(prev => prev.filter(m => m.id !== tmpId));
      Alert.alert('Erreur', e?.response?.data?.message || e?.message || "Impossible d'envoyer le message");
    }
  };

  const handlePickFile = async () => {
    try {
      const [file] = await pick({ type: [pickerTypes.allFiles], mode: 'import' });
      const fileName = file.name || 'fichier';
      const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
      if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
        Alert.alert('Fichier non autorisé', `Formats acceptés : ${ALLOWED_FILE_EXTENSIONS.join(', ')}`);
        return;
      }
      if (file.size != null && file.size > MAX_ATTACHMENT_BYTES) {
        Alert.alert('Fichier trop volumineux', 'La taille maximale est de 5 Mo.');
        return;
      }
      const dataBase64 = await AudioService.readBase64(file.uri, MAX_ATTACHMENT_BYTES);
      await sendAttachmentMessage('file', dataBase64, { fileName, size: file.size ?? undefined });
    } catch (e: any) {
      if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return;
      if (e?.code === 'FILE_TOO_LARGE') {
        Alert.alert('Fichier trop volumineux', 'La taille maximale est de 5 Mo.');
        return;
      }
      Alert.alert('Erreur', e?.message || "Impossible d'envoyer le fichier");
    }
  };

  const handleOpenFile = async (item: Message) => {
    if (item.id.startsWith('tmp-')) return;
    try {
      const url = await MessageService.getAttachmentLink(item.id);
      if (Platform.OS === 'ios') {
        await Share.share({ url, message: '' });
      } else {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert('Erreur', "Impossible d'ouvrir le fichier");
    }
  };

  const handleStartRecording = async () => {
    if (!AudioService.isAvailable) {
      Alert.alert('Indisponible', 'Les messages vocaux ne sont pas disponibles sur cet appareil.');
      return;
    }
    try {
      if (!(await AudioService.requestMicrophonePermission())) {
        Alert.alert('Microphone', "L'accès au microphone est nécessaire pour enregistrer un message vocal.");
        return;
      }
      AudioService.stop();
      setPlayingId(null);
      await AudioService.startRecording();
      recordingRef.current = true;
      setRecordSeconds(0);
      setRecording(true);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible de démarrer l'enregistrement");
    }
  };

  const handleCancelRecording = async () => {
    recordingRef.current = false;
    setRecording(false);
    try {
      await AudioService.cancelRecording();
    } catch {}
  };

  const handleSendRecording = async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    let path: string | null = null;
    try {
      const rec = await AudioService.stopRecording();
      path = rec.path;
      if (rec.durationMs < 700) return; // appui accidentel
      const dataBase64 = await AudioService.readBase64(rec.path, MAX_ATTACHMENT_BYTES);
      await sendAttachmentMessage('voice', dataBase64, { durationMs: rec.durationMs, size: rec.size });
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || "Impossible d'envoyer le message vocal");
    } finally {
      if (path) AudioService.deleteFile(path).catch(() => {});
    }
  };
  sendRecordingRef.current = handleSendRecording;

  const handleTogglePlay = async (item: Message) => {
    if (item.id.startsWith('tmp-')) return;
    if (playingId === item.id) {
      if (playbackPaused) {
        AudioService.resume();
        setPlaybackPaused(false);
      } else {
        AudioService.pause();
        setPlaybackPaused(true);
      }
      return;
    }
    setPlayingId(item.id);
    setPlaybackPaused(false);
    setPlaybackPos(0);
    setPlaybackDur(item.attachmentDurationMs ?? 0);
    try {
      const url = await MessageService.getAttachmentLink(item.id);
      const duration = await AudioService.play(item.id, url);
      if (duration > 0) setPlaybackDur(duration);
    } catch {
      setPlayingId(null);
      Alert.alert('Erreur', 'Lecture du message vocal impossible');
    }
  };

  const handleSaveImage = async () => {
    if (!lightboxUri) return;
    try {
      // Les photos du serveur sont privées : on demande un lien signé valable 2 minutes
      let url = lightboxUri;
      const photoId = /[?&]id=([A-Za-z0-9]+)/.exec(lightboxUri)?.[1];
      if (lightboxUri.startsWith(API_CONFIG.BASE_URL) && photoId) {
        const res = await ApiClient.get<any>(`/messages.php?action=photo-link&id=${photoId}`);
        url = res?.data?.url;
      }
      if (Platform.OS === 'ios') {
        await Share.share({ url, message: '' });
      } else {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer l'image");
    }
  };

  const handleReact = async (messageId: string, emoji: string) => {
    setReactionPickerMsg(null);
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId) return m;
      const reactions = [...(m.reactions ?? [])];
      const existingIdx = reactions.findIndex(r => r.userId === currentUserId && r.emoji === emoji);
      if (existingIdx !== -1) {
        reactions.splice(existingIdx, 1);
      } else {
        const filtered = reactions.filter(r => r.userId !== currentUserId);
        filtered.push({ userId: currentUserId, emoji, messageId, createdAt: new Date().toISOString() } as any);
        return { ...m, reactions: filtered };
      }
      return { ...m, reactions };
    }));
    try {
      suppressScrollRef.current = true;
      await MessageService.reactToMessage(messageId, emoji);
      loadMessages(true);
      setTimeout(() => { suppressScrollRef.current = false; }, 500);
    } catch {}
  };

  const handleDoubleTap = (item: Message) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === item.id && now - last.time < 300) {
      lastTapRef.current = null;
      handleReact(item.id, 'like');
    } else {
      lastTapRef.current = { id: item.id, time: now };
    }
  };

  const scrollToMessage = (messageId: string) => {
    const index = allMessages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    }
  };

  const aggregateReactions = (reactions: MessageReaction[]) => {
    const map = new Map<string, { count: number; myReaction: boolean }>();
    reactions.forEach(r => {
      const existing = map.get(r.emoji);
      if (existing) {
        existing.count++;
        if (r.userId === currentUserId) existing.myReaction = true;
      } else {
        map.set(r.emoji, { count: 1, myReaction: r.userId === currentUserId });
      }
    });
    return Array.from(map.entries()).map(([emoji, { count, myReaction }]) => ({ emoji, count, myReaction }));
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (days === 1) return 'Hier ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (days < 7) return date.toLocaleDateString('fr-FR', { weekday: 'short' }) + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage =  ({ item }: { item: Message }) => {
    const isMe = item.senderId === currentUserId;
    const aggregated = aggregateReactions(item.reactions ?? []);

    return (
      <View style={[s.msgWrapper, isMe ? s.msgWrapperMe : s.msgWrapperOther]}>
        <SwipeableMessage onSwipeRight={() => setReplyingTo(item)}>
          <TouchableOpacity
            activeOpacity={0.9}
            onLongPress={(e) => { if (item.pending) return; setReactionPickerMsg(item); setReactionPickerPos(e.nativeEvent.pageY); }}
            onPress={() => (item.pending ? handlePendingPress(item) : handleDoubleTap(item))}
            delayLongPress={350}>
            <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleOther, item.photoUrl ? s.bubblePhoto : null, item.replyToId ? s.bubbleWithQuote : null]}>
              {/* Reply quote */}
              {item.replyToId && (
                <TouchableOpacity
                  style={[s.replyQuote, { backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : Neutral[100] }]}
                  onPress={() => scrollToMessage(item.replyToId!)} activeOpacity={0.7}>
                  <View style={[s.replyQuoteBar, { backgroundColor: isMe ? 'rgba(255,255,255,0.7)' : theme.primary }]} />
                  <View style={s.replyQuoteContent}>
                    <RNText style={[s.replyQuoteAuthor, { color: isMe ? 'rgba(255,255,255,0.9)' : theme.primary }]}>
                      {item.replyToSenderId === currentUserId ? 'Vous' : formatUserName(otherUserFirstName, otherUserLastName, otherUserEmail)}
                    </RNText>
                    <RNText style={[s.replyQuoteText, { color: isMe ? 'rgba(255,255,255,0.75)' : Neutral[700] }]} numberOfLines={2}>{item.replyToMessage ?? '[Photo]'}</RNText>
                  </View>
                </TouchableOpacity>
              )}
              {/* Photo */}
              {item.photoUrl && (
                <TouchableOpacity
                  onPress={() => setLightboxUri(item.photoUrl!)}
                  onLongPress={(e) => { setReactionPickerMsg(item); setReactionPickerPos(e.nativeEvent.pageY); }}
                  delayLongPress={350}>
                  <AuthImage uri={item.photoUrl} style={s.photo} resizeMode="cover" />
                </TouchableOpacity>
              )}
              {/* Voice message */}
              {item.attachmentType === 'voice' && (() => {
                const isPlaying = playingId === item.id;
                const duration = isPlaying && playbackDur > 0 ? playbackDur : (item.attachmentDurationMs ?? 0);
                const progress = isPlaying && duration > 0 ? Math.min(1, playbackPos / duration) : 0;
                const accent = isMe ? '#FFF' : theme.primary;
                return (
                  <View style={s.voiceRow}>
                    <TouchableOpacity
                      onPress={() => handleTogglePlay(item)}
                      style={[s.voicePlayBtn, { backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : theme.primary + '18' }]}>
                      <MaterialIcons name={isPlaying && !playbackPaused ? 'pause' : 'play-arrow'} size={26} color={accent} />
                    </TouchableOpacity>
                    <View style={s.voiceInfo}>
                      <View style={[s.voiceTrack, { backgroundColor: isMe ? 'rgba(255,255,255,0.3)' : Neutral[200] }]}>
                        <View style={[s.voiceProgress, { width: `${progress * 100}%`, backgroundColor: accent }]} />
                      </View>
                      <RNText style={[s.voiceTime, isMe && { color: 'rgba(255,255,255,0.85)' }]}>
                        {isPlaying ? `${formatDuration(playbackPos)} / ${formatDuration(duration)}` : formatDuration(duration)}
                      </RNText>
                    </View>
                  </View>
                );
              })()}
              {/* File attachment */}
              {item.attachmentType === 'file' && (
                <TouchableOpacity style={s.fileRow} onPress={() => handleOpenFile(item)} activeOpacity={0.7}>
                  <View style={[s.fileIcon, { backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : theme.primary + '18' }]}>
                    <MaterialIcons name="insert-drive-file" size={24} color={isMe ? '#FFF' : theme.primary} />
                  </View>
                  <View style={s.fileInfo}>
                    <RNText style={[s.fileName, isMe && { color: '#FFF' }]} numberOfLines={2}>{item.attachmentName}</RNText>
                    {item.attachmentSize ? (
                      <RNText style={[s.fileSize, isMe && { color: 'rgba(255,255,255,0.8)' }]}>{formatFileSize(item.attachmentSize)}</RNText>
                    ) : null}
                  </View>
                  <MaterialIcons name="file-download" size={22} color={isMe ? '#FFF' : theme.primary} />
                </TouchableOpacity>
              )}
              {/* Text */}
              {item.message && !item.attachmentType ? (
                <>
                  <LinkedText
                    text={item.message}
                    style={[s.msgText, item.photoUrl ? s.captionText : null, isMe ? { color: '#FFF' } : null]}
                    linkColor={isMe ? '#FFF' : '#1a73e8'}
                  />
                  <LinkPreviewCard text={item.message} isMe={isMe} />
                </>
              ) : null}
              {/* Footer */}
              <View style={s.msgFooter}>
                <RNText style={[s.msgTime, isMe && { color: 'rgba(255,255,255,0.7)' }]}>{formatTime(item.createdAt)}</RNText>
                {isMe && (
                  item.pending
                    ? <MaterialIcons name="schedule" size={14} color="rgba(255,255,255,0.85)" style={{ marginLeft: 3 }} />
                    : <MaterialIcons name={item.isRead ? 'done-all' : 'done'} size={14}
                        color={item.isRead ? '#4FC3F7' : '#aaa'} style={{ marginLeft: 3 }} />
                )}
              </View>
              {item.pending && (
                <RNText style={s.pendingText}>En attente de connexion — touchez pour réessayer</RNText>
              )}
            </View>
          </TouchableOpacity>
        </SwipeableMessage>
        {/* Reactions */}
        {aggregated.length > 0 && (
          <View style={[s.reactionsRow, isMe ? s.reactionsMe : s.reactionsOther]}>
            {aggregated.map(r => (
              <TouchableOpacity key={r.emoji}
                style={[s.reactionBadge, r.myReaction && { borderColor: theme.primary, backgroundColor: theme.primary + '18' }]}
                onPress={() => handleReact(item.id, r.emoji)}>
                <RNText style={s.reactionCount}>{REACTION_EMOJI[r.emoji] ?? r.emoji}{r.count > 1 ? ` ${r.count}` : ''}</RNText>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {/* Header — fixed, never moves */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => localContactId && navigation.navigate('ContactProfile', { contactId: localContactId })}
          activeOpacity={localContactId ? 0.7 : 1}>
          <Text style={s.headerName} numberOfLines={1}>
            {formatUserName(otherUserFirstName, otherUserLastName, otherUserEmail)}
          </Text>
          {isOtherUserOnline && <RNText style={s.headerOnline}>● En ligne</RNText>}
        </TouchableOpacity>
      </View>

      {/* Content area — keyboard handled by KeyboardAvoidingView */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {loading ? (
          <MessagesLoading variant="chat" />
        ) : (<>

        <FlatList
          ref={flatListRef}
          data={allMessages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={[s.messagesList, { paddingBottom: 8 }]}
          style={{ opacity: listReady ? 1 : 0 }}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onContentSizeChange={(_w, _h) => {
            if (!listReady) {
              // Ne pas scroller ici (liste invisible, scrollToEnd ignoré par Android)
              // Juste déclencher setListReady après stabilisation
              if (scrollReadyTimerRef.current) clearTimeout(scrollReadyTimerRef.current);
              scrollReadyTimerRef.current = setTimeout(() => {
                setListReady(true);
              }, 150);
            }
          }}
          onScrollToIndexFailed={info => {
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
          ListHeaderComponent={hasMore ? (
            <TouchableOpacity style={s.loadMoreBtn} onPress={loadOlderMessages} disabled={loadingMore} activeOpacity={0.7}>
              {loadingMore
                ? <ActivityIndicator size="small" color={theme.primary} />
                : <RNText style={[s.loadMoreText, { color: theme.primary }]}>Charger les messages antérieurs</RNText>}
            </TouchableOpacity>
          ) : null}
          ListEmptyComponent={
            serverLoaded ? (
              <View style={s.emptyContainer}>
                <MaterialIcons name="chat-bubble-outline" size={40} color={Neutral[300]} />
                <RNText style={s.emptyText}>Aucun message</RNText>
                <RNText style={s.emptySubtext}>Commencez la conversation !</RNText>
              </View>
            ) : networkError ? (
              <View style={s.emptyContainer}>
                <MaterialIcons name="cloud-off" size={40} color={Neutral[300]} />
                <RNText style={s.emptyText}>Messages indisponibles</RNText>
                <RNText style={s.emptySubtext}>Vos messages ne sont pas perdus, la connexion a échoué.</RNText>
                <TouchableOpacity onPress={() => loadMessages()} style={{ marginTop: 12, padding: 8 }}>
                  <RNText style={{ color: theme.primary, fontWeight: '600' }}>Réessayer</RNText>
                </TouchableOpacity>
              </View>
            ) : (
              <MessagesLoading variant="chat" />
            )
          }
        />

        {/* Network error banner */}
        {networkError && (
          <View style={s.networkBanner}>
            <View style={s.networkBannerCard}>
              <RNText style={s.networkBannerText}>Connexion impossible — affichage du cache</RNText>
              <TouchableOpacity onPress={() => setNetworkError(false)} style={{ padding: 4 }}>
                <MaterialIcons name="close" size={18} color="#888" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Reply preview */}
        {replyingTo && (
          <View style={[s.replyBar, { borderLeftColor: theme.primary, backgroundColor: theme.background }]}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <RNText style={[s.replyBarLabel, { color: theme.primary }]}>Répondre à</RNText>
              <RNText style={s.replyBarText} numberOfLines={1}>{replyingTo.message ?? '[Photo]'}</RNText>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={18} color="#888" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        {isMutual ? (
        recording ? (
        <View style={[s.inputBar, s.recordingBar, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity onPress={handleCancelRecording} style={s.photoBtn}>
            <MaterialIcons name="delete" size={26} color="#D32F2F" />
          </TouchableOpacity>
          <View style={s.recordingInfo}>
            <View style={s.recordingDot} />
            <RNText style={s.recordingTime}>{formatDuration(recordSeconds * 1000)}</RNText>
            <RNText style={s.recordingHint}>Enregistrement…</RNText>
          </View>
          <TouchableOpacity onPress={handleSendRecording} style={[s.sendBtn, { backgroundColor: theme.primary }]}>
            <MaterialIcons name="send" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
        ) : (
        <View style={[s.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity onPress={() => handlePickPhoto('library')} style={s.photoBtn}>
            <MaterialIcons name="image" size={26} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handlePickPhoto('camera')} style={s.photoBtn}>
            <MaterialIcons name="photo-camera" size={25} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePickFile} style={s.photoBtn}>
            <MaterialIcons name="attach-file" size={24} color={theme.primary} />
          </TouchableOpacity>
          <RNTextInput
            placeholder="Votre message..."
            placeholderTextColor={Neutral[400]}
            value={newMessage}
            onChangeText={setNewMessage}
            style={s.input}
            multiline
            maxLength={1000}
            editable={!sending}
          />
          {newMessage.trim() ? (
          <TouchableOpacity
            onPress={handleSend}
            disabled={sending}
            style={[s.sendBtn, { backgroundColor: !sending ? theme.primary : Neutral[200] }]}>
            <MaterialIcons name="send" size={20} color={!sending ? '#FFF' : Neutral[400]} />
          </TouchableOpacity>
          ) : (
          <TouchableOpacity onPress={handleStartRecording} style={[s.sendBtn, { backgroundColor: theme.primary }]}>
            <MaterialIcons name="mic" size={22} color="#FFF" />
          </TouchableOpacity>
          )}
        </View>
        )
        ) : (
        <View style={[s.inputBar, s.inputBarBlocked, { paddingBottom: insets.bottom + 8 }]}>
          <MaterialIcons name="block" size={18} color={Neutral[400]} style={{ marginRight: 8 }} />
          <RNText style={s.inputBlockedText}>Vous ne pouvez plus envoyer de message à ce contact</RNText>
        </View>
        )}
        </>)}
      </KeyboardAvoidingView>

      {/* Lightbox */}
      <Modal visible={lightboxUri !== null} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <View style={s.lightboxOverlay}>
          {lightboxUri && (
            <ZoomableView onSingleTap={() => setLightboxUri(null)}>
              <AuthImage uri={lightboxUri} style={s.lightboxImage} resizeMode="contain" />
            </ZoomableView>
          )}
          <TouchableOpacity style={s.lightboxClose} onPress={() => setLightboxUri(null)}>
            <MaterialIcons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={s.lightboxDownload} onPress={handleSaveImage}>
            <MaterialIcons name="file-download" size={26} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Reaction picker */}
      <Modal visible={reactionPickerMsg !== null} transparent animationType="fade" onRequestClose={() => setReactionPickerMsg(null)}>
        <TouchableOpacity style={s.reactionOverlay} activeOpacity={1} onPress={() => setReactionPickerMsg(null)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[s.reactionPicker, { top: Math.max(60, reactionPickerPos - 70) }]}>
            {REACTIONS.map(r => {
              const isActive = reactionPickerMsg?.reactions?.find(rx => rx.userId === currentUserId)?.emoji === r.key;
              return (
                <TouchableOpacity key={r.key}
                  style={[s.reactionPickerBtn, isActive && { backgroundColor: Neutral[100], borderWidth: 2, borderColor: theme.primary }]}
                  onPress={() => handleReact(reactionPickerMsg!.id, r.key)}>
                  <RNText style={[s.reactionPickerEmoji, isActive && { transform: [{ scale: 1.2 }] }]}>{r.emoji}</RNText>
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const { width: W, height: H } = Dimensions.get('window');

const styles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    backgroundColor: theme.primary,
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerName: {
    fontSize: 17,
    fontWeight: '700',
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
  msgWrapper: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  msgWrapperMe: { alignSelf: 'flex-end' },
  msgWrapperOther: { alignSelf: 'flex-start' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  bubbleMe: {
    backgroundColor: theme.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Neutral[200],
  },
  bubblePhoto: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  photo: {
    width: W * 0.55,
    height: W * 0.55,
    borderRadius: 12,
    marginBottom: 4,
  },
  msgText: {
    fontSize: 15,
    color: theme.text,
    marginBottom: 3,
  },
  captionText: {
    fontSize: 13,
    marginTop: 2,
  },
  msgFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  msgTime: {
    fontSize: 11,
    color: Neutral[500],
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
    paddingHorizontal: 4,
  },
  reactionsMe: { justifyContent: 'flex-end' },
  reactionsOther: { justifyContent: 'flex-start' },
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
  reactionCount: { fontSize: 13, color: Neutral[600] },
  replyQuote: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
  replyQuoteBar: { width: 3 },
  replyQuoteContent: { flex: 1, paddingHorizontal: 8, paddingVertical: 4 },
  replyQuoteAuthor: { fontSize: 12, fontWeight: '700', marginBottom: 1, color: Neutral[800] },
  replyQuoteText: { fontSize: 12, color: Neutral[700] },
  bubbleWithQuote: { minWidth: 180 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: Neutral[100],
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  inputBarBlocked: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: Neutral[50],
  },
  inputBlockedText: {
    flex: 1,
    color: Neutral[400],
    fontSize: 13,
    fontStyle: 'italic',
  },
  photoBtn: {
    width: 38,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 21,
    marginBottom: 2,
  },
  recordingBar: { alignItems: 'center' },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D32F2F',
    marginRight: 8,
  },
  recordingTime: { fontSize: 16, fontWeight: '700', color: Neutral[800], marginRight: 10 },
  recordingHint: { fontSize: 13, color: Neutral[500] },
  voiceRow: { flexDirection: 'row', alignItems: 'center', minWidth: 200, marginBottom: 3 },
  voicePlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceInfo: { flex: 1, marginLeft: 10, justifyContent: 'center' },
  voiceTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  voiceProgress: { height: 4, borderRadius: 2 },
  voiceTime: { fontSize: 12, color: Neutral[600], marginTop: 5 },
  fileRow: { flexDirection: 'row', alignItems: 'center', minWidth: 210, maxWidth: W * 0.65, marginBottom: 3 },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileInfo: { flex: 1, marginHorizontal: 10 },
  fileName: { fontSize: 14, fontWeight: '600', color: theme.text },
  fileSize: { fontSize: 12, color: Neutral[600], marginTop: 2 },
  pendingText: { fontSize: 10, fontStyle: 'italic', color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 2 },
  input: {
    flex: 1,
    backgroundColor: Neutral[100],
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
    color: Neutral[800],
    marginHorizontal: 4,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Neutral[100],
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  replyBarLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  replyBarText: { fontSize: 13, color: Neutral[600] },
  networkBanner: { paddingHorizontal: 10, paddingBottom: 4 },
  networkBannerCard: {
    backgroundColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  networkBannerText: { color: '#FFF', fontSize: 13, flex: 1, marginRight: 8 },
  loadMoreBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  loadMoreText: { fontSize: 13, fontWeight: '600' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyText: { fontSize: 17, fontWeight: '600', color: Neutral[600] },
  emptySubtext: { fontSize: 14, color: Neutral[500] },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: { width: W, height: H * 0.85 },
  lightboxClose: {
    position: 'absolute', top: 48, right: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  lightboxDownload: {
    position: 'absolute', bottom: 48, right: 16,
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  reactionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  reactionPicker: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRadius: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  reactionPickerBtn: {
    padding: 8,
    borderRadius: 30,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionPickerEmoji: {
    fontSize: 26,
  },
});

export default ChatScreen;
