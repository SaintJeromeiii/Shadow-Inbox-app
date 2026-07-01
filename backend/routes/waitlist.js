const express = require('express');
const fs = require('fs');
const path = require('path');
const { getSupabase } = require('../supabaseClient');

const router = express.Router();
const LOCAL_PATH = path.join(__dirname, '..', 'data', 'waitlist_signups.json');

function readLocalSignups() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalSignups(signups) {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  fs.writeFileSync(LOCAL_PATH, `${JSON.stringify(signups, null, 2)}\n`, 'utf8');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

router.post('/signup', async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  try {
    const supabase = getSupabase();

    if (supabase) {
      const { error } = await supabase.from('waitlist_signups').upsert(
        {
          email,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'email' },
      );

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const signups = readLocalSignups();
      if (!signups.some((entry) => entry.email === email)) {
        signups.push({ email, created_at: new Date().toISOString() });
        writeLocalSignups(signups);
      }
    }

    res.json({ success: true, email });
  } catch (error) {
    console.error('[Waitlist] signup failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Could not join waitlist.',
    });
  }
});

module.exports = router;
