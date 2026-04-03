/**
 * PhoneActivityService — Lecture du journal d'appels (Android uniquement)
 * Retourne la date du dernier appel émis/reçu pour un numéro donné.
 * iOS : ne supporte pas l'accès au journal d'appels → retourne null.
 */
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@last_call_';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Normalise un numéro pour la comparaison (chiffres uniquement, 8 derniers)
const normalizePhone = (phone: string): string =>
  phone.replace(/\D/g, '').slice(-8);

/**
 * Demande la permission READ_CALL_LOG sur Android.
 * Retourne true si accordée.
 */
const requestCallLogPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
      {
        title: 'Accès au journal d\'appels',
        message:
          'GoodFriends utilise votre journal d\'appels pour savoir quand vous avez eu un contact téléphonique avec vos proches.',
        buttonPositive: 'Autoriser',
        buttonNegative: 'Refuser',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
};

/**
 * Retourne la date du dernier appel (entrant ou sortant) pour un numéro donné.
 * - Android : lit le journal d'appels natif via react-native-call-log
 * - iOS / permission refusée : retourne null
 */
export const getLastCallDate = async (phone: string): Promise<Date | null> => {
  if (Platform.OS !== 'android') return null;

  const cacheKey = CACHE_PREFIX + normalizePhone(phone);
  try {
    // Vérifier le cache
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, value } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL_MS) {
        return value ? new Date(value) : null;
      }
    }

    const hasPermission = await requestCallLogPermission();
    if (!hasPermission) return null;

    // Import dynamique — fonctionne uniquement sur Android
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const CallLog = require('react-native-call-log').default ?? require('react-native-call-log');
    const norm = normalizePhone(phone);

    // Récupère les 200 derniers appels
    const logs: Array<{ dateTime: string; phoneNumber: string; type: string }> =
      await CallLog.loadAll(200);

    let lastDate: Date | null = null;
    for (const log of logs) {
      if (normalizePhone(log.phoneNumber) === norm) {
        const d = new Date(parseInt(log.dateTime, 10));
        if (!lastDate || d > lastDate) {
          lastDate = d;
        }
      }
    }

    // Mettre en cache
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ timestamp: Date.now(), value: lastDate?.toISOString() ?? null }),
    );

    return lastDate;
  } catch (err) {
    console.log('[PhoneActivityService] getLastCallDate error:', err);
    return null;
  }
};

/**
 * Invalide le cache d'un numéro (à appeler après un appel sortant depuis l'app).
 */
export const invalidateCallCache = async (phone: string): Promise<void> => {
  const cacheKey = CACHE_PREFIX + normalizePhone(phone);
  await AsyncStorage.removeItem(cacheKey);
};
