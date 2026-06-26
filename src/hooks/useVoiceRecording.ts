import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { Audio } from 'expo-av';

export function useVoiceRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoopRef.current.start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseLoopRef.current?.stop();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  useEffect(() => {
    return () => {
      pulseLoopRef.current?.stop();
      void recordingRef.current?.stopAndUnloadAsync();
    };
  }, []);

  const startRecording = useCallback(async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Microphone permission is required for voice commands.');
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();

    recordingRef.current = recording;
    setIsRecording(true);
    startPulse();
  }, [startPulse]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recording = recordingRef.current;
    if (!recording) return null;

    try {
      await recording.stopAndUnloadAsync();
      return recording.getURI();
    } finally {
      recordingRef.current = null;
      setIsRecording(false);
      stopPulse();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
  }, [stopPulse]);

  const cancelRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
    } catch {
      // ignore
    } finally {
      recordingRef.current = null;
      setIsRecording(false);
      stopPulse();
    }
  }, [stopPulse]);

  return {
    isRecording,
    pulseAnim,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
