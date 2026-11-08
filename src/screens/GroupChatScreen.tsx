import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
  Platform,
  Alert,
  ScrollView,
  Image,
  Animated,
  PanResponder,
  Vibration,
  BackHandler,
  Share,
  Linking,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Modal from '../components/AppModal';
import ZoomableView from '../components/ZoomableView';
import MessagesLoading from '../components/MessagesLoading';
import { LinkedText, LinkPreviewCard } from '../components/LinkedText';
import { VoiceMessage, FileMessage, formatDuration } from '../components/AttachmentBubbles';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, KeyboardEvents } from 'react-native-keyboard-controller';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { pick, types as pickerTypes, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { useTheme } from '../context/ThemeContext';
import { Neutral } from '../theme/designSystem';
import { GroupChat, GroupMessage, GroupMember, GroupMessageReaction } from '../types';
import GroupChatService from '../services/GroupChatService';
import AuthService from '../services/AuthService';
import AudioService from '../services/AudioService';
import AppStateService from '../services/AppState';
import NotificationService from '../services/NotificationService';
import OutboxService from '../services/OutboxService';
import { ensureCameraPermission, alertPickerError } from '../utils/cameraPermission';
import { MAX_ATTACHMENT_BYTES, ALLOWED_FILE_EXTENSIONS } from '../services/MessageService';

const REACTIONS = [
  { key: 'love',    emoji: '❤️' },
  { key: 'like',    emoji: '👍' },
  { key: 'wow',     emoji: '😮' },
  { key: 'haha',    emoji: '😂' },
  { key: 'dislike', emoji: '👎' },
  { key: 'angry',   emoji: '😡' },
];
const REACTION_EMOJI: Record<string, string> = Object.fromEntries(REACTIONS.map(r => [r.key, r.emoji]));

const SwipeableMessage: React.FC<{ onSwipeRight: () => void; children: React.ReactNode }> = ({ onSwipeRight, children }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const hasTriggered = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => gs.dx > 5 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
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
      onPanResponderRelease: () => { Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(); },
      onPanResponderTerminate: () => { Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(); },
    })
  ).current;

  const iconOpacity = translateX.interpolate({ inputRange: [0, 30, 60], outputRange: [0, 0.5, 1], extrapolate: 'clamp' });
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

const GroupChatScreen: React.FC = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const S = styles(theme);
  const { groupId } = route.params as { groupId: string };

  const [group, setGroup] = useState<GroupChat | null>(null);
  // Vrai dès que le serveur a répondu avec les messages : seul moment où "Aucun message" est exact
  const [serverLoaded, setServerLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  // Messages en attente d'envoi (hors ligne), affichés après les messages du serveur
  const [queued, setQueued] = useState<GroupMessage[]>([]);
  const allMessages = useMemo(() => [...messages, ...queued], [messages, queued]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState('me');
  const [myName, setMyName] = useState('Moi');
  const [showMembers, setShowMembers] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [replyingTo, setReplyingTo] = useState<GroupMessage | null>(null);
  const [reactionPickerMsg, setReactionPickerMsg] = useState<GroupMessage | null>(null);
  const [reactionPickerPos, setReactionPickerPos] = useState(300);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [playbackDur, setPlaybackDur] = useState(0);

  const recordingRef = useRef(false);
  const sendRecordingRef = useRef<() => void>(() => {});
  const flatListRef = useRef<FlatList>(null);
  const initialScrolled = useRef(false);
  // Double-tap detection
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

  // Back button (Android)
  useFocusEffect(useCallback(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { navigation.goBack(); return true; });
    return () => h.remove();
  }, [navigation]));

  useFocusEffect(useCallback(() => {
    initialScrolled.current = false;
    // Groupe ouvert : pas de notification pour ses nouveaux messages, et on retire celle déjà affichée
    AppStateService.setCurrentOpenChat(`group:${groupId}`);
    NotificationService.clearGroupNotifications(groupId);
    // Pré-peupler depuis le cache AsyncStorage (instantané, pas de "Chargement...")
    AsyncStorage.getItem('@group_chats_cache').then(raw => {
      if (!raw) return;
      try {
        const groups: GroupChat[] = JSON.parse(raw);
        const cached = groups.find(g => g.id === groupId);
        if (cached) {
          setGroup(cached);
          setMessages(cached.messages ?? []);
          // Scroller directement après le chargement du cache
          // (useEffect[messages.length] ne se redéclenche pas si la longueur est inchangée)
          if ((cached.messages?.length ?? 0) > 0) {
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: false });
              initialScrolled.current = true;
            }, 200);
          }
        }
      } catch {}
    });
    // Puis rafraîchir depuis l'API
    loadGroup();
    const interval = setInterval(loadGroup, 5000);
    return () => {
      clearInterval(interval);
      AppStateService.setCurrentOpenChat(null);
    };
  }, [groupId]));

  useEffect(() => { loadCurrentUser(); }, []);

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

  useEffect(() => {
    if (messages.length > 0 && !initialScrolled.current) {
      const t = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        initialScrolled.current = true;
      }, 200);
      return () => clearTimeout(t);
    }
  }, [messages.length]);

  const loadCurrentUser = async () => {
    try {
      const account = await AuthService.getCurrentUser();
      if (account?.profile) {
        setMyUserId(account.id ?? 'me');
        setMyName(`${account.profile.firstName} ${account.profile.lastName}`.trim() || 'Moi');
      }
    } catch {}
  };

  const loadGroup = async () => {
    let g: GroupChat | null = null;
    try {
      g = await GroupChatService.getById(groupId);
    } catch {}
    if (g?.messagesLoaded) {
      setServerLoaded(true);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
    if (g) {
      setGroup(g);
      setMessages(prev => {
        const freshMap = new Map(g.messages.map(m => [m.id, m]));

        // Supprimer les messages optimistes remplacés par leur vrai équivalent serveur
        const myNewFromServer = g.messages.filter(m => m.senderId === myUserId);
        const withoutDupes = prev.filter(m => {
          if (!pendingIds.current.has(m.id)) return true;
          return !myNewFromServer.some(
            n => n.text === m.text
              && (n.imageBase64 ?? null) === (m.imageBase64 ?? null)
              && (n.attachmentType ?? null) === (m.attachmentType ?? null),
          );
        });

        // Mettre à jour les réactions sur les messages existants
        const withUpdatedReactions = withoutDupes.map(m => {
          const fresh = freshMap.get(m.id);
          if (!fresh) return m;
          if (JSON.stringify(fresh.reactions) !== JSON.stringify(m.reactions)) {
            return { ...m, reactions: fresh.reactions };
          }
          return m;
        });

        // Ajouter les nouveaux messages
        const existingIds = new Set(withUpdatedReactions.map(m => m.id));
        const newOnes = g.messages.filter(m => !existingIds.has(m.id));

        if (!newOnes.length) {
          const changed = withUpdatedReactions.some((m, i) => m !== withoutDupes[i]);
          return changed ? withUpdatedReactions : prev;
        }

        return [...withUpdatedReactions, ...newOnes];
      });
    }
  };

  const pendingIds = useRef<Set<string>>(new Set());

  const refreshQueued = useCallback(() => {
    setQueued(OutboxService.getPending('group', groupId).map(j => OutboxService.toGroupMessage(j)));
  }, [groupId]);

  // Résultat d'un envoi : envoyé (remplace le message provisoire) ou mis en attente (hors ligne)
  const applySendResult = (tmpId: string, result: { status: 'sent'; message: any } | { status: 'queued' }) => {
    pendingIds.current.delete(tmpId);
    if (result.status === 'queued') {
      setMessages(prev => prev.filter(m => m.id !== tmpId));
      refreshQueued();
      return;
    }
    const sent = result.message as GroupMessage;
    setMessages(prev => prev.map(m => m.id === tmpId ? sent : m));
  };

  const handlePendingPress = (item: GroupMessage) => {
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
      if (event.job.scope !== 'group' || event.job.targetId !== groupId) return;
      if (event.type === 'sent') {
        const sent = event.message as GroupMessage;
        setMessages(prev => (prev.some(m => m.id === sent.id) ? prev : [...prev, sent]));
        refreshQueued();
        setTimeout(() => safeScrollToEnd(true), 50);
      } else {
        refreshQueued();
        Alert.alert('Message non envoyé', event.error);
      }
    });
    OutboxService.flush();
    return unsubscribe;
  }, [groupId]);

  const replyPayload = (reply: GroupMessage | null) =>
    reply ? { id: reply.id, text: reply.text, senderName: reply.senderName } : undefined;

  const handleSend = () => {
    if (!inputText.trim() && !replyingTo) return;
    const text = inputText.trim();
    const reply = replyingTo;
    const tmpId = `tmp-${Date.now()}`;
    setInputText(''); setReplyingTo(null);

    // Affichage immédiat
    const optimistic: GroupMessage = {
      id: tmpId,
      senderId: myUserId,
      senderName: myName,
      text,
      reactions: [],
      createdAt: new Date().toISOString(),
      replyToId: reply?.id,
      replyToText: reply?.text,
      replyToSenderName: reply?.senderName,
    };
    pendingIds.current.add(tmpId);
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => safeScrollToEnd(true), 50);

    // Envoi en arrière-plan (mis en attente si la connexion est perdue)
    OutboxService.send({
      id: tmpId, scope: 'group', kind: 'text', targetId: groupId,
      payload: { text, senderName: myName, reply: replyPayload(reply) },
    }).then(result => {
      applySendResult(tmpId, result);
    }).catch((e: any) => {
      pendingIds.current.delete(tmpId);
      setMessages(prev => prev.filter(m => m.id !== tmpId));
      setInputText(text); setReplyingTo(reply);
      Alert.alert('Erreur', e?.response?.data?.message || e?.message || "Impossible d'envoyer le message");
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
      const caption = inputText.trim();
      const tmpId = `tmp-${Date.now()}`;
      setReplyingTo(null); setInputText('');

      // Affichage immédiat avec base64 local
      const optimistic: GroupMessage = {
        id: tmpId,
        senderId: myUserId,
        senderName: myName,
        text: caption,
        imageBase64: asset.base64,
        imageMime: asset.type,
        reactions: [],
        createdAt: new Date().toISOString(),
        replyToId: reply?.id,
        replyToText: reply?.text,
        replyToSenderName: reply?.senderName,
      };
      pendingIds.current.add(tmpId);
      setMessages(prev => [...prev, optimistic]);
      setTimeout(() => safeScrollToEnd(true), 50);

      // Envoi en arrière-plan (mis en attente si la connexion est perdue)
      OutboxService.send({
        id: tmpId, scope: 'group', kind: 'photo', targetId: groupId,
        payload: { base64: asset.base64, mime: asset.type, text: caption, senderName: myName, reply: replyPayload(reply) },
      }).then(result => {
        applySendResult(tmpId, result);
      }).catch((e: any) => {
        pendingIds.current.delete(tmpId);
        setMessages(prev => prev.filter(m => m.id !== tmpId));
        Alert.alert('Erreur', "Impossible d'envoyer la photo");
      });
    } catch {
      Alert.alert('Erreur', "Impossible d'envoyer la photo");
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

    const optimistic: GroupMessage = {
      id: tmpId,
      senderId: myUserId,
      senderName: myName,
      text: kind === 'voice' ? '🎤 Message vocal' : `📎 ${opts.fileName ?? ''}`,
      attachmentType: kind,
      attachmentName: opts.fileName ?? null,
      attachmentSize: opts.size ?? null,
      attachmentDurationMs: opts.durationMs ?? null,
      reactions: [],
      createdAt: new Date().toISOString(),
      replyToId: reply?.id,
      replyToText: reply?.text,
      replyToSenderName: reply?.senderName,
    };
    pendingIds.current.add(tmpId);
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => safeScrollToEnd(true), 50);

    try {
      const result = await OutboxService.send({
        id: tmpId, scope: 'group', kind: 'attachment', targetId: groupId,
        payload: {
          attachKind: kind, base64: dataBase64, fileName: opts.fileName,
          durationMs: opts.durationMs, size: opts.size, senderName: myName,
          reply: replyPayload(reply),
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

  const handleOpenFile = async (item: GroupMessage) => {
    if (item.id.startsWith('tmp-')) return;
    try {
      const url = await GroupChatService.getAttachmentLink(item.id);
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

  const handleTogglePlay = async (item: GroupMessage) => {
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
      const url = await GroupChatService.getAttachmentLink(item.id);
      const duration = await AudioService.play(item.id, url);
      if (duration > 0) setPlaybackDur(duration);
    } catch {
      setPlayingId(null);
      Alert.alert('Erreur', 'Lecture du message vocal impossible');
    }
  };

  const handleDeleteMessage = (msg: GroupMessage) => {
    if (msg.senderId !== myUserId) return;
    Alert.alert('Supprimer', 'Supprimer ce message ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          await GroupChatService.deleteMessage(groupId, msg.id);
          setMessages(prev => prev.filter(m => m.id !== msg.id));
        },
      },
    ]);
  };

  const handleReact = async (msg: GroupMessage, emoji: string) => {
    setReactionPickerMsg(null);
    // Optimistic UI update
    setMessages(prev => prev.map(m => {
      if (m.id !== msg.id) return m;
      const reactions = [...(m.reactions ?? [])];
      const idx = reactions.findIndex(r => r.userId === myUserId && r.emoji === emoji);
      if (idx !== -1) {
        reactions.splice(idx, 1);
        return { ...m, reactions };
      }
      const filtered = reactions.filter(r => r.userId !== myUserId);
      filtered.push({ userId: myUserId, emoji });
      return { ...m, reactions: filtered };
    }));
    const serverReactions = await GroupChatService.reactToMessage(groupId, msg.id, myUserId, emoji);
    // Reconcile with server's authoritative list
    if (serverReactions !== null) {
      setMessages(prev => prev.map(m =>
        m.id !== msg.id ? m : { ...m, reactions: serverReactions }
      ));
    }
  };

  const handleDoubleTap = (item: GroupMessage) => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === item.id && now - last.time < 300) {
      lastTapRef.current = null;
      handleReact(item, 'like');
    } else {
      lastTapRef.current = { id: item.id, time: now };
    }
  };

  const handleRename = async () => {
    if (!renameValue.trim()) return;
    await GroupChatService.update(groupId, { name: renameValue.trim() });
    setGroup(prev => prev ? { ...prev, name: renameValue.trim() } : prev);
    setShowRenameModal(false);
  };

  const handleDeleteGroup = () => {
    Alert.alert('Supprimer le groupe', `Supprimer "${group?.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          await GroupChatService.delete(groupId);
          navigation.goBack();
        },
      },
    ]);
  };

  const scrollToMessage = (messageId: string) => {
    const index = allMessages.findIndex(m => m.id === messageId);
    if (index !== -1) flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso); const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    const t = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return t;
    if (diffDays === 1) return `Hier ${t}`;
    if (diffDays < 7) return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${t}`;
    return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${t}`;
  };

  const getColor = (id: string) => {
    const colors = ['#e53935', '#8e24aa', '#1e88e5', '#00897b', '#f4511e', '#6d4c41', '#039be5'];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const getInitials = (m: GroupMember) =>
    `${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase();

  const aggregateReactions = (reactions: GroupMessageReaction[]) => {
    const map = new Map<string, { count: number; mine: boolean }>();
    reactions.forEach(r => {
      const e = map.get(r.emoji);
      if (e) { e.count++; if (r.userId === myUserId) e.mine = true; }
      else map.set(r.emoji, { count: 1, mine: r.userId === myUserId });
    });
    return Array.from(map.entries()).map(([emoji, { count, mine }]) => ({ emoji, count, mine }));
  };

  const getImageUri = (msg: GroupMessage) => {
    if (!msg.imageBase64 || !msg.imageMime) return undefined;
    return msg.imageBase64.startsWith('data:')
      ? msg.imageBase64
      : `data:${msg.imageMime};base64,${msg.imageBase64}`;
  };

  const renderMessage = ({ item, index }: { item: GroupMessage; index: number }) => {
    const isMe = item.senderId === myUserId;
    const showSender = !isMe && (index === 0 || allMessages[index - 1].senderId !== item.senderId);
    const imageUri = getImageUri(item);
    const agg = aggregateReactions(item.reactions ?? []);

    return (
      <View style={[S.msgRow, isMe ? S.msgRowMe : S.msgRowOther]}>
        {!isMe && showSender && (
          <View style={[S.msgAvatar, { backgroundColor: getColor(item.senderId) }]}>
            <Text style={S.msgAvatarText}>
              {item.senderName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
            </Text>
          </View>
        )}
        {!isMe && !showSender && <View style={S.msgAvatarSpacer} />}
        <View style={{ maxWidth: '72%' }}>
          <SwipeableMessage onSwipeRight={() => setReplyingTo(item)}>
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={(e) => { if (item.pending) return; setReactionPickerMsg(item); setReactionPickerPos(e.nativeEvent.pageY); }}
              onPress={() => (item.pending ? handlePendingPress(item) : handleDoubleTap(item))}
              delayLongPress={350}>
              <View style={[S.bubble, isMe ? S.bubbleMe : S.bubbleOther, item.replyToId ? S.bubbleWithQuote : null]}>
                {showSender && !isMe && (
                  <Text style={[S.senderName, { color: getColor(item.senderId) }]}>{item.senderName}</Text>
                )}
                {/* Reply quote */}
                {item.replyToId && (
                  <TouchableOpacity
                    style={[S.replyQuote, { backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : Neutral[100] }]}
                    onPress={() => scrollToMessage(item.replyToId!)} activeOpacity={0.7}>
                    <View style={[S.replyBar, { backgroundColor: isMe ? 'rgba(255,255,255,0.7)' : theme.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[S.replyAuthor, { color: isMe ? 'rgba(255,255,255,0.9)' : theme.primary }]}>
                        {item.replyToSenderName === myName ? 'Vous' : item.replyToSenderName}
                      </Text>
                      <Text style={[S.replyText, { color: isMe ? 'rgba(255,255,255,0.75)' : Neutral[700] }]} numberOfLines={2}>
                        {item.replyToText || '[Photo]'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {/* Photo */}
                {imageUri && (
                  <TouchableOpacity
                    onPress={() => setLightboxUri(imageUri)}
                    onLongPress={(e) => { setReactionPickerMsg(item); setReactionPickerPos(e.nativeEvent.pageY); }}
                    delayLongPress={350}>
                    <Image source={{ uri: imageUri }} style={S.messagePhoto} resizeMode="cover" />
                  </TouchableOpacity>
                )}
                {/* Voice message */}
                {item.attachmentType === 'voice' && (() => {
                  const isPlaying = playingId === item.id;
                  const duration = isPlaying && playbackDur > 0 ? playbackDur : (item.attachmentDurationMs ?? 0);
                  return (
                    <VoiceMessage
                      isMe={isMe}
                      accentColor={theme.primary}
                      isPlaying={isPlaying}
                      paused={playbackPaused}
                      positionMs={playbackPos}
                      durationMs={duration}
                      onToggle={() => handleTogglePlay(item)}
                    />
                  );
                })()}
                {/* File attachment */}
                {item.attachmentType === 'file' && (
                  <FileMessage
                    isMe={isMe}
                    accentColor={theme.primary}
                    name={item.attachmentName}
                    size={item.attachmentSize}
                    onPress={() => handleOpenFile(item)}
                  />
                )}
                {!!item.text && !item.attachmentType && (
                  <>
                    <LinkedText
                      text={item.text}
                      style={[S.bubbleText, isMe ? S.bubbleTextMe : S.bubbleTextOther]}
                      linkColor={isMe ? '#FFF' : '#1a73e8'}
                    />
                    <LinkPreviewCard text={item.text} isMe={isMe} />
                  </>
                )}
                <Text style={[S.bubbleTime, isMe ? S.bubbleTimeMe : S.bubbleTimeOther]}>
                  {item.pending ? '🕓 ' : ''}{formatTime(item.createdAt)}
                </Text>
                {item.pending && (
                  <Text style={S.pendingText}>En attente de connexion — touchez pour réessayer</Text>
                )}
              </View>
            </TouchableOpacity>
          </SwipeableMessage>
          {agg.length > 0 && (
            <View style={[S.reactionsRow, isMe ? S.reactionsRight : S.reactionsLeft]}>
              {agg.map(r => (
                <TouchableOpacity
                  key={r.emoji}
                  style={[S.reactionBadge, r.mine && S.myReactionBadge]}
                  onPress={() => handleReact(item, r.emoji)}>
                  <Text style={S.reactionText}>{REACTION_EMOJI[r.emoji] ?? r.emoji}{r.count > 1 ? ` ${r.count}` : ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={S.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {/* Header — fixed, never moves */}
      <View style={[S.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={S.headerInfo} onPress={() => setShowMembers(true)}>
          <View style={S.groupIconCircle}>
            <MaterialIcons name="group" size={22} color="#FFF" />
          </View>
          <View style={S.headerText}>
            <Text style={S.headerName} numberOfLines={1}>{group?.name}</Text>
            <Text style={S.headerSub} numberOfLines={1}>{group ? GroupChatService.getMembersLabel(group) : ''}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={S.menuBtn} onPress={() => Alert.alert(group?.name ?? '', undefined, [
          { text: 'Renommer', onPress: () => { setRenameValue(group?.name ?? ''); setShowRenameModal(true); } },
          { text: 'Membres', onPress: () => setShowMembers(true) },
          { text: 'Supprimer le groupe', style: 'destructive', onPress: handleDeleteGroup },
          { text: 'Annuler', style: 'cancel' },
        ])}>
          <MaterialIcons name="more-vert" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Content area — keyboard handled by KeyboardAvoidingView */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {!group ? (
          <MessagesLoading variant="chat" label="Chargement de la conversation…" />
        ) : (<>

        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={allMessages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[S.messageList, allMessages.length === 0 && S.emptyList]}
          onScrollToIndexFailed={info =>
            flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true })
          }
          ListEmptyComponent={
            serverLoaded ? (
              <View style={S.emptyContainer}>
                <MaterialIcons name="chat-bubble-outline" size={48} color={Neutral[300]} />
                <Text style={S.emptyText}>Aucun message pour l'instant</Text>
                <Text style={S.emptySub}>Soyez le premier à écrire !</Text>
              </View>
            ) : loadFailed ? (
              <View style={S.emptyContainer}>
                <MaterialIcons name="cloud-off" size={48} color={Neutral[300]} />
                <Text style={S.emptyText}>Messages indisponibles</Text>
                <Text style={S.emptySub}>Vos messages ne sont pas perdus, la connexion a échoué.</Text>
                <TouchableOpacity onPress={loadGroup} style={{ marginTop: 12, padding: 8 }}>
                  <Text style={{ color: theme.primary, fontWeight: '600' }}>Réessayer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <MessagesLoading variant="chat" label="Chargement de la conversation…" />
            )
          }
        />

        {/* Reply preview */}
        {replyingTo && (
          <View style={S.replyPreview}>
            <View style={[S.replyPreviewBar, { backgroundColor: theme.primary }]} />
            <View style={{ flex: 1, paddingHorizontal: 8 }}>
              <Text style={[S.replyPreviewAuthor, { color: theme.primary }]}>
                {replyingTo.senderName === myName ? 'Vous' : replyingTo.senderName}
              </Text>
              <Text style={S.replyPreviewText} numberOfLines={1}>{replyingTo.text || '[Photo]'}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={18} color={Neutral[500]} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        {recording ? (
        <View style={[S.inputBar, { paddingBottom: insets.bottom + 8, alignItems: 'center' }]}>
          <TouchableOpacity onPress={handleCancelRecording} style={S.photoBtn}>
            <MaterialIcons name="delete" size={26} color="#D32F2F" />
          </TouchableOpacity>
          <View style={S.recordingInfo}>
            <View style={S.recordingDot} />
            <Text style={S.recordingTime}>{formatDuration(recordSeconds * 1000)}</Text>
            <Text style={S.recordingHint}>Enregistrement…</Text>
          </View>
          <TouchableOpacity onPress={handleSendRecording} style={S.sendBtn}>
            <MaterialIcons name="send" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
        ) : (
        <View style={[S.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity onPress={() => handlePickPhoto('library')} style={S.photoBtn}>
            <MaterialIcons name="image" size={24} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handlePickPhoto('camera')} style={S.photoBtn}>
            <MaterialIcons name="photo-camera" size={24} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePickFile} style={S.photoBtn}>
            <MaterialIcons name="attach-file" size={24} color={theme.primary} />
          </TouchableOpacity>
          <TextInput
            style={S.input}
            placeholder="Écrire un message..."
            placeholderTextColor={Neutral[400]}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable
          />
          {inputText.trim() ? (
          <TouchableOpacity
            style={S.sendBtn}
            onPress={handleSend}>
            <MaterialIcons name="send" size={22} color="#FFF" />
          </TouchableOpacity>
          ) : (
          <TouchableOpacity style={S.sendBtn} onPress={handleStartRecording}>
            <MaterialIcons name="mic" size={22} color="#FFF" />
          </TouchableOpacity>
          )}
        </View>
        )}
        </>)}
      </KeyboardAvoidingView>

      {/* Members modal */}
      <Modal visible={showMembers} animationType="slide" transparent onRequestClose={() => setShowMembers(false)}>
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Membres ({group?.members?.length ?? 0})</Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}>
                <MaterialIcons name="close" size={22} color={Neutral[500]} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {(group?.members ?? []).map((member, idx) => (
                <View key={member.userId || member.contactId || `mbr-${idx}`} style={S.memberRow}>
                  <View style={[S.memberAvatar, { backgroundColor: getColor(member.userId || member.contactId) }]}>
                    <Text style={S.memberAvatarText}>{getInitials(member)}</Text>
                  </View>
                  <Text style={S.memberName}>{member.firstName} {member.lastName}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rename modal */}
      <Modal visible={showRenameModal} animationType="slide" transparent onRequestClose={() => setShowRenameModal(false)}>
        <RNKeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={S.modalOverlay}
        >
          <View style={[S.modalContent, { paddingHorizontal: 20 }]}>
            <Text style={S.modalTitle}>Renommer le groupe</Text>
            <TextInput
              style={S.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              maxLength={60}
            />
            <View style={S.modalButtons}>
              <TouchableOpacity style={S.cancelBtn} onPress={() => setShowRenameModal(false)}>
                <Text style={S.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.confirmBtn} onPress={handleRename}>
                <Text style={S.confirmBtnText}>Renommer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </RNKeyboardAvoidingView>
      </Modal>

      {/* Lightbox */}
      <Modal visible={lightboxUri !== null} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <View style={S.lightboxOverlay}>
          {lightboxUri && (
            <ZoomableView onSingleTap={() => setLightboxUri(null)}>
              <Image source={{ uri: lightboxUri }} style={S.lightboxImage} resizeMode="contain" />
            </ZoomableView>
          )}
          <TouchableOpacity style={S.lightboxClose} onPress={() => setLightboxUri(null)}>
            <MaterialIcons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Reaction picker */}
      <Modal visible={reactionPickerMsg !== null} transparent animationType="fade" onRequestClose={() => setReactionPickerMsg(null)}>
        <TouchableOpacity style={S.reactionOverlay} activeOpacity={1} onPress={() => setReactionPickerMsg(null)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={[S.reactionPicker, { top: Math.max(60, reactionPickerPos - 70) }]}>
            {REACTIONS.map(r => {
              const mine = reactionPickerMsg?.reactions?.find(x => x.userId === myUserId)?.emoji === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[S.reactionPickerBtn, mine && S.reactionPickerBtnActive]}
                  onPress={() => reactionPickerMsg && handleReact(reactionPickerMsg, r.key)}>
                  <Text style={[S.reactionPickerEmoji, mine && { transform: [{ scale: 1.2 }] }]}>{r.emoji}</Text>
                </TouchableOpacity>
              );
            })}
            {/* Reply shortcut */}
            <TouchableOpacity style={S.reactionPickerBtn} onPress={() => {
              if (reactionPickerMsg) setReplyingTo(reactionPickerMsg);
              setReactionPickerMsg(null);
            }}>
              <MaterialIcons name="reply" size={26} color="#555" />
            </TouchableOpacity>
            {/* Delete (own messages only) */}
            {reactionPickerMsg?.senderId === myUserId && (
              <TouchableOpacity style={S.reactionPickerBtn} onPress={() => {
                const msg = reactionPickerMsg!;
                setReactionPickerMsg(null);
                handleDeleteMessage(msg);
              }}>
                <MaterialIcons name="delete-outline" size={26} color="#e53935" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background || Neutral[50] },
  header: {
    backgroundColor: theme.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  groupIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  headerText: { flex: 1 },
  headerName: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 },
  menuBtn: { padding: 6, marginLeft: 4 },
  messageList: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 12 },
  emptyList: { flex: 1, justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: Neutral[500], fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySub: { color: Neutral[400], fontSize: 13, marginTop: 4 },
  msgRow: { flexDirection: 'row', marginVertical: 3, alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  msgAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 6, marginBottom: 2,
  },
  msgAvatarText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  msgAvatarSpacer: { width: 34 },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3,
  },
  bubbleMe: { backgroundColor: theme.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#FFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: Neutral[200] },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: '#FFF' },
  bubbleTextOther: { color: Neutral[800] },
  bubbleTime: { fontSize: 10, marginTop: 3 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  bubbleTimeOther: { color: Neutral[400], textAlign: 'right' },
  pendingText: { fontSize: 10, fontStyle: 'italic', color: 'rgba(255,255,255,0.85)', textAlign: 'right', marginTop: 2 },
  replyQuote: {
    flexDirection: 'row', borderRadius: 6, marginBottom: 6,
    overflow: 'hidden',
    paddingVertical: 4, paddingRight: 8,
  },
  replyBar: { width: 3, marginRight: 6 },
  replyAuthor: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  replyText: { fontSize: 12, lineHeight: 16 },
  bubbleWithQuote: { minWidth: 180 },
  messagePhoto: { width: 200, height: 150, borderRadius: 8, marginBottom: 4 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2, gap: 4 },
  reactionsRight: { justifyContent: 'flex-end' },
  reactionsLeft: { justifyContent: 'flex-start' },
  reactionBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f0f0f0', borderRadius: 12,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: 'transparent',
  },
  myReactionBadge: { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
  reactionText: { fontSize: 12, color: Neutral[700] },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 8,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: Neutral[200],
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  photoBtn: { padding: 6, marginRight: 2, marginBottom: 2 },
  recordingInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D32F2F', marginRight: 8 },
  recordingTime: { fontSize: 16, fontWeight: '700', color: Neutral[800], marginRight: 10 },
  recordingHint: { fontSize: 13, color: Neutral[500] },
  input: {
    flex: 1,
    backgroundColor: Neutral[100],
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 10, paddingBottom: 10,
    fontSize: 15,
    color: Neutral[800],
    maxHeight: 120,
    marginRight: 8,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: theme.primary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: { backgroundColor: Neutral[300] },
  replyPreview: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: Neutral[200],
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#FFF',
  },
  replyPreviewBar: { width: 3, height: 36, borderRadius: 2 },
  replyPreviewAuthor: { fontSize: 12, fontWeight: '700', marginBottom: 1 },
  replyPreviewText: { fontSize: 12, color: Neutral[600] },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingBottom: 30, maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Neutral[100],
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Neutral[800], marginBottom: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  memberAvatarText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  memberName: { fontSize: 15, color: Neutral[800] },
  renameInput: {
    borderWidth: 1, borderColor: Neutral[300], borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
    color: Neutral[800], marginBottom: 16,
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: Neutral[300], alignItems: 'center',
  },
  cancelBtnText: { color: Neutral[700], fontWeight: '600' },
  confirmBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    backgroundColor: theme.primary, alignItems: 'center',
  },
  confirmBtnText: { color: '#FFF', fontWeight: '600' },
  lightboxOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center', alignItems: 'center',
  },
  lightboxImage: { width: '95%', height: '80%' },
  lightboxClose: {
    position: 'absolute', top: 48, right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8,
  },
  reactionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  reactionPicker: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRadius: 40,
    paddingHorizontal: 10,
    paddingVertical: 10,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    gap: 4,
  },
  reactionPickerBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  reactionPickerBtnActive: { backgroundColor: Neutral[100] },
  reactionPickerEmoji: { fontSize: 26 },
});

export default GroupChatScreen;
