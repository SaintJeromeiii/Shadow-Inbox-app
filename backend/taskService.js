const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { archiveMessages } = require('./gmailClient');
const { readNotifications, removeNotificationIds } = require('./notificationFeed');
const { APP_LABEL_RULES } = require('./shadowLabels');

const TASKS_PATH = path.join(__dirname, 'extracted_tasks.json');

const PROJECT_LABELS = {
  servicelog: 'ServiceLog',
  dealshield: 'DealShield',
  alpharounds: 'AlphaRounds',
  app_feedback: 'App Feedback',
};

function readTaskStore() {
  try {
    if (!fs.existsSync(TASKS_PATH)) {
      return { version: 1, tasks: [] };
    }

    const parsed = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
    return {
      version: 1,
      tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
    };
  } catch {
    return { version: 1, tasks: [] };
  }
}

function writeTaskStore(store) {
  fs.writeFileSync(TASKS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function extractSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match?.[1]?.trim() || '(no subject)';
}

function inferProject(notification, explicitProject) {
  const normalized = String(explicitProject || '').trim();
  if (normalized) {
    return normalized.replace(/^Shadow\//i, '').replace(/-/g, ' ');
  }

  const haystack = `${extractSubject(notification.rawText)} ${notification.rawText} ${notification.sender}`;
  for (const rule of APP_LABEL_RULES) {
    if (rule.pattern.test(haystack)) {
      return PROJECT_LABELS[rule.key] || rule.key;
    }
  }

  if (notification.shadowLabels?.length) {
    const appLabel = notification.shadowLabels.find((label) =>
      /Shadow\//i.test(label.name),
    );
    if (appLabel?.name) {
      return appLabel.name.replace(/^Shadow\//i, '').replace(/-/g, ' ');
    }
  }

  return 'General';
}

function buildTaskId(emailId, title, index) {
  const hash = crypto
    .createHash('sha1')
    .update(`${emailId}:${index}:${title}`)
    .digest('hex')
    .slice(0, 10);
  return `task-${hash}`;
}

function normalizeActionItem(item, notification, index) {
  const title = String(item?.title || item?.text || '').trim();
  if (!title) return null;

  return {
    title: title.slice(0, 240),
    project: inferProject(notification, item?.project),
    dueHint: item?.dueHint ? String(item.dueHint).trim().slice(0, 80) : null,
    index,
  };
}

function syncTasksFromTriage(accountKey, notification, triage) {
  if (!notification?.id || !triage) return [];

  const store = readTaskStore();
  const remaining = store.tasks.filter(
    (task) => !(task.emailId === notification.id && !task.completed),
  );

  let actionItems = Array.isArray(triage.actionItems)
    ? triage.actionItems
        .map((item, index) => normalizeActionItem(item, notification, index))
        .filter(Boolean)
    : [];

  if (actionItems.length === 0 && triage.category === 'action_required') {
    actionItems = [
      normalizeActionItem(
        {
          title: triage.cleanSummary || 'Follow up on this email',
          project: inferProject(notification),
        },
        notification,
        0,
      ),
    ].filter(Boolean);
  }

  const createdAt = new Date().toISOString();
  const newTasks = actionItems.map((item, index) => ({
    id: buildTaskId(notification.id, item.title, index),
    emailId: notification.id,
    accountKey,
    sender: notification.sender,
    sourceSubject: extractSubject(notification.rawText),
    sourceSummary: triage.cleanSummary || '',
    title: item.title,
    project: item.project || 'General',
    dueHint: item.dueHint,
    completed: false,
    completedAt: null,
    createdAt,
    updatedAt: createdAt,
  }));

  const merged = [...remaining, ...newTasks];
  writeTaskStore({ version: 1, tasks: merged });
  return newTasks;
}

function listTasks(options = {}) {
  const { includeCompleted = false, accountKey } = options;
  const store = readTaskStore();

  return store.tasks
    .filter((task) => (includeCompleted ? true : !task.completed))
    .filter((task) => (accountKey ? task.accountKey === accountKey : true))
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

function getTaskById(taskId) {
  return readTaskStore().tasks.find((task) => task.id === taskId) || null;
}

function completeTasksForNotification(accountKey, emailId, options = {}) {
  const store = readTaskStore();
  const now = new Date().toISOString();
  let updated = 0;

  for (const task of store.tasks) {
    if (task.accountKey !== accountKey || task.emailId !== emailId || task.completed) {
      continue;
    }

    task.completed = true;
    task.completedAt = now;
    task.updatedAt = now;
    if (options.markAutoPilot) {
      task.autoPiloted = true;
    }
    updated += 1;
  }

  if (updated > 0) {
    writeTaskStore(store);
  }

  return updated;
}

async function toggleTaskComplete(taskId, options = {}) {
  const archiveSource = options.archiveSource !== false;
  const store = readTaskStore();
  const task = store.tasks.find((item) => item.id === taskId);

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const nextCompleted = !task.completed;
  task.completed = nextCompleted;
  task.completedAt = nextCompleted ? new Date().toISOString() : null;
  task.updatedAt = new Date().toISOString();

  writeTaskStore(store);

  let archived = false;
  let archiveError = null;

  if (nextCompleted && archiveSource && task.emailId) {
    try {
      const notifications = (await readNotifications(task.accountKey)).filter(
        (item) => item.id === task.emailId,
      );
      const archiveResult = await archiveMessages(
        task.accountKey,
        [task.emailId],
        notifications,
      );
      archived = archiveResult.archived > 0;
      if (archived) {
        await removeNotificationIds(task.accountKey, [task.emailId]);
      }
    } catch (error) {
      archiveError =
        error instanceof Error ? error.message : 'Failed to archive source email.';
    }
  }

  return {
    task,
    archived,
    archiveError,
  };
}

module.exports = {
  TASKS_PATH,
  inferProject,
  syncTasksFromTriage,
  listTasks,
  getTaskById,
  completeTasksForNotification,
  toggleTaskComplete,
};
