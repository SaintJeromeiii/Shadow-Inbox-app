import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  playCharacterDeleteSound,
  playRandomDeleteMilestoneSound,
  playRetroSound,
  preloadRetroSounds,
} from '../services/retroSoundService';
import ActionCompleteToast from '../components/ActionCompleteToast';
import LevelUpFlash from '../components/LevelUpFlash';
import { useCharacter } from './CharacterContext';

interface RetroFeedbackContextValue {
  playDeleteSound: () => void;
  playSuccessSound: () => void;
  showActionComplete: (message?: string) => void;
  triggerLevelUp: (tierName: string) => void;
}

const RetroFeedbackContext = createContext<RetroFeedbackContextValue | null>(null);

const COMBO_DELETE_INTERVAL = 20;

export function RetroFeedbackProvider({ children }: { children: ReactNode }) {
  const { characterId } = useCharacter();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('ACTION COMPLETE!');
  const [levelUpVisible, setLevelUpVisible] = useState(false);
  const [levelUpTierName, setLevelUpTierName] = useState('');
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletionCountRef = useRef(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const playDeleteSound = useCallback(() => {
    deletionCountRef.current += 1;
    void playCharacterDeleteSound(characterId);

    if (deletionCountRef.current % COMBO_DELETE_INTERVAL === 0) {
      void playRandomDeleteMilestoneSound();
    }
  }, [characterId]);

  const playSuccessSound = useCallback(() => {
    void playRetroSound('actionComplete');
  }, []);

  const showActionComplete = useCallback(
    (message = 'ACTION COMPLETE!') => {
      clearHideTimer();
      setToastMessage(message);
      setToastVisible(true);
      void playRetroSound('actionComplete');
      hideTimerRef.current = setTimeout(() => {
        setToastVisible(false);
        hideTimerRef.current = null;
      }, 2200);
    },
    [clearHideTimer],
  );

  const triggerLevelUp = useCallback((tierName: string) => {
    setLevelUpTierName(tierName);
    setLevelUpVisible(true);
    void playRetroSound('levelUp');
  }, []);

  const value = useMemo(
    () => ({
      playDeleteSound,
      playSuccessSound,
      showActionComplete,
      triggerLevelUp,
    }),
    [playDeleteSound, playSuccessSound, showActionComplete, triggerLevelUp],
  );

  return (
    <RetroFeedbackContext.Provider value={value}>
      {children}
      <ActionCompleteToast visible={toastVisible} message={toastMessage} />
      <LevelUpFlash
        visible={levelUpVisible}
        tierName={levelUpTierName}
        onFinished={() => setLevelUpVisible(false)}
      />
    </RetroFeedbackContext.Provider>
  );
}

export function useRetroFeedback(): RetroFeedbackContextValue {
  const context = useContext(RetroFeedbackContext);
  if (!context) {
    throw new Error('useRetroFeedback must be used within RetroFeedbackProvider');
  }
  return context;
}

export function useRetroFeedbackOptional(): RetroFeedbackContextValue | null {
  return useContext(RetroFeedbackContext);
}

export { preloadRetroSounds };
