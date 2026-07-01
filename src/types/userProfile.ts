export interface UserProfile {
  displayName: string;
  email: string;
  roleTitle: string;
  toneNotes: string;
  signOff: string;
  knowledgeText: string;
  onboardingCompleted: boolean;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: '',
  email: '',
  roleTitle: '',
  toneNotes:
    'Sharp, efficient, concise, and professional. No filler, warmth-padding, or corporate fluff.',
  signOff: '',
  knowledgeText: '',
  onboardingCompleted: false,
};

export const TONE_PRESETS: Array<{ id: string; label: string; text: string }> = [
  {
    id: 'professional',
    label: 'Professional',
    text: 'Sharp, efficient, concise, and professional. Lead with the answer, not pleasantries.',
  },
  {
    id: 'founder',
    label: 'Founder',
    text: 'Direct and decisive. Short sentences. Action-oriented with clear next steps.',
  },
  {
    id: 'friendly',
    label: 'Warm but brief',
    text: 'Approachable and clear, but still concise. No corporate filler or excessive formality.',
  },
];
