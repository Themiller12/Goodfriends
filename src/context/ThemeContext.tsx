import React, {createContext, useState, useEffect, useContext} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Theme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export const THEMES: { [key: string]: Theme } = {
  blue: {
    id: 'blue',
    name: 'Bleu Classique',
    primary: '#2196F3',
    secondary: '#1976D2',
    accent: '#03A9F4',
    background: '#E3F2FD',
  },
  green: {
    id: 'green',
    name: 'Vert Nature',
    primary: '#4CAF50',
    secondary: '#388E3C',
    accent: '#66BB6A',
    background: '#E8F5E9',
  },
  purple: {
    id: 'purple',
    name: 'Violet Élégant',
    primary: '#9C27B0',
    secondary: '#7B1FA2',
    accent: '#BA68C8',
    background: '#F3E5F5',
  },
  orange: {
    id: 'orange',
    name: 'Orange Énergique',
    primary: '#FF9800',
    secondary: '#F57C00',
    accent: '#FFB74D',
    background: '#FFF3E0',
  },
};

interface ThemeContextType {
  theme: Theme;
  setTheme: (themeId: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: THEMES.blue,
  setTheme: async () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [theme, setThemeState] = useState<Theme>(THEMES.blue);

  useEffect(() => {
    loadTheme();
  }, []);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('@app_theme');
      if (savedTheme && THEMES[savedTheme]) {
        setThemeState(THEMES[savedTheme]);
      }
    } catch (error) {
      console.error('Error loading theme:', error);
    }
  };

  const setTheme = async (themeId: string) => {
    try {
      if (THEMES[themeId]) {
        await AsyncStorage.setItem('@app_theme', themeId);
        setThemeState(THEMES[themeId]);
      }
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{theme, setTheme}}>
      {children}
    </ThemeContext.Provider>
  );
};
