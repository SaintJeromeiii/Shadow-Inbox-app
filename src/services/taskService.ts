import type { AccountKey } from '../types/account';
import type { ExtractedTask } from '../types/task';
import { getRelayUrl } from './emailService';

const REQUEST_TIMEOUT_MS = 15_000;

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
      throw new Error(`Task request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchExtractedTasks(
  accountKey?: AccountKey,
): Promise<ExtractedTask[]> {
  const params = new URLSearchParams();
  if (accountKey) params.set('accountKey', accountKey);

  const query = params.toString();
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/tasks${query ? `?${query}` : ''}`,
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

  const data = (await response.json()) as { tasks?: ExtractedTask[] };
  return data.tasks ?? [];
}

export async function toggleExtractedTask(
  taskId: string,
  options?: { archiveSource?: boolean },
): Promise<{
  task: ExtractedTask;
  archived?: boolean;
  archiveError?: string | null;
}> {
  const response = await fetchWithTimeout(
    `${getRelayUrl()}/api/tasks/${encodeURIComponent(taskId)}/toggle`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        archiveSource: options?.archiveSource !== false,
      }),
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
    task: ExtractedTask;
    archived?: boolean;
    archiveError?: string | null;
  };

  return data;
}

export function groupTasksByProject(tasks: ExtractedTask[]): Array<{
  project: string;
  tasks: ExtractedTask[];
}> {
  const groups = new Map<string, ExtractedTask[]>();

  for (const task of tasks) {
    const project = task.project?.trim() || 'General';
    const bucket = groups.get(project) ?? [];
    bucket.push(task);
    groups.set(project, bucket);
  }

  return [...groups.entries()]
    .map(([project, projectTasks]) => ({
      project,
      tasks: projectTasks.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }))
    .sort((a, b) => {
      const aActive = a.tasks.filter((task) => !task.completed).length;
      const bActive = b.tasks.filter((task) => !task.completed).length;
      return bActive - aActive;
    });
}
