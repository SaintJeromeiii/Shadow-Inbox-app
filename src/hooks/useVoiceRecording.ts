import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder,
} from 'expo-audio';

function isRecorderActive(recorder: AudioRecorder): boolean {
  try {
    return recorder.isRecording;
  } catch {
    return false;
  }
}

async function safeStopRecording(recorder: AudioRecorder): Promise<void> {
  if (!isRecorderActive(recorder)) {
    return;
  }

  try {
    await recorder.stop();
  } catch {
    // Native recorder may already be released during list unmounts.
  }
}

export function useVoiceRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
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
      void safeStopRecording(recorder);
    };
  }, [recorder]);

  const startRecording = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Microphone permission is required for voice commands.');
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });

    await recorder.prepareToRecordAsync();
    recorder.record();

    setIsRecording(true);
    startPulse();
  }, [recorder, startPulse]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!isRecorderActive(recorder)) {
      setIsRecording(false);
      stopPulse();
      return null;
    }

    try {
      await recorder.stop();
      return recorder.uri ?? null;
    } catch {
      return null;
    } finally {
      setIsRecording(false);
      stopPulse();
      await setAudioModeAsync({ allowsRecording: false });
    }
  }, [recorder, stopPulse]);

  const cancelRecording = useCallback(async () => {
    try {
      await safeStopRecording(recorder);
    } finally {
      setIsRecording(false);
      stopPulse();
      await setAudioModeAsync({ allowsRecording: false });
    }
  }, [recorder, stopPulse]);

  return {
    isRecording,
    pulseAnim,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
