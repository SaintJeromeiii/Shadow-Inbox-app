import type { AccountKey } from '../types/account';
import { getActiveAccountKey, getRelayUrl } from './emailService';

const VOICE_COMMAND_TIMEOUT_MS = 60_000;

export interface VoiceCommandPayload {
  emailId: string;
  originalMessage: string;
  currentDraft: string;
  audioUri: string;
  accountKey?: AccountKey;
}

export interface VoiceCommandResult {
  success: boolean;
  draft?: string;
  transcription?: string;
  mode?: 'live' | 'fallback';
  error?: string;
}

export async function sendVoiceCommand(
  payload: VoiceCommandPayload,
): Promise<VoiceCommandResult> {
  const accountKey = payload.accountKey ?? getActiveAccountKey();
  const extension = payload.audioUri.split('.').pop()?.toLowerCase() || 'm4a';
  const mimeType =
    extension === '3gp'
      ? 'audio/3gp'
      : extension === 'wav'
        ? 'audio/wav'
        : 'audio/m4a';

  const formData = new FormData();
  formData.append('audio', {
    uri: payload.audioUri,
    name: `voice-command.${extension}`,
    type: mimeType,
  } as unknown as Blob);
  formData.append('emailId', payload.emailId);
  formData.append('originalMessage', payload.originalMessage);
  formData.append('currentDraft', payload.currentDraft);
  formData.append('accountKey', accountKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VOICE_COMMAND_TIMEOUT_MS);

  try {
    const response = await fetch(`${getRelayUrl()}/api/emails/voice-command`, {
      method: 'POST',
      headers: {
        'X-Account-Key': accountKey,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `Relay returned ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) errorMessage = body.error;
      } catch {
        const text = await response.text();
        if (text) errorMessage = text;
      }
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as {
      draft?: string;
      transcription?: string;
      mode?: VoiceCommandResult['mode'];
    };

    if (!data.draft?.trim()) {
      return { success: false, error: 'Voice command returned an empty draft.' };
    }

    return {
      success: true,
      draft: data.draft,
      transcription: data.transcription,
      mode: data.mode,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not send voice command to the relay.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
