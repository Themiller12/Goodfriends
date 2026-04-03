import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Platform,
  Alert,
  Modal,
  ScrollView,
  Image,
  Animated,
  PanResponder,
  Vibration,
  BackHandler,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary } from 'react-native-image-picker';
import { useTheme } from '../context/ThemeContext';
import { Neutral, Spacing, Radius } from '../theme/designSystem';
import { GroupChat, GroupMessage, GroupMember, GroupMessageReaction } from '../types';
import GroupChatService from '../services/GroupChatService';
import AuthService from '../services/AuthService';

const REACTIONS = [
  { key: 'love',    icon: 'favorite',                    color: '#e53935' },
  { key: 'like',    icon: 'thumb-up',                    color: '#1976D2' },
  { key: 'dislike', icon: 'thumb-down',                  color: '#9E9E9E' },
  { key: 'wow',     icon: 'sentiment-very-satisfied',    color: '#FB8C00' },
  { key: 'angry',   icon: 'sentiment-very-dissatisfied', color: '#e53935' },
];

const SwipeableMessage: React.FC<{ onSwipeRight: () => void; children: React.ReactNode }> = ({ onSwipeRight, children }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const hasTriggered = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, gs) => gs.dx > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => { hasTriggered.current = false; },
      onPanResponderMove: (_e, gs) => {
        if (gs.dx > 0) {
          translateX.setValue(Math.min(gs.dx, 80));
          if (!hasTriggered.current && gs.dx > 60) {
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
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [myUserId, setMyUserId] = useState<string>('me');
  const [myName, setMyName] = useState<string>('Moi');
  const [showMembers, setShowMembers] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputBarHeight, setInputBarHeight] = useState(60);
  const [replyingTo, setReplyingTo] = useState<GroupMessage | null>(null);
  const [reactionPickerMsg, setReactionPickerMsg] = useState<GroupMessage | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const initialScrolled = useRef(false);

  useFocusEffect(useCallback(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { navigation.goBack(); return true; });
    return () => handler.remove();
  }, [navigation]));

  useFocusEffect(useCallback(() => { initialScrolled.current = false; loadGroup(); }, [groupId]));

  useEffect(() => { loadCurrentUser(); }, []);

  useEffect(() => {
    if (messages.length > 0 && !initialScrolled.current) {
      const t = setTimeout(() => { flatListRef.current?.scrollToEnd({ animated: false }); initialScrolled.current = true; }, 150);
      return () => clearTimeout(t);
    }
  }, [messages.length]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height + insets.bottom));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (keyboardHeight > 0) flatListRef.current?.scrollToEnd({ animated: true });
  }, [keyboardHeight]);

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
    const g = await GroupChatService.getById(groupId);
    if (g) { setGroup(g); setMessages([...g.messages]); }
  };

  const handleSend = async () => {
    if ((!inputText.trim() && !replyingTo) || sending) return;
    const text = inputText.trim();
    const reply = replyingTo;
    setInputText(''); setReplyingTo(null); setSending(true);
    try {
      const msg = await GroupChatService.sendMessage(groupId, text, myUserId, myName, undefined, undefined, reply?.id, reply?.text, reply?.senderName);
      setMessages(prev => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      Alert.alert('Erreur', "Impossible d'envoyer le message");
      setInputText(text); setReplyingTo(reply);
    } finally { setSending(false); }
  };

  const handlePickPhoto = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.5, maxWidth: 1280, maxHeight: 1280, includeBase64: true });
      if (result.didCancel || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64 || !asset.type) { Alert.alert('Erreur', "Impossible de lire l'image"); return; }
      setSending(true);
      const reply = replyingTo; setReplyingTo(null);
      const msg = await GroupChatService.sendMessage(groupId, inputText.trim(), myUserId, myName, asset.base64, asset.type, reply?.id, reply?.text, reply?.senderName);
      setInputText('');
      setMessages(prev => [...prev, { ...msg, imageBase64: asset.base64, imageMime: asset.type }]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch { Alert.alert('Erreur', "Impossible d'envoyer la photo"); }
    finally { setSending(false); }
  };

  const handleDeleteMessage = (msg: GroupMessage) => {
    if (msg.senderId !== myUserId) return;
    Alert.alert('Supprimer', 'Supprimer ce message ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await GroupChatService.deleteMessage(groupId, msg.id);
        setMessages(prev => prev.filter(m => m.id !== msg.id));
      }},
    ]);
  };

  const handleReact = async (msg: GroupMessage, emoji: string) => {
    setReactionPickerMsg(null);
    setMessages(prev => prev.map(m => {
      if (m.id !== msg.id) return m;
      const reactions = [...(m.reactions ?? [])];
      const idx = reactions.findIndex(r => r.userId === myUserId && r.emoji === emoji);
      if (idx !== -1) { reactions.splice(idx, 1); return { ...m, reactions }; }
      const filtered = reactions.filter(r => r.userId !== myUserId);
      filtered.push({ userId: myUserId, emoji });
      return { ...m, reactions: filtered };
    }));
    await GroupChatService.reactToMessage(groupId, msg.id, myUserId, emoji);
  };

  const handleRename = async () => {
    if (!renameValue.trim()) return;
    await GroupChatService.update(groupId, { name: renameValue.trim() });
    setGroup(prev => prev ? { ...prev, name: renameValue.trim() } : prev);
    setShowRenameModal(false);
  };

  const handleDeleteGroup = () => {
    Alert.alert('Supprimer le groupe', `Supprimer "${group?.name}" et tous ses messages ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { await GroupChatService.delete(groupId); navigation.goBack(); } },
    ]);
  };

  const scrollToMessage = (messageId: string) => {
    const index = messages.findIndex(m => m.id === messageId);
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

  const getInitials = (m: GroupMember) => `${m.firstName[0] ?? ''}${m.lastName[0] ?? ''}`.toUpperCase();

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
    return msg.imageBase64.startsWith('data:') ? msg.imageBase64 : `data:${msg.imageMime};base64,${msg.imageBase64}`;
  };

  const renderMessage = ({ item, index }: { item: GroupMessage; index: number }) => {
    const isMe = item.senderId === myUserId;
    const showSender = !isMe && (index === 0 || messages[index - 1].senderId !== item.senderId);
    const imageUri = getImageUri(item);
    const agg = aggregateReactions(item.reactions ?? []);
    return (
      <View style={[S.msgRow, isMe ? S.msgRowMe : S.msgRowOther]}>
        {!isMe && showSender && (
          <View style={[S.msgAvatar, { backgroundColor: getColor(item.senderId) }]}>
            <Text style={S.msgAvatarText}>{item.senderName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}</Text>
          </View>
        )}
        {!isMe && !showSender && <View style={S.msgAvatarSpacer} />}
        <View style={{ maxWidth: '72%' }}>
          <SwipeableMessage onSwipeRight={() => setReplyingTo(item)}>
            <TouchableOpacity activeOpacity={0.85} onLongPress={() => setReactionPickerMsg(item)} delayLongPress={350}>
              <View style={[S.bubble, isMe ? S.bubbleMe : S.bubbleOther]}>
                {showSender && !isMe && <Text style={[S.senderName, { color: getColor(item.senderId) }]}>{item.senderName}</Text>}
                {item.replyToId && (
                  <TouchableOpacity style={S.replyQuote} onPress={() => scrollToMessage(item.replyToId!)} activeOpacity={0.7}>
                    <View style={[S.replyBar, { backgroundColor: isMe ? 'rgba(255,255,255,0.5)' : theme.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[S.replyAuthor, { color: isMe ? 'rgba(255,255,255,0.9)' : theme.primary }]}>
                        {item.replyToSenderName === myName ? 'Vous' : item.replyToSenderName}
                      </Text>
                      <Text style={[S.replyText, { color: isMe ? 'rgba(255,255,255,0.8)' : '#666' }]} numberOfLines={2}>
                        {item.replyToText || '[Photo]'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {imageUri && (
                  <TouchableOpacity onPress={() => setLightboxUri(imageUri)}>
                    <Image source={{ uri: imageUri }} style={S.messagePhoto} resizeMode="cover" />
                  </TouchableOpacity>
                )}
                {!!item.text && <Text style={[S.bubbleText, isMe ? S.bubbleTextMe : S.bubbleTextOther]}>{item.text}</Text>}
                <Text style={[S.bubbleTime, isMe ? S.bubbleTimeMe : S.bubbleTimeOther]}>{formatTime(item.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          </SwipeableMessage>
          {agg.length > 0 && (
            <View style={[S.reactionsRow, isMe ? S.reactionsRight : S.reactionsLeft]}>
              {agg.map(r => {
                const def = REACTIONS.find(rx => rx.key === r.emoji);
                return (
                  <TouchableOpacity key={r.emoji} style={[S.reactionBadge, r.mine && S.myReactionBadge]} onPress={() => handleReact(item, r.emoji)}>
                    {def ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name={def.icon as any} size={13} color={r.mine ? def.color : '#555'} />
                        {r.count > 1 && <Text style={[S.reactionText, { marginLeft: 2 }]}>{r.count}</Text>}
                      </View>
                    ) : <Text style={S.reactionText}>{r.emoji}{r.count > 1 ? ` ${r.count}` : ''}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>
    );
  };

  if (!group) {
    return (
      <View style={[S.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <Text style={{ color: Neutral[600] }}>Chargement...</Text>
      </View>
    );
  }

  return (
    <View style={S.container}>
      <View style={[S.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={S.headerInfo} onPress={() => setShowMembers(true)}>
          <View style={S.groupIconCircle}>
            <MaterialIcons name="group" size={22} color="#FFF" />
          </View>
          <View style={S.headerText}>
            <Text style={S.headerName} numberOfLines={1}>{group.name}</Text>
            <Text style={S.headerSub} numberOfLines={1}>{GroupChatService.getMembersLabel(group)}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={S.headerMenuBtn} onPress={() => Alert.alert(group.name, undefined, [
          { text: 'Renommer', onPress: () => { setRenameValue(group.name); setShowRenameModal(true); } },
          { text: 'Membres', onPress: () => setShowMembers(true) },
          { text: 'Supprimer le groupe', style: 'destructive', onPress: handleDeleteGroup },
          { text: 'Annuler', style: 'cancel' },
        ])}>
          <MaterialIcons name="more-vert" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={[S.messageList, { paddingBottom: inputBarHeight + keyboardHeight }, messages.length === 0 && S.emptyList]}
          onLayout={() => { if (initialScrolled.current) return; flatListRef.current?.scrollToEnd({ animated: false }); }}
          onScrollToIndexFailed={info => flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true })}
          ListEmptyComponent={
            <View style={S.emptyContainer}>
              <MaterialIcons name="chat-bubble-outline" size={48} color={Neutral[300]} />
              <Text style={S.emptyText}>Aucun message pour l'instant</Text>
              <Text style={S.emptySub}>Soyez le premier a ecrire !</Text>
            </View>
          }
        />

        <View style={[S.inputBar, { position: 'absolute', left: 0, right: 0, bottom: keyboardHeight > 0 ? keyboardHeight : 0, paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom }]}
          onLayout={(e) => setInputBarHeight(e.nativeEvent.layout.height)}>
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
          <View style={S.inputRow}>
            <TouchableOpacity onPress={handlePickPhoto} disabled={sending} style={S.photoBtn}>
              <MaterialIcons name="image" size={24} color={sending ? Neutral[300] : theme.primary} />
            </TouchableOpacity>
            <TextInput
              style={S.input}
              placeholder="Ecrire un message..."
              placeholderTextColor={Neutral[400]}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
              returnKeyType="default"
              editable={!sending}
            />
            <TouchableOpacity
              style={[S.sendBtn, ((!inputText.trim() && !replyingTo) || sending) && S.sendBtnDisabled]}
              onPress={handleSend}
              disabled={(!inputText.trim() && !replyingTo) || sending}>
              <MaterialIcons name="send" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal visible={showMembers} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowMembers(false)}>
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <View style={S.modalHeader}>
              <Text style={S.modalTitle}>Membres ({group.members.length})</Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}>
                <MaterialIcons name="close" size={22} color={Neutral[500]} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {group.members.map((member, idx) => (
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

      <Modal visible={showRenameModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowRenameModal(false)}>
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <Text style={S.modalTitle}>Renommer le groupe</Text>
            <TextInput style={S.renameInput} value={renameValue} onChangeText={setRenameValue} autoFocus maxLength={60} />
            <View style={S.modalButtons}>
              <TouchableOpacity style={S.cancelBtn} onPress={() => setShowRenameModal(false)}>
                <Text style={S.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.confirmBtn} onPress={handleRename}>
                <Text style={S.confirmBtnText}>Renommer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={lightboxUri !== null} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <View style={S.lightboxOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setLightboxUri(null)} />
          {lightboxUri && <Image source={{ uri: lightboxUri }} style={S.lightboxImage} resizeMode="contain" />}
          <TouchableOpacity style={S.lightboxClose} onPress={() => setLightboxUri(null)}>
            <MaterialIcons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={reactionPickerMsg !== null} transparent animationType="fade" onRequestClose={() => setReactionPickerMsg(null)}>
        <TouchableOpacity style={S.reactionOverlay} activeOpacity={1} onPress={() => setReactionPickerMsg(null)}>
          <View style={S.reactionPicker}>
            {REACTIONS.map(r => {
              const mine = reactionPickerMsg?.reactions?.find(x => x.userId === myUserId)?.emoji === r.key;
              return (
                <TouchableOpacity key={r.key} style={[S.reactionPickerBtn, mine && S.reactionPickerBtnActive]}
                  onPress={() => reactionPickerMsg && handleReact(reactionPickerMsg, r.key)}>
                  <MaterialIcons name={r.icon as any} size={26} color={mine ? r.color : '#555'} />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={S.reactionPickerBtn} onPress={() => {
              if (reactionPickerMsg) setReplyingTo(reactionPickerMsg);
              setReactionPickerMsg(null);
            }}>
              <MaterialIcons name="reply" size={26} color="#555" />
            </TouchableOpacity>
            {reactionPickerMsg?.senderId === myUserId && (
              <TouchableOpacity style={S.reactionPickerBtn} onPress={() => {
                const msg = reactionPickerMsg!; setReactionPickerMsg(null); handleDeleteMessage(msg);
              }}>
                <MaterialIcons name="delete-outline" size={26} color="#e53935" />
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background || Neutral[50] },
  header: { backgroundColor: theme.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: 14, elevation: 4 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.sm },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  groupIconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  headerText: { flex: 1 },
  headerName: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 1 },
  headerMenuBtn: { padding: 4, marginLeft: 4 },
  messageList: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  emptyList: { flex: 1, justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: Neutral[500], fontSize: 16, fontWeight: '600', marginTop: 12 },
  emptySub: { color: Neutral[400], fontSize: 13, marginTop: 4 },
  msgRow: { flexDirection: 'row', marginVertical: 2, alignItems: 'flex-end' },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 6, marginBottom: 2 },
  msgAvatarText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  msgAvatarSpacer: { width: 34 },
  bubble: { borderRadius: Radius.lg, paddingHorizontal: 12, paddingVertical: 8, elevation: 1 },
  bubbleMe: { backgroundColor: theme.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#FFF', borderBottomLeftRadius: 4 },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: '#FFF' },
  bubbleTextOther: { color: Neutral[800] },
  bubbleTime: { fontSize: 10, marginTop: 3 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  bubbleTimeOther: { color: Neutral[400], textAlign: 'right' },
  replyQuote: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 6, marginBottom: 6, overflow: 'hidden', paddingVertical: 4, paddingRight: 8 },
  replyBar: { width: 3, marginRight: 6 },
  replyAuthor: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  replyText: { fontSize: 12, lineHeight: 16 },
  messagePhoto: { width: 200, height: 150, borderRadius: 8, marginBottom: 4 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2, gap: 4 },
  reactionsRight: { justifyContent: 'flex-end' },
  reactionsLeft: { justifyContent: 'flex-start' },
  reactionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: 'transparent' },
  myReactionBadge: { borderColor: theme.primary, backgroundColor: theme.primary + '15' },
  reactionText: { fontSize: 12, color: Neutral[700] },
  inputBar: { backgroundColor: theme.cardBackground || '#fff', elevation: 8, borderTopWidth: 1, borderTopColor: Neutral[200] },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: Spacing.sm, paddingVertical: 8 },
  photoBtn: { padding: 6, marginRight: 4, marginBottom: 2 },
  input: { flex: 1, backgroundColor: Neutral[100], borderRadius: 22, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 6, fontSize: 15, color: Neutral[800], maxHeight: 120, minHeight: 40, marginRight: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 2 },
  sendBtnDisabled: { backgroundColor: Neutral[300] },
  replyPreview: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Neutral[200], paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  replyPreviewBar: { width: 3, height: 36, borderRadius: 2 },
  replyPreviewAuthor: { fontSize: 12, fontWeight: '700', marginBottom: 1 },
  replyPreviewText: { fontSize: 12, color: Neutral[600] },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: Spacing.base, paddingBottom: Spacing.xl, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.base },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Neutral[800], paddingVertical: Spacing.base },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  memberAvatarText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  memberName: { fontSize: 15, color: Neutral[800] },
  renameInput: { borderWidth: 1, borderColor: Neutral[300], borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: Spacing.base },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: Neutral[300], alignItems: 'center' },
  cancelBtnText: { color: Neutral[700], fontWeight: '600' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.primary, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '600' },
  lightboxOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  lightboxImage: { width: '95%', height: '80%' },
  lightboxClose: { position: 'absolute', top: 48, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  reactionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  reactionPicker: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 32, paddingHorizontal: 8, paddingVertical: 10, elevation: 8, gap: 4 },
  reactionPickerBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  reactionPickerBtnActive: { backgroundColor: Neutral[100] },
});

export default GroupChatScreen;