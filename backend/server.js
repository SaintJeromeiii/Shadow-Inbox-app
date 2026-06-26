#!/usr/bin/env node
/**
 * Cloud entrypoint for Shadow Inbox backend.
 * Binds to process.env.PORT (cloud) or 3000 (local fallback).
 */

require('dotenv').config();

const { startServer } = require('../scripts/emailRelay');

function isCloudRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      (process.env.PORT && !process.env.EMAIL_RELAY_PORT),
  );
}

startServer();

if (isCloudRuntime()) {
  console.log('[Server] Starting cloud inbox poller (every 2 minutes).');
  require('../scripts/fetchDaemon');
}
