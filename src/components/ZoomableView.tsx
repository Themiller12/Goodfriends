import React from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {runOnJS, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

interface ZoomableViewProps {
  children: React.ReactNode;
  onSingleTap?: () => void;
}

// Plein écran zoomable : pincement, déplacement quand l'image est agrandie, double tap pour zoomer / revenir.
// À utiliser dans un <Modal> : GestureHandlerRootView est nécessaire dans la hiérarchie du Modal.
const ZoomableView: React.FC<ZoomableViewProps> = ({children, onSingleTap}) => {
  const {width, height} = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const clampTranslation = (value: number, size: number, currentScale: number) => {
    'worklet';
    const max = Math.max(0, (size * currentScale - size) / 2);
    return Math.min(max, Math.max(-max, value));
  };

  const resetPosition = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.min(MAX_SCALE, Math.max(0.8, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        resetPosition();
      } else {
        savedScale.value = scale.value;
        translateX.value = clampTranslation(translateX.value, width, scale.value);
        translateY.value = clampTranslation(translateY.value, height, scale.value);
        savedX.value = translateX.value;
        savedY.value = translateY.value;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate(e => {
      if (savedScale.value <= 1) {
        return;
      }
      translateX.value = clampTranslation(savedX.value + e.translationX, width, scale.value);
      translateY.value = clampTranslation(savedY.value + e.translationY, height, scale.value);
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        resetPosition();
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        savedScale.value = DOUBLE_TAP_SCALE;
      }
    });

  const singleTap = Gesture.Tap()
    .requireExternalGestureToFail(doubleTap)
    .onEnd(() => {
      if (onSingleTap && savedScale.value <= 1) {
        runOnJS(onSingleTap)();
      }
    });

  const gesture = Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(doubleTap, singleTap));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {translateX: translateX.value},
      {translateY: translateY.value},
      {scale: scale.value},
    ],
  }));

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.content, animatedStyle]}>{children}</Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ZoomableView;
