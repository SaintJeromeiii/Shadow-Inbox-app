import AsyncStorage from '@react-native-async-storage/async-storage';

const ARCADE_GATE_KEY = '@shadow_inbox/arcade_gate_complete';

export async function isArcadeGateComplete(): Promise<boolean> {
  return (await AsyncStorage.getItem(ARCADE_GATE_KEY)) === 'true';
}

export async function setArcadeGateComplete(complete: boolean): Promise<void> {
  if (complete) {
    await AsyncStorage.setItem(ARCADE_GATE_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(ARCADE_GATE_KEY);
  }
}
