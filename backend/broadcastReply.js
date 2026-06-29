const nodemailer = require('nodemailer');
const { getAccount, resolveAccountKey } = require('./accounts');
const { getOAuthAccount } = require('./userTokens');
const { getValidAccessToken } = require('./googleOAuth');
const { readNotifications } = require('./notificationFeed');
const { sendGmailMessage, resolveGmailMessageId } = require('./gmailApi');

function parseRecipientEmail(sender) {
  const angleMatch = String(sender || '').match(/<([^>]+@[^>]+)>/);
  if (angleMatch) return angleMatch[1].trim();
  const emailMatch = String(sender || '').match(/[\w.+-]+@[\w.-]+\.\w+/);
  return emailMatch?.[0] ?? null;
}

function parseSubject(rawText) {
  const match = String(rawText || '').match(/^Subject:\s*(.+)$/m);
  return match?.[1]?.trim() || 'Shadow Inbox Reply';
}

function buildReplySubject(rawText) {
  const original = parseSubject(rawText);
  return /^re:/i.test(original) ? original : `Re: ${original}`;
}

async function createEmailTransporter(accountKey) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account) {
    throw new Error(`Unknown account key: ${accountKey}`);
  }

  if (account.oauth) {
    const oauthRecord = getOAuthAccount(account.key);
    const accessToken = await getValidAccessToken(account.key);

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: account.email,
        clientId: process.env.GOOGLE_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        refreshToken: oauthRecord?.refreshToken,
        accessToken,
      },
    });
  }

  const { user, pass, host, port } = account.smtp;
  if (!user || !pass) {
    throw new Error(`SMTP credentials are not configured for account "${account.key}".`);
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendEmailReply(accountKey, notification, replyText) {
  const recipient = parseRecipientEmail(notification.sender);
  if (!recipient) {
    throw new Error('Could not parse a recipient email from this notification.');
  }

  const account = getAccount(resolveAccountKey(accountKey));
  const subject = buildReplySubject(notification.rawText);
  const trimmed = replyText.trim();

  if (account.oauth) {
    let gmailApiMessageId = notification.gmailApiMessageId || null;
    if (!gmailApiMessageId) {
      gmailApiMessageId = await resolveGmailMessageId(accountKey, {
        messageIdHeader: notification.messageIdHeader,
        subject: parseSubject(notification.rawText),
        timestamp: notification.timestamp,
      });
    }

    const result = await sendGmailMessage(accountKey, {
      to: recipient,
      subject,
      body: trimmed,
      inReplyTo: notification.messageIdHeader,
      gmailApiMessageId,
    });

    return {
      platform: 'email',
      messageId: result.id,
      threadId: result.threadId || null,
      transport: 'gmail_api',
    };
  }

  const transporter = await createEmailTransporter(accountKey);
  const info = await transporter.sendMail({
    from: account.smtp.user || account.email,
    to: recipient,
    subject,
    text: trimmed,
  });

  return {
    platform: 'email',
    messageId: info.messageId,
    transport: 'smtp',
  };
}

async function sendSlackReply(notification, replyText) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    throw new Error('SLACK_BOT_TOKEN is not configured on the relay.');
  }

  const target = notification.replyTarget;
  if (!target?.channelId) {
    throw new Error('Missing Slack channel target on this notification.');
  }

  const body = {
    channel: target.channelId,
    text: replyText.trim(),
  };

  if (target.threadId) {
    body.thread_ts = target.threadId;
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Slack chat.postMessage failed.');
  }

  return {
    platform: 'slack',
    messageId: payload.ts,
    channel: payload.channel,
  };
}

async function sendDiscordReply(notification, replyText) {
  const target = notification.replyTarget;
  if (!target?.channelId) {
    throw new Error('Missing Discord channel target on this notification.');
  }

  if (target.webhookUrl) {
    const response = await fetch(target.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: replyText.trim(),
        username: 'Shadow Inbox',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Discord webhook failed (${response.status})`);
    }

    return { platform: 'discord', messageId: null };
  }

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN is not configured on the relay.');
  }

  const body = { content: replyText.trim() };
  if (target.messageId) {
    body.message_reference = {
      message_id: target.messageId,
      fail_if_not_exists: false,
    };
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${encodeURIComponent(target.channelId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `Discord API failed (${response.status})`);
  }

  return {
    platform: 'discord',
    messageId: payload.id,
  };
}

async function sendBroadcastReply(accountKey, notification, replyText) {
  const trimmed = String(replyText || '').trim();
  if (!trimmed) {
    throw new Error('Reply text cannot be empty.');
  }

  if (notification.sourceApp === 'Slack' || notification.replyTarget?.platform === 'slack') {
    return sendSlackReply(notification, trimmed);
  }

  if (notification.sourceApp === 'Discord' || notification.replyTarget?.platform === 'discord') {
    return sendDiscordReply(notification, trimmed);
  }

  if (notification.sourceApp === 'Email') {
    return sendEmailReply(accountKey, notification, trimmed);
  }

  throw new Error(`Unsupported notification source: ${notification.sourceApp}`);
}

async function findNotificationById(accountKey, notificationId) {
  const notifications = await readNotifications(accountKey);
  return notifications.find((item) => item.id === notificationId) || null;
}

module.exports = {
  sendBroadcastReply,
  findNotificationById,
};
