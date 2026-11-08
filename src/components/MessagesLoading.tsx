import React, {useEffect, useRef} from 'react';
import {Animated, Easing, StyleSheet, Text, View, ViewStyle, StyleProp} from 'react-native';
import {useTheme} from '../context/ThemeContext';

interface MessagesLoadingProps {
  // chat : bulles de messages ; list : lignes de conversations
  variant: 'chat' | 'list';
  label?: string;
  style?: StyleProp<ViewStyle>;
}

const CHAT_ROWS = [
  {mine: false, width: '58%'},
  {mine: true, width: '44%'},
  {mine: false, width: '68%'},
  {mine: true, width: '52%'},
  {mine: false, width: '36%'},
] as const;

const LIST_ROWS = [0, 1, 2, 3, 4, 5];

// Trois points qui rebondissent, comme l'indicateur "en train d'écrire"
const TypingDots: React.FC<{color: string}> = ({color}) => {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, {toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true}),
          Animated.timing(dot, {toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true}),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [dots]);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              opacity: dot.interpolate({inputRange: [0, 1], outputRange: [0.35, 1]}),
              transform: [{translateY: dot.interpolate({inputRange: [0, 1], outputRange: [0, -7]})}],
            },
          ]}
        />
      ))}
    </View>
  );
};

// Écran d'attente stylisé : squelettes pulsants + indicateur de saisie.
// À n'utiliser que tant que le serveur n'a pas répondu (jamais pour "aucun message").
const MessagesLoading: React.FC<MessagesLoadingProps> = ({variant, label, style}) => {
  const {theme} = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const skeletonOpacity = pulse.interpolate({inputRange: [0, 1], outputRange: [0.45, 1]});
  const text = label ?? (variant === 'chat' ? 'Chargement de vos messages…' : 'Chargement de vos conversations…');

  return (
    <View
      style={[styles.container, style]}
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel={text}>
      <Animated.View style={[styles.skeletons, {opacity: skeletonOpacity}]}>
        {variant === 'chat'
          ? CHAT_ROWS.map((row, i) => (
              <View key={i} style={[styles.chatRow, row.mine ? styles.rowMine : styles.rowOther]}>
                <View
                  style={[
                    styles.bubble,
                    {width: row.width},
                    row.mine
                      ? {backgroundColor: theme.primary, opacity: 0.25, borderBottomRightRadius: 4}
                      : {backgroundColor: '#E4E1D6', borderBottomLeftRadius: 4},
                  ]}
                />
              </View>
            ))
          : LIST_ROWS.map(i => (
              <View key={i} style={styles.listRow}>
                <View style={styles.avatar} />
                <View style={styles.listLines}>
                  <View style={[styles.line, {width: `${52 + ((i * 13) % 30)}%`}]} />
                  <View style={[styles.line, styles.lineShort, {width: `${30 + ((i * 17) % 35)}%`}]} />
                </View>
              </View>
            ))}
      </Animated.View>

      <View style={[styles.footer, variant === 'list' && styles.footerAboveNav]}>
        <View style={[styles.typingBubble, {borderColor: theme.primary}]}>
          <TypingDots color={theme.primary} />
        </View>
        <Text style={styles.label}>{text}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    justifyContent: 'space-between',
  },
  skeletons: {
    gap: 14,
  },
  chatRow: {
    flexDirection: 'row',
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    height: 44,
    borderRadius: 18,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E4E1D6',
  },
  listLines: {
    flex: 1,
    gap: 8,
  },
  line: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E4E1D6',
  },
  lineShort: {
    height: 10,
    opacity: 0.7,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  // Laisse de la place au menu du bas, qui masquerait sinon l'animation
  footerAboveNav: {
    paddingBottom: 110,
  },
  typingBubble: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 14,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 14,
    color: '#65655c',
    textAlign: 'center',
  },
});

export default MessagesLoading;
