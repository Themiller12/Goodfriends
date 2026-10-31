import React from 'react';
import {Modal, ModalProps} from 'react-native';

// Android : la barre d'état et de navigation sont couvertes par l'overlay.
const AppModal: React.FC<ModalProps> = props => (
  <Modal statusBarTranslucent navigationBarTranslucent {...props} />
);

export default AppModal;
