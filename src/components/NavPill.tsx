import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '../context/ThemeContext';
import {Radius, Shadow, Spacing} from '../theme/designSystem';

interface NavPillProps {
  activeRoute: string;
  onNavigate: (route: string) => void;
}

const TABS = [
  {route: 'Home', icon: 'home', label: 'Accueil'},
  {route: 'ContactNetwork', icon: 'bubble-chart', label: 'Réseau'},
  {route: 'Conversations', icon: 'chat-bubble-outline', label: 'Messages'},
  {route: 'Profile', icon: 'person-outline', label: 'Profil'},
] as const;

const NavPill: React.FC<NavPillProps> = ({activeRoute, onNavigate}) => {
  const {theme} = useTheme();

  return (
    <View style={[styles.navPill, {shadowColor: Shadow.md.shadowColor}]}>
      {TABS.map(tab => {
        const isActive = activeRoute === tab.route;
        return (
          <TouchableOpacity
            key={tab.route}
            style={styles.navItem}
            onPress={() => !isActive && onNavigate(tab.route)}
            activeOpacity={isActive ? 1 : 0.7}>
            <MaterialIcons
              name={tab.icon}
              size={22}
              color={isActive ? theme.primary : '#65655c'}
            />
            <Text style={[styles.navLabel, isActive && {color: theme.primary}]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  navPill: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: Radius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    // Shadow
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#65655c',
    letterSpacing: 0.2,
  },
});

export default NavPill;
