import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_CHARACTER_ID, normalizeCharacterId } from '../constants/characters';
import { getCharacterById } from '../data/characters';
import {
  loadSelectedCharacterId,
  saveSelectedCharacterId,
} from '../services/characterStorage';
import { setActiveCharacterId } from '../services/emailService';
import type { CharacterId, PlayableCharacter } from '../types/character';

interface CharacterContextValue {
  characterId: CharacterId;
  character: PlayableCharacter;
  ready: boolean;
  selectCharacter: (characterId: CharacterId) => Promise<void>;
}

const CharacterContext = createContext<CharacterContextValue | null>(null);

interface CharacterProviderProps {
  children: ReactNode;
}

export function CharacterProvider({ children }: CharacterProviderProps) {
  const [characterId, setCharacterId] = useState<CharacterId>(DEFAULT_CHARACTER_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadSelectedCharacterId()
      .then((savedId) => {
        setCharacterId(normalizeCharacterId(savedId));
      })
      .finally(() => {
        setReady(true);
      });
  }, []);

  useEffect(() => {
    setActiveCharacterId(characterId);
  }, [characterId]);

  const selectCharacter = useCallback(async (nextCharacterId: CharacterId) => {
    setCharacterId(nextCharacterId);
    setActiveCharacterId(nextCharacterId);
    await saveSelectedCharacterId(nextCharacterId);
  }, []);

  const value = useMemo<CharacterContextValue>(
    () => ({
      characterId,
      character: getCharacterById(characterId),
      ready,
      selectCharacter,
    }),
    [characterId, ready, selectCharacter],
  );

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>;
}

export function useCharacter(): CharacterContextValue {
  const context = useContext(CharacterContext);
  if (!context) {
    throw new Error('useCharacter must be used within CharacterProvider');
  }
  return context;
}
