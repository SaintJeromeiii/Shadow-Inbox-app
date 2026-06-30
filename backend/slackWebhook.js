const crypto = require('crypto');
const { resolveAccountKey } = require('./accounts');
const { normalizeFromSlackEvent } = require('./platformIngest');
const { ingestPlatformMessages } = require('./chatIngestService');
const { processInboundWebhook } = require('./inboundWebhookGuard');

function parseAccountMap() {
  try {
    const raw = process.env.BROADCAST_ACCOUNT_MAP || '{}';
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveAccountForSlackTeam(teamId) {
  const map = parseAccountMap();
  return resolveAccountKey(map[teamId] || process.env.BROADCAST_DEFAULT_ACCOUNT_KEY || 'personal');
}

function verifySlackSignature(req) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 60 * 5) return false;

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));
  const base = `v0:${timestamp}:${rawBody.toString('utf8')}`;
  const digest = `v0=${crypto.createHmac('sha256', signingSecret).update(base).digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function handleSlackWebhook(req, res) {
  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    payload = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: 'Invalid Slack payload.' });
    return;
  }

  if (payload.type === 'url_verification') {
    res.json({ challenge: payload.challenge });
    return;
  }

  if (!verifySlackSignature(req)) {
    res.status(401).json({ error: 'Invalid Slack signature.' });
    return;
  }

  if (payload.type !== 'event_callback') {
    res.json({ ok: true, ignored: payload.type });
    return;
  }

  const event = payload.event;
  const normalized = normalizeFromSlackEvent(event, {
    team_id: payload.team_id,
    channel_name: event?.channel_name,
    user_name: event?.user,
  });

  if (!normalized) {
    res.json({ ok: true, ignored: true });
    return;
  }

  try {
    const accountKey = resolveAccountForSlackTeam(payload.team_id);
    const result = await processInboundWebhook(normalized.id, accountKey, async () =>
      ingestPlatformMessages(accountKey, [normalized]),
    );
    console.log(
      `[Broadcast][Slack] Ingested ${result.ingested ?? 0} message(s) into ${accountKey} feed.`,
    );
    res.json({ ok: true, ...result, accountKey });
  } catch (error) {
    console.error('[Broadcast][Slack] Ingest failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Slack ingest failed.',
    });
  }
}

module.exports = {
  handleSlackWebhook,
  resolveAccountForSlackTeam,
};
