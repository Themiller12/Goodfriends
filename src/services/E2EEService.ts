import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import ApiClient from './ApiClient';
import SecureStorage from './SecureStorage';

const KEYS = {
  PUBLIC_KEY: '@e2ee_public_key',
  USER_ID: '@e2ee_user_id',
};

// La clé privée est dans le Keystore ; l'ancienne clé AsyncStorage est migrée au premier accès.
const SECRET_KEY_NAME = 'e2ee_secret_key';
const LEGACY_SECRET_KEY = '@e2ee_secret_key';

type LocalKeyPair = {
  publicKey: string;
  secretKey: string;
};

type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
};

// Anciennes clés privées de ce compte (remplacées par la clé sauvegardée côté serveur) : gardées pour relire l'historique.
const PREVIOUS_KEYS_NAME = 'e2ee_previous_secret_keys';
const SYNC_RETRY_DELAY_MS = 15000;

export type GroupPayload = EncryptedPayload & {userId: string};

class E2EEService {
  private decodedKeyCache = new Map<string, Uint8Array>();
  private session: {userId: string; keyPair: LocalKeyPair} | null = null;
  private pending: {userId: string; promise: Promise<LocalKeyPair>} | null = null;
  private lastFailure: {userId: string; at: number; error: unknown} | null = null;
  private fallback: {userId: string; at: number; keyPair: LocalKeyPair} | null = null;

  private decodeKey(base64: string): Uint8Array {
    const cached = this.decodedKeyCache.get(base64);
    if (cached) return cached;
    const decoded = naclUtil.decodeBase64(base64);
    this.decodedKeyCache.set(base64, decoded);
    return decoded;
  }

  private async getCurrentUserId(): Promise<string> {
    const userStr = await AsyncStorage.getItem('@current_user');
    if (!userStr) {
      throw new Error('Utilisateur non connecté');
    }
    const user = JSON.parse(userStr);
    if (!user?.id) {
      throw new Error('Session utilisateur invalide');
    }
    return user.id;
  }

  private generateKeyPair(): LocalKeyPair {
    const pair = nacl.box.keyPair();
    return {
      publicKey: naclUtil.encodeBase64(pair.publicKey),
      secretKey: naclUtil.encodeBase64(pair.secretKey),
    };
  }

  private async saveLocalKeyPair(userId: string, keyPair: LocalKeyPair): Promise<void> {
    try {
      await SecureStorage.setItem(SECRET_KEY_NAME, keyPair.secretKey);
    } catch {
      // Keystore inutilisable sur certains appareils : la clé reste récupérable depuis le compte
      await AsyncStorage.setItem(LEGACY_SECRET_KEY, keyPair.secretKey);
    }
    await AsyncStorage.multiSet([
      [KEYS.PUBLIC_KEY, keyPair.publicKey],
      [KEYS.USER_ID, userId],
    ]);
  }

  private async readSecretKey(): Promise<string | null> {
    try {
      return await SecureStorage.getItem(SECRET_KEY_NAME, LEGACY_SECRET_KEY);
    } catch {
      return AsyncStorage.getItem(LEGACY_SECRET_KEY);
    }
  }

  private async loadLocalKeyPair(userId: string): Promise<LocalKeyPair | null> {
    try {
      const values = await AsyncStorage.multiGet([KEYS.PUBLIC_KEY, KEYS.USER_ID]);
      const map = new Map(values);

      const publicKey = map.get(KEYS.PUBLIC_KEY) || null;
      const secretKey = await this.readSecretKey();
      const keyUserId = map.get(KEYS.USER_ID) || null;

      if (!publicKey || !secretKey || keyUserId !== userId) {
        return null;
      }
      return {publicKey, secretKey};
    } catch {
      return null;
    }
  }

  private async loadPreviousSecretKeys(): Promise<string[]> {
    try {
      const raw = await SecureStorage.getItem(PREVIOUS_KEYS_NAME);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(k => typeof k === 'string') : [];
    } catch {
      return [];
    }
  }

  private async rememberPreviousSecretKey(secretKey: string): Promise<void> {
    try {
      const previous = await this.loadPreviousSecretKeys();
      if (!previous.includes(secretKey)) {
        await SecureStorage.setItem(PREVIOUS_KEYS_NAME, JSON.stringify([...previous, secretKey].slice(-5)));
      }
    } catch {}
  }

  // Envoie la paire locale (ou une nouvelle) au serveur : la première clé enregistrée pour le compte fait foi
  // et est renvoyée à tous les appareils suivants (réinstallation, nouveau téléphone).
  private async syncKeyPair(userId: string): Promise<LocalKeyPair> {
    const local = await this.loadLocalKeyPair(userId);
    const candidate = local ?? this.generateKeyPair();

    let remote: LocalKeyPair;
    try {
      const response = await ApiClient.post('/messages.php?action=e2ee-backup', {
        publicKey: candidate.publicKey,
        secretKey: candidate.secretKey,
      }) as any;
      remote = {publicKey: response?.data?.publicKey, secretKey: response?.data?.secretKey};
      const derived = nacl.box.keyPair.fromSecretKey(naclUtil.decodeBase64(remote.secretKey));
      if (naclUtil.encodeBase64(derived.publicKey) !== remote.publicKey) {
        throw new Error('Clé E2EE du compte invalide');
      }
    } catch (error) {
      // Hors ligne : on garde la clé locale mais on ne fabrique jamais une nouvelle clé qui écraserait celle du compte
      if (local) {
        this.fallback = {userId, at: Date.now(), keyPair: local};
        return local;
      }
      throw error;
    }

    if (!local || local.publicKey !== remote.publicKey) {
      if (local) {
        await this.rememberPreviousSecretKey(local.secretKey);
      }
      await this.saveLocalKeyPair(userId, remote);
    }
    this.session = {userId, keyPair: remote};
    return remote;
  }

  async ensureRegisteredKeyPair(): Promise<LocalKeyPair> {
    const userId = await this.getCurrentUserId();
    if (this.session?.userId === userId) {
      return this.session.keyPair;
    }
    if (this.fallback?.userId === userId && Date.now() - this.fallback.at < SYNC_RETRY_DELAY_MS) {
      return this.fallback.keyPair;
    }
    if (this.lastFailure?.userId === userId && Date.now() - this.lastFailure.at < SYNC_RETRY_DELAY_MS) {
      throw this.lastFailure.error;
    }
    if (this.pending?.userId !== userId) {
      const promise = this.syncKeyPair(userId).then(
        keyPair => {
          this.lastFailure = null;
          return keyPair;
        },
        error => {
          this.lastFailure = {userId, at: Date.now(), error};
          throw error;
        },
      ).finally(() => {
        if (this.pending?.promise === promise) {
          this.pending = null;
        }
      });
      this.pending = {userId, promise};
    }
    return this.pending!.promise;
  }

  private async getSecretKeyCandidates(): Promise<Uint8Array[]> {
    const current = await this.ensureRegisteredKeyPair();
    const previous = await this.loadPreviousSecretKeys();
    return [current.secretKey, ...previous].map(key => this.decodeKey(key));
  }

  async getPublicKey(userId: string): Promise<string | null> {
    const response = await ApiClient.get(`/messages.php?action=e2ee-key&userId=${encodeURIComponent(userId)}`) as any;
    return response?.data?.publicKey || null;
  }

  private encryptFor(publicKeyBase64: string, plaintext: string): EncryptedPayload {
    const recipientPublicKey = this.decodeKey(publicKeyBase64);
    const ephemeral = nacl.box.keyPair();
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const bytes = naclUtil.decodeUTF8(plaintext);
    const cipher = nacl.box(bytes, nonce, recipientPublicKey, ephemeral.secretKey);

    return {
      ciphertext: naclUtil.encodeBase64(cipher),
      nonce: naclUtil.encodeBase64(nonce),
      ephemeralPublicKey: naclUtil.encodeBase64(ephemeral.publicKey),
    };
  }

  async buildEncryptedPayloadForUsers(plaintext: string, receiverUserId: string): Promise<{
    receiverCiphertext: string;
    receiverNonce: string;
    receiverEphemeralPublicKey: string;
    senderCiphertext: string;
    senderNonce: string;
    senderEphemeralPublicKey: string;
    encryptionVersion: string;
  }> {
    const local = await this.ensureRegisteredKeyPair();
    const receiverPublicKey = await this.getPublicKey(receiverUserId);

    if (!receiverPublicKey) {
      throw new Error('Le destinataire n\'a pas encore activé le chiffrement de bout en bout.');
    }

    const forReceiver = this.encryptFor(receiverPublicKey, plaintext);
    const forSender = this.encryptFor(local.publicKey, plaintext);

    return {
      receiverCiphertext: forReceiver.ciphertext,
      receiverNonce: forReceiver.nonce,
      receiverEphemeralPublicKey: forReceiver.ephemeralPublicKey,
      senderCiphertext: forSender.ciphertext,
      senderNonce: forSender.nonce,
      senderEphemeralPublicKey: forSender.ephemeralPublicKey,
      encryptionVersion: 'e2ee-v1',
    };
  }

  private async openWithKeys(ciphertext: string, nonce: string, ephemeralPublicKey: string): Promise<string | null> {
    try {
      const secretKeys = await this.getSecretKeyCandidates();
      const cipherBytes = naclUtil.decodeBase64(ciphertext);
      const nonceBytes = naclUtil.decodeBase64(nonce);
      const senderKey = naclUtil.decodeBase64(ephemeralPublicKey);

      for (const secretKey of secretKeys) {
        const opened = nacl.box.open(cipherBytes, nonceBytes, senderKey, secretKey);
        if (opened) {
          return naclUtil.encodeUTF8(opened);
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async decryptMessage(args: {
    currentUserId: string;
    senderId: string;
    receiverId: string;
    senderCiphertext?: string | null;
    senderNonce?: string | null;
    senderEphemeralPublicKey?: string | null;
    receiverCiphertext?: string | null;
    receiverNonce?: string | null;
    receiverEphemeralPublicKey?: string | null;
  }): Promise<string | null> {
    const isSender = args.currentUserId === args.senderId;

    const ciphertext = isSender ? args.senderCiphertext : args.receiverCiphertext;
    const nonce = isSender ? args.senderNonce : args.receiverNonce;
    const ephemeralPublicKey = isSender ? args.senderEphemeralPublicKey : args.receiverEphemeralPublicKey;

    if (!ciphertext || !nonce || !ephemeralPublicKey) {
      return null;
    }

    return this.openWithKeys(ciphertext, nonce, ephemeralPublicKey);
  }

  // ── Groupes : une charge utile chiffrée par membre (même mécanique que les messages privés) ──

  private async getGroupMemberKeys(groupId: string): Promise<{userId: string; publicKey: string}[]> {
    const response = await ApiClient.get(`/group_chats.php?action=member-keys&id=${encodeURIComponent(groupId)}`) as any;
    return Array.isArray(response?.data) ? response.data : [];
  }

  async buildGroupPayloads(groupId: string, plaintext: string): Promise<{
    encryptionVersion: string;
    payloads: GroupPayload[];
  }> {
    const [local, currentUserId, memberKeys] = await Promise.all([
      this.ensureRegisteredKeyPair(),
      this.getCurrentUserId(),
      this.getGroupMemberKeys(groupId),
    ]);

    const keys = new Map<string, string>();
    memberKeys.forEach(member => member.publicKey && keys.set(member.userId, member.publicKey));
    keys.set(currentUserId, local.publicKey);

    const payloads: GroupPayload[] = [];
    keys.forEach((publicKey, userId) => {
      payloads.push({userId, ...this.encryptFor(publicKey, plaintext)});
    });

    return {encryptionVersion: 'e2ee-v1', payloads};
  }

  async decryptPayload(payload: {
    ciphertext?: string | null;
    nonce?: string | null;
    ephemeralPublicKey?: string | null;
  }): Promise<string | null> {
    if (!payload.ciphertext || !payload.nonce || !payload.ephemeralPublicKey) {
      return null;
    }
    return this.openWithKeys(payload.ciphertext, payload.nonce, payload.ephemeralPublicKey);
  }
}

export default new E2EEService();
