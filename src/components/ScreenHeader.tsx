import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, StatusBar} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Typography} from '../theme/designSystem';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actionIcon?: string;
  onAction?: () => void;
  right?: React.ReactNode;
}

// En-tête commun des écrans secondaires : fond du thème, bouton retour rond, titre + sous-titre.
const ScreenHeader: React.FC<ScreenHeaderProps> = ({title, subtitle, onBack, actionIcon, onAction, right}) => {
  const {theme} = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, {backgroundColor: theme.background, paddingTop: insets.top + Spacing.md}]}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      {onBack && (
        <TouchableOpacity onPress={onBack} style={s.backBtn} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={22} color={Neutral[800]} />
        </TouchableOpacity>
      )}
      <View style={s.titleBlock}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
      {actionIcon && onAction && (
        <TouchableOpacity onPress={onAction} style={[s.actionBtn, {backgroundColor: theme.primary}]} activeOpacity={0.8}>
          <MaterialIcons name={actionIcon as any} size={22} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  titleBlock: {
    flex: 1,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.md,
  },
  title: {
    ...Typography.title,
    color: Neutral[800],
  },
  subtitle: {
    ...Typography.bodySm,
    color: Neutral[600],
    marginTop: 2,
  },
});

export default ScreenHeader;
