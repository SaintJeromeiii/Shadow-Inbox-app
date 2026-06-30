const { resolveAccountKey } = require('./accounts');
const { normalizeFromDiscordMessage } = require('./platformIngest');
const { ingestPlatformMessages } = require('./chatIngestService');
const { ingestPlatformMessagesWithIdempotency } = require('./inboundWebhookGuard');

const seenMessageIds = new Set();
const MAX_SEEN = 500;

function rememberMessageId(id) {
  seenMessageIds.add(id);
  if (seenMessageIds.size > MAX_SEEN) {
    const oldest = seenMessageIds.values().next().value;
    seenMessageIds.delete(oldest);
  }
}

function parseDiscordChannels() {
  const raw = process.env.DISCORD_CHANNEL_IDS || '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function fetchDiscordChannelMessages(channelId, token) {
  const response = await fetch(
    `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages?limit=10`,
    {
      headers: {
        Authorization: `Bot ${token}`,
      },
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `Discord fetch failed (${response.status})`);
  }

  return Array.isArray(payload) ? payload : [];
}

async function pollDiscordChannels() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const channels = parseDiscordChannels();

  if (!token || channels.length === 0) {
    return { polled: 0, ingested: 0 };
  }

  const accountKey = resolveAccountKey(
    process.env.BROADCAST_DEFAULT_ACCOUNT_KEY || 'personal',
  );
  const guildId = process.env.DISCORD_GUILD_ID || null;

  let ingested = 0;

  for (const channelId of channels) {
    try {
      const messages = await fetchDiscordChannelMessages(channelId, token);
      const normalized = [];

      for (const message of messages) {
        if (seenMessageIds.has(message.id)) continue;
        const item = normalizeFromDiscordMessage(message, {
          guildId,
          channelName: `#${channelId}`,
        });
        if (item) {
          normalized.push(item);
          rememberMessageId(message.id);
        }
      }

      if (normalized.length > 0) {
        const result = await ingestPlatformMessagesWithIdempotency(
          accountKey,
          normalized,
          ingestPlatformMessages,
        );
        ingested += result.ingested;
      }
    } catch (error) {
      console.warn(
        `[Broadcast][Discord] Poll failed for channel ${channelId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (ingested > 0) {
    console.log(`[Broadcast][Discord] Ingested ${ingested} new message(s).`);
  }

  return { polled: channels.length, ingested };
}

module.exports = {
  pollDiscordChannels,
};
