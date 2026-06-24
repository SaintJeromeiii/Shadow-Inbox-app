#!/usr/bin/env node
/**
 * Background daemon that polls Gmail via fetchNotifications.js every 2 minutes.
 *
 * Usage:
 *   node scripts/fetchDaemon.js
 *   npm run dev:backend
 */

require('dotenv').config();

const cron = require('node-cron');
const { fetchNotifications } = require('./fetchNotifications');

const POLL_INTERVAL_CRON = '*/2 * * * *';
let isRunning = false;

function formatTimestamp() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function runCheck(trigger = 'scheduled') {
  if (isRunning) {
    console.log(`[Daemon] Skipping ${trigger} check — previous fetch still in progress.`);
    return;
  }

  isRunning = true;
  console.log(`[Daemon] Checking Gmail... (${formatTimestamp()})`);

  try {
    const stats = await fetchNotifications({ silent: true });
    const updateLabel = stats.newCount === 1 ? 'update' : 'updates';

    console.log(
      `[Daemon] Found ${stats.unreadTotal} unread — ${stats.newCount} new ${updateLabel}, ${stats.writtenCount} total in feed.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Daemon] Fetch failed: ${message}`);
  } finally {
    isRunning = false;
  }
}

console.log('[Daemon] Gmail fetch daemon started (every 2 minutes).');
void runCheck('startup');

cron.schedule(POLL_INTERVAL_CRON, () => {
  void runCheck('scheduled');
});

process.on('SIGINT', () => {
  console.log('\n[Daemon] Shutting down.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Daemon] Shutting down.');
  process.exit(0);
});
