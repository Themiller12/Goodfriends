import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';
import ApiClient from './ApiClient';

const KEYS = {
  PUBLIC_KEY: '@e2ee_public_key',
  SECRET_KEY: '@e2ee_secret_key',
  USER_ID: '@e2ee_user_id',
};

type LocalKeyPair = {
  publicKey: string;
  secretKey: string;
};

type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
};

class E2EEService {
  private decodedKeyCache = new Map<string, Uint8Array>();

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
    await AsyncStorage.multiSet([
      [KEYS.PUBLIC_KEY, keyPair.publicKey],
      [KEYS.SECRET_KEY, keyPair.secretKey],
      [KEYS.USER_ID, userId],
    ]);
  }

  private async loadLocalKeyPair(): Promise<LocalKeyPair | null> {
    const values = await AsyncStorage.multiGet([KEYS.PUBLIC_KEY, KEYS.SECRET_KEY, KEYS.USER_ID]);
    const map = new Map(values);

    const publicKey = map.get(KEYS.PUBLIC_KEY) || null;
    const secretKey = map.get(KEYS.SECRET_KEY) || null;
    const keyUserId = map.get(KEYS.USER_ID) || null;
    const currentUserId = await this.getCurrentUserId();

    if (!publicKey || !secretKey || keyUserId !== currentUserId) {
      return null;
    }

    return {publicKey, secretKey};
  }

  async ensureRegisteredKeyPair(): Promise<LocalKeyPair> {
    const currentUserId = await this.getCurrentUserId();
    let keyPair = await this.loadLocalKeyPair();

    if (!keyPair) {
      keyPair = this.generateKeyPair();
      await this.saveLocalKeyPair(currentUserId, keyPair);
    }

    await ApiClient.post('/messages.php?action=e2ee-key', {
      publicKey: keyPair.publicKey,
    });

    return keyPair;
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
    const local = await this.loadLocalKeyPair();
    if (!local) {
      return null;
    }

    const mySecretKey = this.decodeKey(local.secretKey);
    const isSender = args.currentUserId === args.senderId;

    const ciphertext = isSender ? args.senderCiphertext : args.receiverCiphertext;
    const nonce = isSender ? args.senderNonce : args.receiverNonce;
    const ephemeralPublicKey = isSender ? args.senderEphemeralPublicKey : args.receiverEphemeralPublicKey;

    if (!ciphertext || !nonce || !ephemeralPublicKey) {
      return null;
    }

    try {
      const opened = nacl.box.open(
        naclUtil.decodeBase64(ciphertext),
        naclUtil.decodeBase64(nonce),
        naclUtil.decodeBase64(ephemeralPublicKey),
        mySecretKey,
      );

      if (!opened) {
        return null;
      }

      return naclUtil.encodeUTF8(opened);
    } catch {
      return null;
    }
  }
}

export default new E2EEService();
