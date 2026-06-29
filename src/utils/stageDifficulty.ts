export interface StageDifficulty {
  label: string;
  color: string;
  description: string;
}

export function getStageDifficulty(count: number): StageDifficulty {
  if (count >= 500) {
    return {
      label: 'BOSS LEVEL',
      color: '#FF3333',
      description: 'CRITICAL INVASION: Clear immediately!',
    };
  }
  if (count >= 250) {
    return {
      label: 'INTERMEDIATE',
      color: '#FF9933',
      description: 'Moderate threat active.',
    };
  }
  if (count >= 100) {
    return {
      label: 'BEGINNER',
      color: '#33FFFF',
      description: 'Securing the perimeter.',
    };
  }
  return {
    label: 'EASY PEASY',
    color: '#33FF33',
    description: 'Area completely secure.',
  };
}

export function isBossLevel(count: number): boolean {
  return count >= 500;
}
