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
import { ArcadeJoystickIcon } from './ArcadeIcons';
import { arcadeColors } from '../theme/arcadeTheme';
import { useRetroFeedbackOptional } from '../context/RetroFeedbackContext';

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
  const retroFeedback = useRetroFeedbackOptional();

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
      retroFeedback?.showActionComplete('VOICE LOGGED!');
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
          <ArcadeJoystickIcon
            size={compact ? 18 : 20}
            color={isRecording ? arcadeColors.neonPink : arcadeColors.neonCyan}
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: arcadeColors.bgPanel,
    borderWidth: 2,
    borderColor: arcadeColors.borderCyan,
  },
  pillCompact: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  pillRecording: {
    borderColor: arcadeColors.borderPink,
    backgroundColor: arcadeColors.bgPanelElevated,
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
