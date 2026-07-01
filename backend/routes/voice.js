const express = require('express');
const multer = require('multer');
const { resolveAccountKey } = require('../accounts');
const { ingestVoiceNote } = require('../voiceNoteService');
const { consumeAiQuota, handleQuotaHttpError } = require('../aiUsageService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

const router = express.Router();

router.post('/ingest', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      res.status(400).json({ error: 'Missing audio file upload ("audio" field).' });
      return;
    }

    const accountKey = resolveAccountKey(
      req.headers['x-account-key'] || req.body?.accountKey || 'personal',
    );

    await consumeAiQuota(accountKey, 'llm', 1);

    const result = await ingestVoiceNote({
      accountKey,
      audioBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalFilename: req.file.originalname,
    });

    res.json({
      success: true,
      message: result.message,
      voiceNote: {
        id: result.voiceNote.id,
        category: result.voiceNote.category,
        project: result.voiceNote.project,
        summary: result.voiceNote.summary,
        transcript: result.transcript,
        structuredData: result.voiceNote.structuredData,
        routedTo: result.voiceNote.routedTo,
      },
    });
  } catch (error) {
    if (handleQuotaHttpError(res, error)) return;

    console.error('[VoiceIngest] Failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Voice note ingestion failed.',
    });
  }
});

module.exports = router;
