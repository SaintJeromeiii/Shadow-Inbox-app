#!/usr/bin/env node
/**
 * Local SMTP relay for Shadow Inbox.
 * Listens on port 3000 and sends replies via nodemailer.
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * Usage:
 *   npm run email-relay
 */

require('dotenv').config();

const os = require('os');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.EMAIL_RELAY_PORT || 3000);
const HOST = process.env.EMAIL_RELAY_HOST || '0.0.0.0';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

requireEnv('SMTP_HOST', SMTP_HOST);
requireEnv('SMTP_USER', SMTP_USER);
requireEnv('SMTP_PASS', SMTP_PASS);

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'shadow-inbox-email-relay' });
});

app.post('/send-reply', async (req, res) => {
  const { recipient, subject, replyText } = req.body ?? {};

  if (!recipient || typeof recipient !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "recipient" field.' });
    return;
  }

  if (!subject || typeof subject !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "subject" field.' });
    return;
  }

  if (!replyText || typeof replyText !== 'string' || !replyText.trim()) {
    res.status(400).json({ error: 'Missing or invalid "replyText" field.' });
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(recipient.trim())) {
    res.status(400).json({ error: 'Recipient is not a valid email address.' });
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_USER,
      to: recipient.trim(),
      subject: subject.trim(),
      text: replyText.trim(),
    });

    console.log(`Sent reply to ${recipient} (messageId: ${info.messageId})`);
    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('SMTP send failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'SMTP send failed.',
    });
  }
});

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, HOST, () => {
  const lanIp = getLanAddress();
  console.log(`Shadow Inbox email relay listening on http://${HOST}:${PORT}`);
  console.log(`Local:  http://localhost:${PORT}`);
  console.log(`Phone:  http://${lanIp}:${PORT}  (set EXPO_PUBLIC_EMAIL_RELAY_URL to this)`);
  console.log(`SMTP:   ${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other relay process and retry.`);
  } else {
    console.error('Email relay failed to start:', error);
  }
  process.exit(1);
});
