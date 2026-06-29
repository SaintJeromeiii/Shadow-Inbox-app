import type { CharacterId } from '../types/character';

export const QUANTUM_CHARACTER_ID: CharacterId = 'quantum_neutral';

export function shouldEnterQuantumRealm(characterId: CharacterId): boolean {
  return characterId === QUANTUM_CHARACTER_ID;
}
