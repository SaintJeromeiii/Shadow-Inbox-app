import type { UserProfile } from '../types/userProfile';
import { DEFAULT_USER_PROFILE } from '../types/userProfile';
import { relayFetch, relayHeaders } from './emailService';
import { readLocalProfile, writeLocalProfile } from './onboardingStorage';

function normalizeProfile(input: Partial<UserProfile> | null | undefined): UserProfile {
  return {
    displayName: String(input?.displayName ?? DEFAULT_USER_PROFILE.displayName).trim(),
    email: String(input?.email ?? DEFAULT_USER_PROFILE.email).trim().toLowerCase(),
    roleTitle: String(input?.roleTitle ?? DEFAULT_USER_PROFILE.roleTitle).trim(),
    toneNotes: String(input?.toneNotes ?? DEFAULT_USER_PROFILE.toneNotes).trim(),
    signOff: String(input?.signOff ?? DEFAULT_USER_PROFILE.signOff).trim(),
    knowledgeText: String(input?.knowledgeText ?? DEFAULT_USER_PROFILE.knowledgeText).trim(),
    onboardingCompleted: Boolean(input?.onboardingCompleted),
  };
}

export async function fetchUserProfile(): Promise<UserProfile> {
  const local = await readLocalProfile<UserProfile>();

  try {
    const response = await relayFetch('/api/user/profile', {
      method: 'GET',
      headers: relayHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Profile fetch failed (${response.status})`);
    }

    const data = (await response.json()) as { profile?: Partial<UserProfile> };
    const profile = normalizeProfile(data.profile);
    await writeLocalProfile(profile);
    return profile;
  } catch (error) {
    console.warn('[Shadow Inbox] Could not load profile from relay:', error);
    return normalizeProfile(local);
  }
}

export async function saveUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const current = normalizeProfile(await readLocalProfile<UserProfile>());
  const merged = normalizeProfile({ ...current, ...updates });
  await writeLocalProfile(merged);

  try {
    const response = await relayFetch('/api/user/profile', {
      method: 'PUT',
      headers: relayHeaders(),
      body: JSON.stringify({ profile: merged }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Profile save failed (${response.status})`);
    }

    const data = (await response.json()) as { profile?: Partial<UserProfile> };
    const saved = normalizeProfile(data.profile ?? merged);
    await writeLocalProfile(saved);
    return saved;
  } catch (error) {
    console.warn('[Shadow Inbox] Profile saved locally; relay sync pending:', error);
    return merged;
  }
}

export function buildProfileKnowledgeText(profile: UserProfile): string {
  const sections = [
    `Name: ${profile.displayName}`,
    profile.email ? `Primary email: ${profile.email}` : null,
    profile.roleTitle ? `Role: ${profile.roleTitle}` : null,
    profile.toneNotes ? `Communication tone:\n${profile.toneNotes}` : null,
    profile.signOff ? `Preferred sign-off: ${profile.signOff}` : null,
  ].filter(Boolean);

  return sections.join('\n').trim();
}
