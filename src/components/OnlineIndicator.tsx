import React from 'react';
import {View, StyleSheet} from 'react-native';

interface Props {
  isOnline: boolean;
  size?: number;
}

const OnlineIndicator: React.FC<Props> = ({isOnline, size = 12}) => {
  if (!isOnline) return null;

  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          bottom: 0,
          right: 0,
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});

export default OnlineIndicator;
