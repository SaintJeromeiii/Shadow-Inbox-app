import { useCallback, useState } from 'react';
import type { Animated } from 'react-native';
import { useVoiceRecording } from './useVoiceRecording';

export interface FeedVoiceRecordingControl {
  recordingNotificationId: string | null;
  pulseAnim: Animated.Value;
  isRecording: boolean;
  startRecording: (notificationId: string) => Promise<void>;
  stopRecording: () => Promise<string | null>;
}

export function useFeedVoiceRecording(): FeedVoiceRecordingControl {
  const [recordingNotificationId, setRecordingNotificationId] = useState<string | null>(
    null,
  );
  const {
    isRecording,
    pulseAnim,
    startRecording: startSharedRecording,
    stopRecording: stopSharedRecording,
    cancelRecording,
  } = useVoiceRecording();

  const startRecording = useCallback(
    async (notificationId: string) => {
      if (isRecording && recordingNotificationId && recordingNotificationId !== notificationId) {
        await cancelRecording();
      }

      await startSharedRecording();
      setRecordingNotificationId(notificationId);
    },
    [
      cancelRecording,
      isRecording,
      recordingNotificationId,
      startSharedRecording,
    ],
  );

  const stopRecording = useCallback(async () => {
    const uri = await stopSharedRecording();
    setRecordingNotificationId(null);
    return uri;
  }, [stopSharedRecording]);

  return {
    recordingNotificationId,
    pulseAnim,
    isRecording,
    startRecording,
    stopRecording,
  };
}
