function slackTsToId(ts) {
  return String(ts || '').replace('.', '');
}

function buildRawText({ channelName, subject, body, platform }) {
  const channelLine = channelName ? `Channel: ${channelName}` : null;
  const subjectLine = subject && subject !== channelName ? `Subject: ${subject}` : null;
  const header = [channelLine, subjectLine].filter(Boolean).join('\n');
  const platformTag = platform ? `[${platform}]` : '';
  if (header) {
    return `${header}\n\n${body || '(empty message)'}`.trim();
  }
  return `${platformTag}\n\n${body || '(empty message)'}`.trim();
}

function normalizeFromSlackEvent(event, context = {}) {
  if (!event || event.type !== 'message') return null;
  if (event.subtype && event.subtype !== 'file_share') return null;
  if (event.bot_id && !event.user) return null;

  const teamId = context.team_id || event.team || '';
  const channelId = event.channel || '';
  const ts = event.ts || event.event_ts;
  if (!channelId || !ts) return null;

  const channelName = context.channel_name || event.channel_name || `#${channelId}`;
  const userName = context.user_name || event.user_profile?.display_name || event.user || 'Slack user';
  const text = String(event.text || '').trim();
  if (!text) return null;

  const threadId = event.thread_ts && event.thread_ts !== ts ? event.thread_ts : ts;

  return {
    id: `slack-${teamId}-${channelId}-${slackTsToId(ts)}`,
    sourceApp: 'Slack',
    sender: `${userName} · ${channelName}`,
    rawText: buildRawText({ channelName, body: text, platform: 'Slack' }),
    timestamp: new Date(Number(ts) * 1000).toISOString(),
    channelName,
    replyTarget: {
      platform: 'slack',
      channelId,
      threadId,
      teamId: teamId || null,
      messageId: ts,
    },
  };
}

function normalizeFromDiscordMessage(message, context = {}) {
  if (!message?.id || !message?.channel_id) return null;
  if (message.author?.bot) return null;

  const channelId = message.channel_id;
  const guildId = message.guild_id || context.guildId || null;
  const channelName = context.channelName || `#${channelId}`;
  const author =
    message.author?.global_name ||
    message.author?.username ||
    'Discord user';
  const text = String(message.content || '').trim();
  if (!text) return null;

  return {
    id: `discord-${channelId}-${message.id}`,
    sourceApp: 'Discord',
    sender: `${author} · ${channelName}`,
    rawText: buildRawText({ channelName, body: text, platform: 'Discord' }),
    timestamp: message.timestamp || new Date().toISOString(),
    channelName,
    replyTarget: {
      platform: 'discord',
      channelId,
      threadId: message.reference?.message_id || message.id,
      guildId,
      messageId: message.id,
    },
  };
}

function normalizeFromIngestPayload(payload = {}) {
  const platform = String(payload.platform || payload.sourceApp || '').toLowerCase();
  const body = String(payload.body || payload.text || payload.message || '').trim();
  if (!body) return null;

  const channelId = payload.channelId || payload.channel_id || 'unknown';
  const channelName = payload.channelName || payload.channel || payload.subject || `#${channelId}`;
  const sender = payload.sender || payload.user || `${platform} user`;
  const timestamp = payload.timestamp || new Date().toISOString();
  const messageId = payload.messageId || payload.message_id || Date.now().toString();

  if (platform === 'slack') {
    const teamId = payload.teamId || payload.team_id || '';
    const ts = payload.threadId || payload.thread_ts || payload.ts || messageId;
    return {
      id: payload.id || `slack-${teamId}-${channelId}-${slackTsToId(ts)}`,
      sourceApp: 'Slack',
      sender,
      rawText: buildRawText({ channelName, subject: payload.subject, body, platform: 'Slack' }),
      timestamp,
      channelName,
      replyTarget: {
        platform: 'slack',
        channelId,
        threadId: ts,
        teamId: teamId || null,
        messageId: ts,
        webhookUrl: payload.webhookUrl || null,
      },
    };
  }

  if (platform === 'discord') {
    return {
      id: payload.id || `discord-${channelId}-${messageId}`,
      sourceApp: 'Discord',
      sender,
      rawText: buildRawText({ channelName, subject: payload.subject, body, platform: 'Discord' }),
      timestamp,
      channelName,
      replyTarget: {
        platform: 'discord',
        channelId,
        threadId: payload.threadId || messageId,
        guildId: payload.guildId || payload.guild_id || null,
        messageId,
        webhookUrl: payload.webhookUrl || null,
      },
    };
  }

  return null;
}

module.exports = {
  buildRawText,
  normalizeFromSlackEvent,
  normalizeFromDiscordMessage,
  normalizeFromIngestPayload,
};
