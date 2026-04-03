import React, {useEffect, useState, useCallback, useRef, forwardRef} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {BackHandler, Alert, View} from 'react-native';
import NavPill from '../components/NavPill';
import AuthService from '../services/AuthService';
import OnlineStatusService from '../services/OnlineStatusService';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerificationScreen from '../screens/VerificationScreen';
import DashboardScreen from '../screens/DashboardScreen';
import HomeScreen from '../screens/HomeScreen';
import ContactProfileScreen from '../screens/ContactProfileScreen';
import AddContactScreen from '../screens/AddContactScreen';
import ContactDetailScreen from '../screens/ContactDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import GroupsScreen from '../screens/GroupsScreen';
import MyGroupsScreen from '../screens/MyGroupsScreen';
import MyFriendsScreen from '../screens/MyFriendsScreen';
import SearchUsersScreen from '../screens/SearchUsersScreen';
import ManageRelationsScreen from '../screens/ManageRelationsScreen';
import ChatScreen from '../screens/ChatScreen';
import GroupChatScreen from '../screens/GroupChatScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ThemeSettingsScreen from '../screens/ThemeSettingsScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import PrivacySettingsScreen from '../screens/PrivacySettingsScreen';
import BirthdaysScreen from '../screens/BirthdaysScreen';

const Stack = createNativeStackNavigator();

const MAIN_TABS = ['Home', 'ContactNetwork', 'Conversations', 'Profile'];

const getActiveRouteName = (state: any): string => {
  if (!state?.routes) return '';
  const route = state.routes[state.index ?? 0];
  if (route.state) return getActiveRouteName(route.state);
  return route.name;
};

const AppNavigator = forwardRef<any, {onReady?: () => void}>((props, ref) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeRoute, setActiveRoute] = useState('');
  const slideDirectionRef = useRef<'slide_from_right' | 'slide_from_left'>('slide_from_right');

  const handleStateChange = useCallback((state: any) => {
    const route = getActiveRouteName(state);
    setActiveRoute(route);
  }, []);

  const handleNavigate = useCallback((route: string) => {
    const currentIdx = MAIN_TABS.indexOf(activeRoute as any);
    const targetIdx = MAIN_TABS.indexOf(route as any);
    const dir =
      currentIdx !== -1 && targetIdx !== -1 && targetIdx < currentIdx
        ? 'left'
        : 'right';
    slideDirectionRef.current = dir === 'left' ? 'slide_from_left' : 'slide_from_right';
    (ref as React.RefObject<any>)?.current?.navigate(route, {_animDir: dir});
  }, [ref, activeRoute]);

  useEffect(() => {
    checkLoginStatus();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      OnlineStatusService.startHeartbeat();
    } else {
      OnlineStatusService.stopHeartbeat();
    }
  }, [isLoggedIn]);

  const checkLoginStatus = async () => {
    const loggedIn = await AuthService.isLoggedIn();
    setIsLoggedIn(loggedIn);
    setIsLoading(false);
  };

  if (isLoading) {
    return null; // Ou un écran de chargement
  }

  return (
    <View style={{flex: 1}}>
    <NavigationContainer ref={ref} onReady={props.onReady} onStateChange={handleStateChange}>
      <Stack.Navigator
        initialRouteName={isLoggedIn ? 'Home' : 'Login'}
        screenOptions={() => ({
          headerStyle: {
            backgroundColor: '#2196F3',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          gestureEnabled: true,
          animation: slideDirectionRef.current,
        })}>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{
            title: 'Créer un compte',
            headerBackTitle: 'Retour',
          }}
        />
        <Stack.Screen
          name="Verification"
          component={VerificationScreen}
          options={{
            title: 'Vérification',
            headerBackTitle: 'Retour',
          }}
        />
        <Stack.Screen
          name="Home"
          component={DashboardScreen}
          options={({route}: any) => ({
            headerShown: false,
            gestureEnabled: false,
            animation: route.params?._animDir === 'left' ? 'slide_from_left' : 'slide_from_right',
          })}
        />
        <Stack.Screen
          name="ContactNetwork"
          component={HomeScreen}
          options={({route}: any) => ({
            headerShown: false,
            animation: route.params?._animDir === 'left' ? 'slide_from_left' : 'slide_from_right',
          })}
        />
        <Stack.Screen
          name="ContactProfile"
          component={ContactProfileScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="AddContact"
          component={AddContactScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ContactDetail"
          component={ContactDetailScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={({route}: any) => ({
            headerShown: false,
            animation: route.params?._animDir === 'left' ? 'slide_from_left' : 'slide_from_right',
          })}
        />
        <Stack.Screen
          name="Groups"
          component={GroupsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="MyGroups"
          component={MyGroupsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="MyFriends"
          component={MyFriendsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="SearchUsers"
          component={SearchUsersScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ManageRelations"
          component={ManageRelationsScreen}
          options={{
            title: 'Gérer les relations',
            headerBackTitle: 'Retour',
          }}
        />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="GroupChat"
          component={GroupChatScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Conversations"
          component={ConversationsScreen}
          options={({route}: any) => ({
            headerShown: false,
            animation: route.params?._animDir === 'left' ? 'slide_from_left' : 'slide_from_right',
          })}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ThemeSettings"
          component={ThemeSettingsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="NotificationSettings"
          component={NotificationSettingsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="PrivacySettings"
          component={PrivacySettingsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Birthdays"
          component={BirthdaysScreen}
          options={{
            title: 'Anniversaires',
            headerShown: false,
            headerBackTitle: 'Retour',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
    {MAIN_TABS.includes(activeRoute) && (
      <NavPill activeRoute={activeRoute} onNavigate={handleNavigate} />
    )}
    </View>
  );
});

export default AppNavigator;
