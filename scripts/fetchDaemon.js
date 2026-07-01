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
const { loadKnowledgeBase } = require('../backend/knowledgeBase');
const { listAccountKeys, getAccount } = require('../backend/accounts');
const { ensureGmailAccessToken } = require('../backend/services/gmailAuth');
const { pollDiscordChannels } = require('../backend/discordPoll');

const knowledgeBase = loadKnowledgeBase();
console.log(
  `[Daemon] Smart Memory loaded (${knowledgeBase.length} chars from backend/knowledgebase.txt)`,
);

const POLL_INTERVAL_CRON = '*/2 * * * *';
let isRunning = false;

function formatTimestamp() {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function refreshOAuthTokensForPolling() {
  for (const accountKey of listAccountKeys()) {
    const account = getAccount(accountKey);
    if (!account?.oauth) {
      continue;
    }

    try {
      await ensureGmailAccessToken(accountKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Daemon][${accountKey}] OAuth refresh failed before poll: ${message}`);
    }
  }
}

async function runCheck(trigger = 'scheduled') {
  if (isRunning) {
    console.log(`[Daemon] Skipping ${trigger} check — previous fetch still in progress.`);
    return;
  }

  isRunning = true;
  console.log(`[Daemon] Checking Gmail... (${formatTimestamp()})`);

  try {
    await refreshOAuthTokensForPolling();

    for (const accountKey of listAccountKeys()) {
      const stats = await fetchNotifications({ accountKey, silent: true });
      const updateLabel = stats.newCount === 1 ? 'update' : 'updates';

      console.log(
        `[Daemon][${accountKey}] ${stats.unreadTotal} unread — ${stats.newCount} new ${updateLabel}, ${stats.writtenCount} in feed.`,
      );
    }

    const discordStats = await pollDiscordChannels();
    if (discordStats.polled > 0) {
      console.log(
        `[Daemon][Discord] Polled ${discordStats.polled} channel(s) — ${discordStats.ingested} new message(s).`,
      );
    }
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
