import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

async function safeStopRecording(
  recorder: ReturnType<typeof useAudioRecorder>,
  isRecording: boolean,
) {
  if (!isRecording) return;
  try {
    await recorder.stop();
  } catch {
    // Native recorder may already be released during screen transitions.
  }
}

export function useVoiceNoteRecording() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = useCallback(() => {
    pulseLoopRef.current?.stop();
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.14,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 480,
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
    let cancelled = false;

    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (cancelled) return;

      setPermissionGranted(status.granted);
      if (!status.granted) return;

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
    })();

    return () => {
      cancelled = true;
      pulseLoopRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (recorderState.isRecording) {
      startPulse();
      return;
    }
    stopPulse();
  }, [recorderState.isRecording, startPulse, stopPulse]);

  const startRecording = useCallback(async () => {
    if (!permissionGranted) {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        throw new Error('Microphone permission is required for voice notes.');
      }
      setPermissionGranted(true);
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [permissionGranted, recorder]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recorderState.isRecording) {
      return recorder.uri ?? null;
    }

    await safeStopRecording(recorder, true);
    return recorder.uri ?? null;
  }, [recorder, recorderState.isRecording]);

  const toggleRecording = useCallback(async (): Promise<string | null> => {
    if (recorderState.isRecording) {
      return stopRecording();
    }

    await startRecording();
    return null;
  }, [recorderState.isRecording, startRecording, stopRecording]);

  return {
    isRecording: recorderState.isRecording,
    durationMillis: recorderState.durationMillis,
    pulseAnim,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
