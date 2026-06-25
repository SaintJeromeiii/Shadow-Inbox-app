const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'src', 'data');

const ACCOUNT_DEFINITIONS = {
  personal: {
    key: 'personal',
    label: 'Personal Account',
    email: process.env.IMAP_USER || 'jleonandersonjr@gmail.com',
    initials: 'JA',
    accentColor: '#5B8DEF',
    feedFile: 'account_personal_notifications.json',
    imapEnvPrefix: '',
    smtpEnvPrefix: '',
  },
  work: {
    key: 'work',
    label: 'Work/Dev Account',
    email: process.env.WORK_IMAP_USER || 'shadowdev@gmail.com',
    initials: 'SD',
    accentColor: '#6EE7A0',
    feedFile: 'account_work_notifications.json',
    imapEnvPrefix: 'WORK_',
    smtpEnvPrefix: 'WORK_',
    mockOnly: !process.env.WORK_IMAP_USER,
  },
};

module.exports = {
  DATA_DIR,
  ACCOUNT_DEFINITIONS,
};
