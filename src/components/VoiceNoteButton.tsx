import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceNoteRecording } from '../hooks/useVoiceNoteRecording';
import { ingestVoiceNote } from '../services/voiceNoteService';
import type { AccountKey } from '../types/account';

const HOLD_DELAY_MS = 220;

interface VoiceNoteButtonProps {
  accountKey: AccountKey;
  compact?: boolean;
  onIngested?: (message: string) => void;
}

export default function VoiceNoteButton({
  accountKey,
  compact = false,
  onIngested,
}: VoiceNoteButtonProps) {
  const {
    isRecording,
    durationMillis,
    pulseAnim,
    startRecording,
    stopRecording,
  } = useVoiceNoteRecording();
  const [uploading, setUploading] = useState(false);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdSessionRef = useRef(false);
  const tapToggleRef = useRef(false);
  const suppressTapRef = useRef(false);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const uploadRecording = useCallback(
    async (uri: string) => {
      setUploading(true);
      const result = await ingestVoiceNote(uri, accountKey);
      setUploading(false);

      if (!result.success) {
        Alert.alert('Voice note failed', result.error || 'Could not process voice note.');
        return;
      }

      const message = result.message || 'Voice note saved.';
      onIngested?.(message);
      Alert.alert('Voice note', message);
    },
    [accountKey, onIngested],
  );

  const handlePressIn = useCallback(() => {
    if (uploading || isRecording) return;

    holdSessionRef.current = false;
    clearHoldTimer();

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      holdSessionRef.current = true;
      tapToggleRef.current = false;
      void startRecording().catch((error) => {
        holdSessionRef.current = false;
        Alert.alert(
          'Voice note',
          error instanceof Error ? error.message : 'Recording failed.',
        );
      });
    }, HOLD_DELAY_MS);
  }, [clearHoldTimer, isRecording, startRecording, uploading]);

  const handlePressOut = useCallback(() => {
    clearHoldTimer();

    if (!holdSessionRef.current) return;

    holdSessionRef.current = false;
    suppressTapRef.current = true;

    void (async () => {
      try {
        const uri = await stopRecording();
        if (!uri) {
          Alert.alert('Voice note', 'No recording was captured.');
          return;
        }
        await uploadRecording(uri);
      } catch (error) {
        setUploading(false);
        Alert.alert(
          'Voice note',
          error instanceof Error ? error.message : 'Recording failed.',
        );
      }
    })();
  }, [clearHoldTimer, stopRecording, uploadRecording]);

  const handlePress = useCallback(() => {
    if (uploading) return;

    if (suppressTapRef.current) {
      suppressTapRef.current = false;
      return;
    }

    if (holdSessionRef.current) return;

    void (async () => {
      try {
        if (isRecording && tapToggleRef.current) {
          const uri = await stopRecording();
          tapToggleRef.current = false;
          if (!uri) {
            Alert.alert('Voice note', 'No recording was captured.');
            return;
          }
          await uploadRecording(uri);
          return;
        }

        if (!isRecording) {
          tapToggleRef.current = true;
          await startRecording();
        }
      } catch (error) {
        setUploading(false);
        tapToggleRef.current = false;
        Alert.alert(
          'Voice note',
          error instanceof Error ? error.message : 'Recording failed.',
        );
      }
    })();
  }, [isRecording, startRecording, stopRecording, uploadRecording, uploading]);

  const seconds = Math.floor(durationMillis / 1000);
  const busy = uploading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.pill,
        compact && styles.pillCompact,
        isRecording && styles.pillRecording,
        busy && styles.pillBusy,
        pressed && !busy && styles.pillPressed,
      ]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={() => void handlePress()}
      disabled={busy}
      accessibilityHint="Hold to record and release to send, or tap to toggle recording"
      accessibilityLabel={
        busy
          ? 'Uploading voice note'
          : isRecording
            ? 'Recording voice note'
            : 'Record voice note'
      }
    >
      {busy ? (
        <ActivityIndicator size="small" color="#F8FAFC" />
      ) : (
        <Animated.View style={{ transform: [{ scale: isRecording ? pulseAnim : 1 }] }}>
          <Ionicons
            name={isRecording ? 'mic' : 'mic-outline'}
            size={compact ? 18 : 20}
            color={isRecording ? '#FCA5A5' : '#E2E8F0'}
          />
        </Animated.View>
      )}
      {isRecording && !busy ? (
        <View style={styles.timerDot}>
          <Text style={styles.timerText}>{seconds}s</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  pillCompact: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  pillRecording: {
    borderColor: 'rgba(248, 113, 113, 0.65)',
    backgroundColor: '#1F1418',
  },
  pillBusy: {
    opacity: 0.75,
  },
  pillPressed: {
    opacity: 0.85,
  },
  timerDot: {
    position: 'absolute',
    bottom: -6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: '#7F1D1D',
  },
  timerText: {
    color: '#FECACA',
    fontSize: 9,
    fontWeight: '700',
  },
});
