import type { AccountKey } from '../types/account';
import { getActiveAccountKey, getRelayUrl } from './emailService';

const VOICE_INGEST_TIMEOUT_MS = 90_000;

export interface VoiceNoteIngestResult {
  success: boolean;
  message?: string;
  voiceNote?: {
    id: string;
    category: string;
    project: string;
    summary: string;
    transcript: string;
    structuredData: Record<string, unknown>;
    routedTo?: string | null;
  };
  error?: string;
}

export async function ingestVoiceNote(
  audioUri: string,
  accountKey: AccountKey = getActiveAccountKey(),
): Promise<VoiceNoteIngestResult> {
  const extension = audioUri.split('.').pop()?.toLowerCase() || 'm4a';
  const mimeType =
    extension === '3gp'
      ? 'audio/3gp'
      : extension === 'wav'
        ? 'audio/wav'
        : extension === 'mp4'
          ? 'audio/mp4'
          : 'audio/m4a';

  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    name: `voice-note.${extension}`,
    type: mimeType,
  } as unknown as Blob);
  formData.append('accountKey', accountKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VOICE_INGEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getRelayUrl()}/api/voice/ingest`, {
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
      message?: string;
      voiceNote?: VoiceNoteIngestResult['voiceNote'];
    };

    return {
      success: true,
      message: data.message,
      voiceNote: data.voiceNote,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not send voice note to the relay.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
