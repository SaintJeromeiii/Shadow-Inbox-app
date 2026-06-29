const DEFAULT_CHARACTER_ID = 'black_male';

const VALID_CHARACTER_IDS = new Set([
  'black_male',
  'robot_neutral',
  'quantum_neutral',
  'neon_warden',
]);

const LEGACY_CHARACTER_IDS = {
  neon_warden: 'black_male',
};

function resolveCharacterId(raw) {
  const id = String(raw || '').trim();
  if (id in LEGACY_CHARACTER_IDS) {
    return LEGACY_CHARACTER_IDS[id];
  }
  return VALID_CHARACTER_IDS.has(id) ? id : DEFAULT_CHARACTER_ID;
}

function getCharacterIdFromRequest(req) {
  const raw =
    req.headers['x-character-id'] ||
    req.query?.characterId ||
    req.body?.characterId;
  return resolveCharacterId(raw);
}

module.exports = {
  DEFAULT_CHARACTER_ID,
  resolveCharacterId,
  getCharacterIdFromRequest,
};
