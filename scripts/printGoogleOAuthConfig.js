#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

require('dotenv').config();

const PACKAGE_NAME = 'com.saintjeromeiii.shadowinbox';
const PROJECT_KEYSTORE = path.join(__dirname, '../android/app/debug.keystore');
const DEFAULT_KEYSTORE = path.join(
  process.env.HOME || '',
  '.android/debug.keystore',
);

function readSha1(keystorePath) {
  try {
    const output = execSync(
      `keytool -list -v -keystore "${keystorePath}" -alias androiddebugkey -storepass android -keypass android`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const match = output.match(/SHA1:\s*([0-9A-F:]+)/i);
    return match ? match[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

const projectSha1 = readSha1(PROJECT_KEYSTORE);
const defaultSha1 = readSha1(DEFAULT_KEYSTORE);
const webClientId = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();
const androidClientId = (process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '').trim();

console.log('\nShadow Inbox — Google OAuth setup checklist\n');
console.log(`Package name (Android OAuth client): ${PACKAGE_NAME}`);
console.log('\nSHA-1 fingerprints:');
console.log(`  Project debug keystore (USE THIS for local APK builds):`);
console.log(`    ${projectSha1 || 'not found'}`);
console.log(`  Default ~/.android/debug.keystore (usually NOT used by this app):`);
console.log(`    ${defaultSha1 || 'not found'}`);

console.log('\nOAuth client IDs from .env:');
console.log(`  Android: ${androidClientId || '(missing)'}`);
console.log(`  Web:     ${webClientId || '(missing)'}`);

console.log('\nGoogle Cloud Console steps to fix DEVELOPER_ERROR:');
console.log('  1. APIs & Services → Credentials');
console.log('  2. Open your Android OAuth client (or create one)');
console.log(`  3. Package name: ${PACKAGE_NAME}`);
console.log(`  4. SHA-1: ${projectSha1 || '<run keytool on android/app/debug.keystore>'}`);
console.log('  5. Confirm Web client ID in .env matches a "Web application" client');
console.log('  6. Both clients must be in the SAME Google Cloud project');
console.log('  7. OAuth consent screen → add every Gmail you sign in with as Test users');
console.log('  8. Wait 5–10 minutes after saving, then reinstall the debug APK\n');
