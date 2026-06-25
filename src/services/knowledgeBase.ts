import { KNOWLEDGE_BASE_CONTENT } from '../data/knowledgeBaseContent';

let cachedText: string | null = null;

/**
 * Smart Memory context for triage. Source of truth: backend/knowledgebase.txt
 * (synced into the app bundle via scripts/syncKnowledgeBase.js).
 */
export function getKnowledgeBaseText(): string {
  if (cachedText === null) {
    cachedText = KNOWLEDGE_BASE_CONTENT.trim();
  }
  return cachedText;
}
