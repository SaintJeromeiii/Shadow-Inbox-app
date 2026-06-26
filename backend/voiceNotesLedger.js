const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSupabase } = require('./supabaseClient');

const NOTES_PATH = path.join(__dirname, 'data', 'voice_notes.json');

function readNotesFromFile() {
  try {
    const raw = fs.readFileSync(NOTES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed?.version || 1,
      notes: Array.isArray(parsed?.notes) ? parsed.notes : [],
    };
  } catch {
    return { version: 1, notes: [] };
  }
}

function writeNotesToFile(store) {
  fs.mkdirSync(path.dirname(NOTES_PATH), { recursive: true });
  fs.writeFileSync(NOTES_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function buildVoiceNoteId() {
  return `vn_${crypto.randomBytes(4).toString('hex')}`;
}

function rowToNote(row) {
  return {
    id: row.id,
    accountKey: row.account_key,
    category: row.category,
    project: row.project,
    summary: row.summary,
    transcript: row.transcript,
    structuredData: row.structured_data || {},
    routedTo: row.routed_to,
    createdAt: row.created_at,
  };
}

function noteToRow(note) {
  return {
    id: note.id,
    account_key: note.accountKey,
    category: note.category,
    project: note.project,
    summary: note.summary,
    transcript: note.transcript,
    structured_data: note.structuredData || {},
    routed_to: note.routedTo,
    created_at: note.createdAt,
  };
}

async function appendVoiceNote(input) {
  const now = new Date().toISOString();
  const note = {
    id: input.id || buildVoiceNoteId(),
    accountKey: input.accountKey || 'personal',
    category: String(input.category || 'Note').trim(),
    project: String(input.project || 'General').trim(),
    summary: String(input.summary || '').trim(),
    transcript: String(input.transcript || '').trim(),
    structuredData: input.structuredData || {},
    routedTo: input.routedTo || null,
    createdAt: now,
  };

  const supabase = getSupabase();

  if (supabase) {
    const { error } = await supabase.from('voice_notes').insert(noteToRow(note));

    if (error) {
      throw new Error(`Failed to append voice note: ${error.message}`);
    }

    return note;
  }

  const store = readNotesFromFile();
  store.notes = [note, ...store.notes];
  writeNotesToFile(store);
  return note;
}

module.exports = {
  NOTES_PATH,
  buildVoiceNoteId,
  appendVoiceNote,
};
