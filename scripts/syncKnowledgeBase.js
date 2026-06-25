#!/usr/bin/env node
/**
 * Syncs backend/knowledgebase.txt into the React Native bundle.
 * Run automatically before dev server / backend scripts, or manually:
 *   node scripts/syncKnowledgeBase.js
 */

const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '../backend/knowledgebase.txt');
const destPath = path.join(__dirname, '../src/data/knowledgeBaseContent.ts');

const content = fs.readFileSync(sourcePath, 'utf8').trim();
const output = `// Auto-generated from backend/knowledgebase.txt — edit that file, then run: npm run sync:knowledge-base

export const KNOWLEDGE_BASE_CONTENT = ${JSON.stringify(content)};
`;

fs.writeFileSync(destPath, output, 'utf8');
console.log(`[KnowledgeBase] Synced ${sourcePath} → ${destPath}`);
