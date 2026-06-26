#!/usr/bin/env node
/**
 * Cloud entrypoint for Shadow Inbox backend.
 * Binds to process.env.PORT (cloud) or 3000 (local fallback).
 */

require('dotenv').config();

const { startServer } = require('../scripts/emailRelay');

startServer();
