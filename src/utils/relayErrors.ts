export class AiQuotaExceededError extends Error {
  readonly code = 'AI_QUOTA_EXCEEDED';

  constructor(message: string) {
    super(message);
    this.name = 'AiQuotaExceededError';
  }
}

export function throwIfAiQuotaExceeded(response: Response, body: { error?: string }): void {
  if (response.status === 429) {
    throw new AiQuotaExceededError(
      body.error ?? 'Daily AI limit reached. Try again tomorrow.',
    );
  }
}

export function isAiQuotaError(error: unknown): boolean {
  return error instanceof AiQuotaExceededError;
}
