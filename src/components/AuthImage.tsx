import React, {useEffect, useState} from 'react';
import {Image, ImageProps} from 'react-native';
import API_CONFIG from '../config/api';
import ApiClient from '../services/ApiClient';

interface AuthImageProps extends Omit<ImageProps, 'source'> {
  uri: string;
}

// Les images hébergées par l'API exigent le jeton de session ; il n'est jamais envoyé à un autre domaine.
const AuthImage: React.FC<AuthImageProps> = ({uri, ...imageProps}) => {
  const needsAuth = uri.startsWith(API_CONFIG.BASE_URL);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (needsAuth) {
      ApiClient.getToken().then(setToken);
    }
  }, [needsAuth]);

  if (needsAuth && !token) {
    return null;
  }

  return (
    <Image
      {...imageProps}
      source={needsAuth ? {uri, headers: {Authorization: `Bearer ${token}`}} : {uri}}
    />
  );
};

export default AuthImage;
