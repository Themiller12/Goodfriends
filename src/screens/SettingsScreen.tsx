import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import {Neutral, Spacing, Radius, Shadow, Typography} from '../theme/designSystem';

interface SettingsScreenProps {
  navigation: any;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({navigation}) => {
  const {theme} = useTheme();

  const menuItems = [
    {
      id: 'profile',
      title: 'Mon profil',
      subtitle: 'Informations personnelles',
      icon: 'person',
      color: '#1565C0',
      bg: '#E3F2FD',
      onPress: () => navigation.navigate('Profile'),
    },
    {
      id: 'friends',
      title: 'Mes amis GoodFriends',
      subtitle: 'Connexions et demandes',
      icon: 'group',
      color: '#2E7D32',
      bg: '#E8F5E9',
      onPress: () => navigation.navigate('MyFriends'),
    },
    {
      id: 'groups',
      title: 'Mes groupes',
      subtitle: 'Organiser mes contacts',
      icon: 'folder',
      color: '#E65100',
      bg: '#FFF3E0',
      onPress: () => navigation.navigate('MyGroups'),
    },
    {
      id: 'theme',
      title: 'Affichage',
      subtitle: 'Thème et vue par défaut',
      icon: 'palette',
      color: '#6A1B9A',
      bg: '#F3E5F5',
      onPress: () => navigation.navigate('ThemeSettings'),
    },
    {
      id: 'notifications',
      title: 'Notifications',
      subtitle: 'Alertes et rappels',
      icon: 'notifications',
      color: '#F57C00',
      bg: '#FFF8E1',
      onPress: () => navigation.navigate('NotificationSettings'),
    },
    {
      id: 'privacy',
      title: 'Confidentialité',
      subtitle: 'Paramètres de confidentialité',
      icon: 'lock',
      color: '#C62828',
      bg: '#FFEBEE',
      onPress: () => navigation.navigate('PrivacySettings'),
    },
  ];

  const S = createStyles(theme);

  return (
    <ScrollView style={S.container} showsVerticalScrollIndicator={false}>
      {/* En-tête */}
      <View style={S.header}>
        <View style={S.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={S.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
          <Text style={S.headerTitle}>Paramètres</Text>
        </View>
        <Text style={S.headerSubtitle}>Personnalisez votre expérience</Text>
      </View>

      {/* Menu */}
      <View style={S.menuCard}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={item.id}
            style={[
              S.menuRow,
              index === menuItems.length - 1 && S.menuRowLast,
            ]}
            onPress={item.onPress}
            activeOpacity={0.7}>
            <View style={[S.iconBox, {backgroundColor: item.bg}]}>
              <MaterialIcons name={item.icon as any} size={22} color={item.color} />
            </View>
            <View style={S.menuText}>
              <Text style={S.menuTitle}>{item.title}</Text>
              <Text style={S.menuSubtitle}>{item.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={Neutral[300]} />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={S.versionText}>GoodFriends — Version 1.5</Text>
    </ScrollView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Neutral[50],
  },
  header: {
    backgroundColor: theme.primary,
    paddingTop: 48,
    paddingBottom: 28,
    paddingHorizontal: Spacing.xl,
    borderBottomLeftRadius: Radius.xxl,
    borderBottomRightRadius: Radius.xxl,
    ...Shadow.md,
    overflow: 'visible',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  headerTitle: {
    ...Typography.title,
    color: '#FFF',
    flex: 1,
  },
  headerSubtitle: {
    ...Typography.bodyMd,
    color: 'rgba(255,255,255,0.80)',
  },
  menuCard: {
    backgroundColor: Neutral[0],
    borderRadius: Radius.lg,
    marginTop: Spacing.xl,
    marginHorizontal: Spacing.base,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Neutral[100],
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  menuText: {
    flex: 1,
  },
  menuTitle: {
    ...Typography.titleSm,
    color: Neutral[800],
    marginBottom: 2,
  },
  menuSubtitle: {
    ...Typography.bodySm,
    color: Neutral[500],
  },
  versionText: {
    textAlign: 'center',
    ...Typography.bodySm,
    color: Neutral[400],
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xxxl,
  },
});

export default SettingsScreen;
