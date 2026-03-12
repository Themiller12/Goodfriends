import React, {useEffect, useState, forwardRef} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {BackHandler, Alert} from 'react-native';
import AuthService from '../services/AuthService';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import VerificationScreen from '../screens/VerificationScreen';
import HomeScreen from '../screens/HomeScreen';
import AddContactScreen from '../screens/AddContactScreen';
import ContactDetailScreen from '../screens/ContactDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import GroupsScreen from '../screens/GroupsScreen';
import MyGroupsScreen from '../screens/MyGroupsScreen';
import MyFriendsScreen from '../screens/MyFriendsScreen';
import SearchUsersScreen from '../screens/SearchUsersScreen';
import ManageRelationsScreen from '../screens/ManageRelationsScreen';
import ChatScreen from '../screens/ChatScreen';
import ConversationsScreen from '../screens/ConversationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ThemeSettingsScreen from '../screens/ThemeSettingsScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import PrivacySettingsScreen from '../screens/PrivacySettingsScreen';
import BirthdaysScreen from '../screens/BirthdaysScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = forwardRef<any, {onReady?: () => void}>((props, ref) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    const loggedIn = await AuthService.isLoggedIn();
    setIsLoggedIn(loggedIn);
    setIsLoading(false);
  };

  if (isLoading) {
    return null; // Ou un écran de chargement
  }

  return (
    <NavigationContainer ref={ref} onReady={props.onReady}>
      <Stack.Navigator
        initialRouteName={isLoggedIn ? 'Home' : 'Login'}
        screenOptions={{
          headerStyle: {
            backgroundColor: '#2196F3',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          gestureEnabled: true,
          animation: 'slide_from_right',
        }}>
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
          component={HomeScreen}
          options={{
            headerShown: false,
            gestureEnabled: false,
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
          options={{
            headerShown: false,
          }}
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
            title: 'Utilisateurs GoodFriends',
            headerBackTitle: 'Retour',
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
          name="Conversations"
          component={ConversationsScreen}
          options={{
            headerShown: false,
          }}
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
  );
});

export default AppNavigator;
