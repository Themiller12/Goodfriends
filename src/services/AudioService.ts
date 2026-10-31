import { NativeModules, PermissionsAndroid, Platform, DeviceEventEmitter } from 'react-native';

export interface VoiceRecording {
  path: string;
  durationMs: number;
  size: number;
}

export interface PlaybackProgress {
  id: string;
  positionMs: number;
  durationMs: number;
}

interface NativeAudio {
  startRecording(): Promise<void>;
  stopRecording(): Promise<VoiceRecording>;
  cancelRecording(): Promise<void>;
  readBase64(uriOrPath: string, maxBytes: number): Promise<string>;
  deleteFile(path: string): Promise<void>;
  play(id: string, url: string): Promise<number>;
  pause(): void;
  resume(): void;
  stop(): void;
}

const native: NativeAudio | undefined = NativeModules.GoodfriendsAudio;

const EVENTS = {
  progress: 'GoodfriendsAudioProgress',
  end: 'GoodfriendsAudioEnd',
  error: 'GoodfriendsAudioError',
  limit: 'GoodfriendsAudioLimit',
} as const;

function requireNative(): NativeAudio {
  if (!native) {
    throw new Error("Les messages vocaux ne sont pas disponibles sur cet appareil");
  }
  return native;
}

const AudioService = {
  isAvailable: Platform.OS === 'android' && !!native,

  async requestMicrophonePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone',
      message: 'Goodfriends a besoin du microphone pour enregistrer vos messages vocaux.',
      buttonPositive: 'Autoriser',
      buttonNegative: 'Refuser',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  },

  startRecording: () => requireNative().startRecording(),
  stopRecording: () => requireNative().stopRecording(),
  cancelRecording: () => requireNative().cancelRecording(),
  readBase64: (uriOrPath: string, maxBytes: number) => requireNative().readBase64(uriOrPath, maxBytes),
  deleteFile: (path: string) => (native ? native.deleteFile(path) : Promise.resolve()),

  play: (id: string, url: string) => requireNative().play(id, url),
  pause: () => native?.pause(),
  resume: () => native?.resume(),
  stop: () => native?.stop(),

  onProgress: (listener: (p: PlaybackProgress) => void) => DeviceEventEmitter.addListener(EVENTS.progress, listener),
  onEnd: (listener: (p: PlaybackProgress) => void) => DeviceEventEmitter.addListener(EVENTS.end, listener),
  onError: (listener: (p: PlaybackProgress) => void) => DeviceEventEmitter.addListener(EVENTS.error, listener),
  onRecordingLimit: (listener: () => void) => DeviceEventEmitter.addListener(EVENTS.limit, listener),
};

export default AudioService;
