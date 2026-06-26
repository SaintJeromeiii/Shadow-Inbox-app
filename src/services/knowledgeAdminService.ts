import { getRelayUrl } from './emailService';

const REQUEST_TIMEOUT_MS = 20_000;

export interface KnowledgeMemory {
  id: string;
  timestamp: string;
  text: string;
}

export interface KnowledgePayload {
  fullText: string;
  paragraphs: string[];
  recentMemories: KnowledgeMemory[];
  updatedAt: string | null;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Knowledge request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchKnowledgeBase(): Promise<KnowledgePayload> {
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/knowledge`,
    { method: 'GET' },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorMessage = `Relay returned ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as KnowledgePayload & { success?: boolean };
  return {
    fullText: data.fullText ?? '',
    paragraphs: data.paragraphs ?? [],
    recentMemories: data.recentMemories ?? [],
    updatedAt: data.updatedAt ?? null,
  };
}

export async function updateKnowledgeBase(snippet: string): Promise<KnowledgePayload> {
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/knowledge/update`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet }),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorMessage = `Relay returned ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    knowledge?: KnowledgePayload;
  };

  if (!data.knowledge) {
    return fetchKnowledgeBase();
  }

  return data.knowledge;
}

export function formatKnowledgeTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
