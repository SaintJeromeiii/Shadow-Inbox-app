import type { AccountKey } from './account';

export interface ExtractedTask {
  id: string;
  emailId: string;
  accountKey: AccountKey;
  sender: string;
  sourceSubject: string;
  sourceSummary: string;
  title: string;
  project: string;
  dueHint?: string | null;
  completed: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskGroup {
  project: string;
  tasks: ExtractedTask[];
}
