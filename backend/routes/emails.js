const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const { resolveAccountKey } = require('../accounts');
const { processVoiceCommand } = require('../voiceCommandService');

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.m4a';
      cb(null, `shadow-voice-${Date.now()}${ext}`);
    },
  }),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

const router = express.Router();

function cleanupUploadedFile(filePath) {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
}

router.post('/voice-command', upload.single('audio'), async (req, res) => {
  const uploadedPath = req.file?.path;

  try {
    const emailId = req.body?.emailId || req.body?.id;
    const originalMessage = req.body?.originalMessage || req.body?.originalText || '';
    const currentDraft = req.body?.currentDraft || '';

    if (!emailId || typeof emailId !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "emailId" field.' });
      return;
    }

    if (!currentDraft || typeof currentDraft !== 'string' || !currentDraft.trim()) {
      res.status(400).json({ error: 'Missing or invalid "currentDraft" field.' });
      return;
    }

    if (!uploadedPath) {
      res.status(400).json({ error: 'Missing audio file upload ("audio" field).' });
      return;
    }

    const accountKey = resolveAccountKey(
      req.headers['x-account-key'] || req.body?.accountKey || 'personal',
    );

    const result = await processVoiceCommand({
      accountKey,
      emailId,
      originalMessage,
      currentDraft,
      audioFilePath: uploadedPath,
      mimeType: req.file?.mimetype,
    });

    res.json({
      success: true,
      draft: result.draft,
      transcription: result.transcription,
      mode: result.mode,
      memoryContext: result.memoryContext,
    });
  } catch (error) {
    console.error('[VoiceCommand] Failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Voice command processing failed.',
    });
  } finally {
    cleanupUploadedFile(uploadedPath);
  }
});

module.exports = router;
