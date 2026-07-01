const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, 'data', 'openai_circuit_breaker.json');

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function isQuotaError(error) {
  const message = String(error?.message || error || '');
  const code = error?.code || error?.error?.code || error?.status;
  return (
    code === 'insufficient_quota' ||
    code === 429 ||
    /insufficient_quota|exceeded your current quota/i.test(message)
  );
}

function nextUtcMidnightIso() {
  const reset = new Date();
  reset.setUTCDate(reset.getUTCDate() + 1);
  reset.setUTCHours(0, 0, 0, 0);
  return reset.toISOString();
}

function isOpenAiCircuitOpen() {
  const state = readState();
  const trippedUntil = state.trippedUntil ? new Date(state.trippedUntil).getTime() : 0;
  if (!trippedUntil || Number.isNaN(trippedUntil)) {
    return false;
  }

  if (Date.now() >= trippedUntil) {
    writeState({ trippedUntil: null, reason: null });
    return false;
  }

  return true;
}

function tripOpenAiCircuit(error) {
  const trippedUntil = nextUtcMidnightIso();
  writeState({
    trippedUntil,
    reason: error instanceof Error ? error.message : String(error),
    trippedAt: new Date().toISOString(),
  });
  console.warn(
    `[OpenAI] Circuit breaker open until ${trippedUntil} — LLM calls will use fallbacks.`,
  );
}

function recordOpenAiFailure(error) {
  if (!isQuotaError(error)) {
    return false;
  }

  tripOpenAiCircuit(error);
  return true;
}

function getOpenAiCircuitStatus() {
  const state = readState();
  return {
    open: isOpenAiCircuitOpen(),
    trippedUntil: state.trippedUntil ?? null,
    reason: state.reason ?? null,
  };
}

module.exports = {
  isQuotaError,
  isOpenAiCircuitOpen,
  recordOpenAiFailure,
  getOpenAiCircuitStatus,
};
