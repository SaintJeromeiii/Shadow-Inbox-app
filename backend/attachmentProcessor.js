const pdfParse = require('pdf-parse');

const SUPPORTED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const SUPPORTED_PDF_MIME = 'application/pdf';
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_PDF_TEXT_CHARS = 12_000;
const MAX_IMAGES_FOR_TRIAGE = 2;
const MAX_PDFS_FOR_TRIAGE = 2;

function normalizeMimeType(mimeType) {
  return String(mimeType || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
}

function isSupportedImageMime(mimeType) {
  return SUPPORTED_IMAGE_MIMES.has(normalizeMimeType(mimeType));
}

function isSupportedPdfMime(mimeType) {
  return normalizeMimeType(mimeType) === SUPPORTED_PDF_MIME;
}

function isSupportedAttachmentMime(mimeType) {
  return isSupportedImageMime(mimeType) || isSupportedPdfMime(mimeType);
}

function bufferFromContent(content) {
  if (!content) return null;
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content === 'string') return Buffer.from(content, 'base64');
  return null;
}

function processImageBuffer(buffer, mimeType, filename = 'image') {
  const normalized = normalizeMimeType(mimeType);
  if (!SUPPORTED_IMAGE_MIMES.has(normalized)) {
    return null;
  }

  if (!buffer || buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
    return null;
  }

  const resolvedMime = normalized === 'image/jpg' ? 'image/jpeg' : normalized;

  return {
    kind: 'image',
    filename,
    mimeType: resolvedMime,
    base64: buffer.toString('base64'),
  };
}

async function processPdfBuffer(buffer, filename = 'document.pdf') {
  if (!buffer || buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
    return null;
  }

  try {
    const parsed = await pdfParse(buffer);
    const extracted = String(parsed.text || '').replace(/\s+\n/g, '\n').trim();

    if (!extracted) {
      return {
        kind: 'pdf',
        filename,
        text:
          '(Image-only or scanned PDF with no extractable text. Treat as a visual attachment the sender expects Jerome to review.)',
        imageOnly: true,
      };
    }

    return {
      kind: 'pdf',
      filename,
      text: extracted.slice(0, MAX_PDF_TEXT_CHARS),
      imageOnly: false,
    };
  } catch (error) {
    return {
      kind: 'pdf',
      filename,
      text: `(Could not parse PDF "${filename}": ${error instanceof Error ? error.message : 'unknown error'})`,
      imageOnly: true,
    };
  }
}

function buildAttachmentScanInfo(items) {
  const hasImage = items.some((item) => item.kind === 'image');
  const hasPdf = items.some((item) => item.kind === 'pdf');
  const labels = [];

  if (hasImage) labels.push('Image Attached');
  if (hasPdf) labels.push('PDF Scanned');

  if (labels.length === 0) {
    return null;
  }

  return { hasImage, hasPdf, labels };
}

async function processRawAttachments(rawAttachments = []) {
  const processed = [];
  const seen = new Set();

  for (const raw of rawAttachments) {
    const mimeType = normalizeMimeType(raw.mimeType);
    const filename = raw.filename || raw.name || 'attachment';
    const dedupeKey = `${mimeType}:${filename}:${raw.size || ''}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const buffer = bufferFromContent(raw.content || raw.data);
    if (!buffer) continue;

    if (isSupportedImageMime(mimeType) && processed.filter((i) => i.kind === 'image').length < MAX_IMAGES_FOR_TRIAGE) {
      const image = processImageBuffer(buffer, mimeType, filename);
      if (image) processed.push(image);
      continue;
    }

    if (isSupportedPdfMime(mimeType) && processed.filter((i) => i.kind === 'pdf').length < MAX_PDFS_FOR_TRIAGE) {
      const pdf = await processPdfBuffer(buffer, filename);
      if (pdf) processed.push(pdf);
    }
  }

  return {
    items: processed,
    scanInfo: buildAttachmentScanInfo(processed),
    images: processed.filter((item) => item.kind === 'image'),
    pdfs: processed.filter((item) => item.kind === 'pdf'),
  };
}

module.exports = {
  SUPPORTED_IMAGE_MIMES,
  SUPPORTED_PDF_MIME,
  MAX_ATTACHMENT_BYTES,
  normalizeMimeType,
  isSupportedAttachmentMime,
  isSupportedImageMime,
  isSupportedPdfMime,
  processImageBuffer,
  processPdfBuffer,
  buildAttachmentScanInfo,
  processRawAttachments,
};
