import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {Neutral} from '../theme/designSystem';

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

interface VoiceMessageProps {
  isMe: boolean;
  accentColor: string;
  isPlaying: boolean;
  paused: boolean;
  positionMs: number;
  durationMs: number;
  onToggle: () => void;
}

// Message vocal : bouton lecture/pause, barre de progression et durée
export const VoiceMessage: React.FC<VoiceMessageProps> = ({
  isMe, accentColor, isPlaying, paused, positionMs, durationMs, onToggle,
}) => {
  const progress = isPlaying && durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const accent = isMe ? '#FFF' : accentColor;
  return (
    <View style={styles.voiceRow}>
      <TouchableOpacity
        onPress={onToggle}
        style={[styles.voicePlayBtn, {backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : accentColor + '18'}]}>
        <MaterialIcons name={isPlaying && !paused ? 'pause' : 'play-arrow'} size={26} color={accent} />
      </TouchableOpacity>
      <View style={styles.voiceInfo}>
        <View style={[styles.voiceTrack, {backgroundColor: isMe ? 'rgba(255,255,255,0.3)' : Neutral[200]}]}>
          <View style={[styles.voiceProgress, {width: `${progress * 100}%`, backgroundColor: accent}]} />
        </View>
        <Text style={[styles.voiceTime, isMe && {color: 'rgba(255,255,255,0.85)'}]}>
          {isPlaying ? `${formatDuration(positionMs)} / ${formatDuration(durationMs)}` : formatDuration(durationMs)}
        </Text>
      </View>
    </View>
  );
};

interface FileMessageProps {
  isMe: boolean;
  accentColor: string;
  name?: string | null;
  size?: number | null;
  onPress: () => void;
}

// Fichier joint : icône, nom, taille et bouton de téléchargement
export const FileMessage: React.FC<FileMessageProps> = ({isMe, accentColor, name, size, onPress}) => (
  <TouchableOpacity style={styles.fileRow} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.fileIcon, {backgroundColor: isMe ? 'rgba(255,255,255,0.25)' : accentColor + '18'}]}>
      <MaterialIcons name="insert-drive-file" size={24} color={isMe ? '#FFF' : accentColor} />
    </View>
    <View style={styles.fileInfo}>
      <Text style={[styles.fileName, isMe && {color: '#FFF'}]} numberOfLines={2}>{name}</Text>
      {size ? (
        <Text style={[styles.fileSize, isMe && {color: 'rgba(255,255,255,0.8)'}]}>{formatFileSize(size)}</Text>
      ) : null}
    </View>
    <MaterialIcons name="file-download" size={22} color={isMe ? '#FFF' : accentColor} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  voiceRow: {flexDirection: 'row', alignItems: 'center', minWidth: 200, marginBottom: 3},
  voicePlayBtn: {width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center'},
  voiceInfo: {flex: 1, marginLeft: 10, justifyContent: 'center'},
  voiceTrack: {height: 4, borderRadius: 2, overflow: 'hidden'},
  voiceProgress: {height: 4, borderRadius: 2},
  voiceTime: {fontSize: 12, color: Neutral[600], marginTop: 5},
  fileRow: {flexDirection: 'row', alignItems: 'center', minWidth: 210, marginBottom: 3},
  fileIcon: {width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center'},
  fileInfo: {flex: 1, marginHorizontal: 10},
  fileName: {fontSize: 14, fontWeight: '600', color: Neutral[800]},
  fileSize: {fontSize: 12, color: Neutral[600], marginTop: 2},
});
