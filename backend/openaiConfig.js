const API_KEY = process.env.OPENAI_API_KEY || '';
const API_URL =
  process.env.LLM_API_URL ||
  process.env.OPENAI_API_URL ||
  'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

module.exports = {
  API_KEY,
  API_URL,
  MODEL,
};
