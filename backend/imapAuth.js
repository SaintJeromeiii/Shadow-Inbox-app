const Imap = require('imap');
const { getAccount, resolveAccountKey } = require('./accounts');
const { getValidAccessToken } = require('./googleOAuth');

async function getImapConfigForAccount(accountKey) {
  const account = getAccount(resolveAccountKey(accountKey));
  if (!account) {
    throw new Error(`Unknown account key: ${accountKey}`);
  }

  if (account.oauth) {
    const accessToken = await getValidAccessToken(account.key);
    return {
      user: account.email,
      xoauth2: accessToken,
      host: account.imap.host || 'imap.gmail.com',
      port: account.imap.port || 993,
    };
  }

  const { user, password, host, port } = account.imap;
  if (!user || !password) {
    throw new Error(`IMAP credentials are not configured for account "${account.key}".`);
  }

  return { user, password, host, port };
}

function createImapConnection(config) {
  const options = {
    user: config.user,
    host: config.host,
    port: config.port,
    tls: config.port === 993,
    tlsOptions: { rejectUnauthorized: false },
  };

  if (config.xoauth2) {
    options.xoauth2 = config.xoauth2;
  } else {
    options.password = config.password;
  }

  return new Imap(options);
}

function openInbox(config, readOnly = false) {
  return new Promise((resolve, reject) => {
    const imap = createImapConnection(config);

    imap.once('ready', () => {
      imap.openBox('INBOX', readOnly, (error) => {
        if (error) {
          imap.end();
          reject(error);
          return;
        }
        resolve(imap);
      });
    });

    imap.once('error', reject);
    imap.connect();
  });
}

async function withInbox(accountKey, imapAction, readOnly = false) {
  const config = await getImapConfigForAccount(accountKey);

  const imap = await openInbox(config, readOnly);

  try {
    return await imapAction(imap);
  } finally {
    try {
      imap.end();
    } catch {
      // ignore close errors
    }
  }
}

module.exports = {
  getImapConfigForAccount,
  createImapConnection,
  openInbox,
  withInbox,
};
