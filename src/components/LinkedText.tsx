import React, {useEffect, useState} from 'react';
import {Image, Linking, StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {getCachedLinkPreview, getLinkPreview, LinkPreviewData} from '../services/LinkPreviewService';
import {firstUrl, splitLinks} from '../utils/links';

const openLink = (url: string) => {
  Linking.openURL(url).catch(() => {});
};

interface LinkedTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  linkColor?: string;
}

// Texte de message dont les liens sont cliquables
export const LinkedText: React.FC<LinkedTextProps> = ({text, style, linkColor = '#1a73e8'}) => (
  <Text style={style}>
    {splitLinks(text).map((part, i) =>
      part.url ? (
        <Text
          key={i}
          style={{color: linkColor, textDecorationLine: 'underline'}}
          onPress={() => openLink(part.url!)}>
          {part.text}
        </Text>
      ) : (
        <Text key={i}>{part.text}</Text>
      ),
    )}
  </Text>
);

interface LinkPreviewCardProps {
  text?: string | null;
  isMe: boolean;
}

// Carte d'aperçu du premier lien du message (rien n'est affiché tant que l'aperçu n'est pas disponible)
export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({text, isMe}) => {
  const {theme} = useTheme();
  const url = firstUrl(text);
  const [preview, setPreview] = useState<LinkPreviewData | null>(url ? getCachedLinkPreview(url) ?? null : null);

  useEffect(() => {
    if (!url) {
      setPreview(null);
      return;
    }
    let active = true;
    getLinkPreview(url).then(data => {
      if (active) setPreview(data);
    });
    return () => {
      active = false;
    };
  }, [url]);

  if (!url || !preview) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => openLink(preview.url || url)}
      style={[styles.card, {backgroundColor: isMe ? 'rgba(255,255,255,0.2)' : '#F4F1E8'}]}>
      {preview.image ? <Image source={{uri: preview.image}} style={styles.image} resizeMode="cover" /> : null}
      <View style={styles.body}>
        <Text style={[styles.site, {color: isMe ? 'rgba(255,255,255,0.8)' : theme.primary}]} numberOfLines={1}>
          {preview.siteName}
        </Text>
        <Text style={[styles.title, {color: isMe ? '#FFF' : '#383830'}]} numberOfLines={2}>
          {preview.title}
        </Text>
        {preview.description ? (
          <Text style={[styles.description, {color: isMe ? 'rgba(255,255,255,0.85)' : '#65655c'}]} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 6,
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 200,
  },
  image: {
    width: '100%',
    height: 120,
    backgroundColor: '#E4E1D6',
  },
  body: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  site: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
  },
});
